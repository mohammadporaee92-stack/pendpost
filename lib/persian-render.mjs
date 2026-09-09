import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wrap = (text, n = 28) => { const ws = String(text).split(/\s+/); const lines = []; let line = ''; for (const w of ws) { if (`${line} ${w}`.trim().length > n) { lines.push(line); line = w; } else line = `${line} ${w}`.trim(); } if (line) lines.push(line); return lines; };
function svg({ text, index, total, profile, portrait = false }) {
  const [bg, ink, accent] = profile.brandColors; const width = 1080, height = portrait ? 1920 : 1350;
  const lines = wrap(text, portrait ? 24 : 29);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${index % 2 ? ink : bg}"/><circle cx="920" cy="140" r="180" fill="${accent}" opacity=".18"/><rect x="72" y="90" width="12" height="160" rx="6" fill="${accent}"/><text x="930" y="${height * .39}" direction="rtl" text-anchor="end" fill="${index % 2 ? bg : ink}" font-family="${esc(profile.font)},Tahoma,sans-serif" font-size="72" font-weight="700">${lines.map((l, i) => `<tspan x="930" dy="${i ? 105 : 0}">${esc(l)}</tspan>`).join('')}</text><text x="72" y="${height - 92}" direction="ltr" fill="${accent}" font-family="Arial" font-size="34">${esc(profile.instagramId)}</text><text x="930" y="${height - 92}" text-anchor="end" fill="${index % 2 ? bg : ink}" opacity=".55" font-size="30">${index + 1} / ${total}</text></svg>`;
}
function run(bin, args) { const result = spawnSync(bin, args, { encoding: 'utf8' }); if (result.status !== 0) throw new Error(`${bin} failed: ${result.stderr || result.error?.message}`); }
export function renderCarousel(item, profile, outputRoot, { ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg' } = {}) {
  const dir = path.join(outputRoot, item.id, 'carousel'); fs.mkdirSync(dir, { recursive: true });
  const files = item.slides.slice(0, 8).map((text, i, all) => { const source = path.join(dir, `slide-${i + 1}.svg`); const target = path.join(dir, `slide-${i + 1}.png`); fs.writeFileSync(source, svg({ text, index: i, total: all.length, profile })); run(ffmpeg, ['-y', '-i', source, '-frames:v', '1', target]); return target; });
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify({ id: item.id, format: '1080x1350 PNG', files }, null, 2)}\n`); return files;
}
export function renderReel(item, profile, outputRoot, { ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg', narrationPath = '' } = {}) {
  const dir = path.join(outputRoot, item.id, 'reel'); fs.mkdirSync(dir, { recursive: true }); const frames = reelFrames(item);
  const inputs = []; for (const [i, text] of frames.entries()) { const source = path.join(dir, `scene-${i + 1}.svg`); fs.writeFileSync(source, svg({ text, index: i, total: frames.length, profile, portrait: true })); inputs.push('-loop', '1', '-t', '5', '-i', source); }
  const video = path.join(dir, 'reel.mp4'); const concat = frames.map((_, i) => `[${i}:v]scale=1080:1920,format=yuv420p[v${i}]`).join(';') + `;${frames.map((_, i) => `[v${i}]`).join('')}concat=n=${frames.length}:v=1:a=0[v]`;
  const args = ['-y', ...inputs]; if (narrationPath) args.push('-i', narrationPath); args.push('-filter_complex', concat, '-map', '[v]', ...(narrationPath ? ['-map', `${frames.length}:a`, '-shortest'] : []), '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video); run(ffmpeg, args); return video;
}
export function reelFrames(item) { return [...item.slides]; }
export class NoopTtsProvider { async synthesize() { return null; } }
