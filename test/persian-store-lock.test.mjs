import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { JsonStore } from '../lib/persian-automation.mjs';

const moduleUrl = new URL('../lib/persian-automation.mjs', import.meta.url).href;
const waitFor = async (file) => {
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
const spawnSource = (source) => {
  const child = spawn(process.execPath, ['--input-type=module', '--eval', source]);
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr || `worker exited ${code}`)));
  });
  return { child, done };
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pendpost-lock-'));
const workers = Array.from({ length: 8 }, (_, i) => {
  const source = `import { JsonStore } from ${JSON.stringify(moduleUrl)}; const store = new JsonStore(${JSON.stringify(root)}); for (let n=0;n<20;n++) store.saveItem({id:${JSON.stringify(`worker-${i}`)}, n});`;
  return spawnSource(source).done;
});
await Promise.all(workers);
const items = new JsonStore(root).items();
assert.equal(items.length, 8);
assert.deepEqual(items.map((item) => item.id).sort(), Array.from({ length: 8 }, (_, i) => `worker-${i}`));
assert.ok(items.every((item) => item.n === 19));

const staleStore = new JsonStore(root, { staleLockMs: 1 });
const lock = `${staleStore.file('content')}.lock`;
fs.mkdirSync(lock);
fs.writeFileSync(path.join(lock, 'owner-dead'), 'dead');
fs.utimesSync(path.join(lock, 'owner-dead'), new Date(0), new Date(0));
staleStore.saveItem({ id: 'after-stale-lock' });
assert.ok(staleStore.items().some((item) => item.id === 'after-stale-lock'));
assert.equal(fs.existsSync(lock), false);

const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pendpost-legacy-lock-'));
const legacyStore = new JsonStore(legacyRoot, { staleLockMs: 1 });
const legacyLock = `${legacyStore.file('content')}.lock`;
fs.mkdirSync(legacyRoot, { recursive: true });
fs.writeFileSync(legacyLock, 'legacy-owner');
fs.utimesSync(legacyLock, new Date(0), new Date(0));
legacyStore.saveItem({ id: 'after-legacy-file-lock' });
assert.ok(legacyStore.items().some((item) => item.id === 'after-legacy-file-lock'));
assert.equal(fs.existsSync(legacyLock), false);

const publicationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pendpost-lock-publication-'));
const publicationStore = new JsonStore(publicationRoot);
const publicationLock = `${publicationStore.file('atomic-publication')}.lock`;
const originalRenameSync = fs.renameSync;
let sawCompletePublication = false;
fs.renameSync = (source, destination) => {
  if (destination === publicationLock) {
    assert.equal(fs.readdirSync(source).filter((entry) => entry.startsWith('owner-')).length, 1, 'owner marker must exist before atomic publication');
    sawCompletePublication = true;
  }
  return originalRenameSync(source, destination);
};
try { publicationStore.withLock('atomic-publication', () => assert.equal(fs.readdirSync(publicationLock).length, 1)); }
finally { fs.renameSync = originalRenameSync; }
assert.equal(sawCompletePublication, true);
assert.equal(fs.existsSync(publicationLock), false);

const runOwner = (marker, resume, staleLockMs) => {
  const source = `import fs from 'node:fs'; import { JsonStore } from ${JSON.stringify(moduleUrl)}; const store = new JsonStore(${JSON.stringify(root)}, {staleLockMs:${staleLockMs},lockTimeoutMs:5000}); store.withLock('ownership-race', () => { fs.writeFileSync(${JSON.stringify(marker)}, 'ready'); while (!fs.existsSync(${JSON.stringify(resume)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10); });`;
  return spawnSource(source);
};
const aReady = path.join(root, 'a-ready');
const aResume = path.join(root, 'a-resume');
const bReady = path.join(root, 'b-ready');
const bResume = path.join(root, 'b-resume');
const raceLock = `${new JsonStore(root).file('ownership-race')}.lock`;
const a = runOwner(aReady, aResume, 30000);
await waitFor(aReady);
const [aOwner] = fs.readdirSync(raceLock);
fs.utimesSync(path.join(raceLock, aOwner), new Date(0), new Date(0));
const b = runOwner(bReady, bResume, 1);
await waitFor(bReady);
fs.writeFileSync(aResume, 'resume');
await a.done;
assert.equal(fs.existsSync(raceLock), true, 'resumed stale owner must not delete the replacement owner lock');
assert.equal(fs.readdirSync(raceLock).length, 1);
fs.writeFileSync(bResume, 'resume');
await b.done;
assert.equal(fs.existsSync(raceLock), false);

const reclaimRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pendpost-two-reclaimers-'));
const reclaimStore = new JsonStore(reclaimRoot);
const reclaimLock = `${reclaimStore.file('two-reclaimers')}.lock`;
fs.mkdirSync(reclaimLock, { recursive: true });
fs.writeFileSync(path.join(reclaimLock, 'owner-abandoned'), 'abandoned');
fs.utimesSync(path.join(reclaimLock, 'owner-abandoned'), new Date(0), new Date(0));
const criticalGuard = path.join(reclaimRoot, 'critical.guard');
const reclaimers = Array.from({ length: 2 }, () => {
  const source = `import fs from 'node:fs'; import { JsonStore } from ${JSON.stringify(moduleUrl)}; const store = new JsonStore(${JSON.stringify(reclaimRoot)}, {staleLockMs:1000,lockTimeoutMs:5000}); store.withLock('two-reclaimers', () => { fs.writeFileSync(${JSON.stringify(criticalGuard)}, String(process.pid), {flag:'wx'}); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); fs.unlinkSync(${JSON.stringify(criticalGuard)}); });`;
  return spawnSource(source).done;
});
await Promise.all(reclaimers);
assert.equal(fs.existsSync(criticalGuard), false);
assert.equal(fs.existsSync(reclaimLock), false);

for (const temporaryRoot of [root, legacyRoot, publicationRoot, reclaimRoot]) fs.rmSync(temporaryRoot, { recursive: true, force: true });
console.log('persian JSON store atomic publication, legacy migration, stale recovery, and ownership races: ok');
