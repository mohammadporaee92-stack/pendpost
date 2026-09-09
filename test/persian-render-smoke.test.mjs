import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PROFILE, JsonStore } from '../lib/persian-automation.mjs';
import sharp from 'sharp';
import { rasterizeSvg, renderCarousel, renderReel, reelFrames, sceneSvg } from '../lib/persian-render.mjs';
import { renderAndPersist } from '../lib/persian-workflow.mjs';

const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pendpost-render-')), 'Windows path with spaces');
fs.mkdirSync(root, { recursive: true });
const item = { id: 'rtl', status: 'draft', slides: ['آموزش هوش مصنوعی', 'مرحله دوم', 'نمونه کاربردی', 'تمرین امروز', 'جمع‌بندی', 'ذخیره کنید'] };
for (const [portrait, expectedHeight] of [[false, 1350], [true, 1920]]) { const target = path.join(root, `real-${expectedHeight}.png`); const markup = sceneSvg({ text: 'آموزش کاربردی هوش مصنوعی برای فارسی‌زبانان', index: 0, total: 1, profile: DEFAULT_PROFILE, portrait }); await rasterizeSvg(markup, target); const metadata = await sharp(target).metadata(); assert.equal(metadata.format, 'png'); assert.equal(metadata.width, 1080); assert.equal(metadata.height, expectedHeight); assert.ok(fs.statSync(target).size > 1000); }
const rasterCalls = []; const rasterize = async (markup, target, dimensions) => { rasterCalls.push({ markup, target, dimensions }); fs.writeFileSync(target, Buffer.from('PNG-MOCK')); };
const slides = await renderCarousel(item, DEFAULT_PROFILE, root, { rasterize }); assert.equal(slides.length, 6); assert.deepEqual(rasterCalls[0].dimensions, { width: 1080, height: 1350 }); assert.match(rasterCalls[0].markup, /direction="rtl"/); assert.match(rasterCalls[0].markup, /unicode-bidi="plaintext"/); assert.match(rasterCalls[0].markup, /آموزش هوش مصنوعی/); assert.match(rasterCalls[0].markup, /Vazirmatn/);
let ffmpegArgs; const reel = await renderReel(item, DEFAULT_PROFILE, root, { rasterize, command: (_binary, args) => { ffmpegArgs = args; fs.writeFileSync(args.at(-1), 'MP4-MOCK'); } }); assert.ok(fs.existsSync(reel)); assert.ok(ffmpegArgs.filter((arg) => /scene-\d+\.png$/.test(arg)).length === 6); assert.ok(!ffmpegArgs.some((arg) => arg.endsWith('.svg')), 'FFmpeg never receives SVG input'); assert.deepEqual(rasterCalls.at(-1).dimensions, { width: 1080, height: 1920 });
assert.equal(reelFrames({ slides: Array.from({ length: 9 }, (_, index) => `اسلاید ${index}`) }).length, 9);
for (const [extension, cssFormat] of [['ttf', 'truetype'], ['woff', 'woff'], ['woff2', 'woff2']]) { const font = path.join(root, `Vazirmatn Custom.${extension}`); fs.writeFileSync(font, 'font'); const embedded = sceneSvg({ text: 'حروف فارسی پیوسته', index: 0, total: 1, profile: { ...DEFAULT_PROFILE, fontPath: font } }); assert.match(embedded, /@font-face.*base64/s); assert.match(embedded, new RegExp(`format\\('${cssFormat}'\\)`)); }
const store = new JsonStore(path.join(root, 'state')); const failed = store.saveItem({ id: 'failed', status: 'draft' }); await assert.rejects(() => renderAndPersist({ item: failed, store, renderer: async () => { throw new Error('sharp failed'); }, now: () => new Date('2026-01-01T00:00:00Z') }), /sharp failed/); assert.equal(store.items()[0].status, 'render_failed'); assert.equal(store.items()[0].renderError.message, 'sharp failed');
console.log('persian renderer: PNG rasterization, RTL, Windows paths, FFmpeg PNG inputs, and failure state ok');
