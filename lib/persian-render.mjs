import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wrap = (text, n = 28) => { const ws = String(text).split(/\s+/); const lines = []; let line = ''; for (const w of ws) { if (`${line} ${w}`.trim().length > n) { if (line) lines.push(line); line = w; } else line = `${line} ${w}`.trim(); } if (line) lines.push(line); return lines; };
const FONT_FORMATS = { '.ttf': 'truetype', '.woff': 'woff', '.woff2': 'woff2' };

function embeddedFont(profile) {
  const fontPath = profile.fontPath || (/[\\/]/.test(profile.font || '') ? profile.font : '');
  if (!fontPath) return { family: profile.font || 'Vazirmatn', css: '' };
  const ext = path.extname(fontPath).toLowerCase(); const format = FONT_FORMATS[ext];
  if (!format) throw new Error('font_format_unsupported');
  const family = `PendpostEmbedded-${ext.slice(1)}`;
  const data = fs.readFileSync(fontPath).toString('base64');
  return { family, css: `@font-face{font-family:'${family}';src:url(data:font/${ext === '.ttf' ? 'ttf' : ext.slice(1)};base64,${data}) format('${format}');font-weight:700;font-style:normal}` };
}

function svg({ text, index, total, profile, portrait = false }) {
  const [bg, ink, accent] = profile.brandColors; const width = 1080, height = portrait ? 1920 : 1350; const font = embeddedFont(profile);
  const lines = wrap(text, portrait ? 24 : 29);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${font.css}.rtl{direction:rtl;unicode-bidi:embed;font-family:'${esc(font.family)}',Tahoma,sans-serif}</style><rect width="100%" height="100%" fill="${index % 2 ? ink : bg}"/><circle cx="920" cy="140" r="180" fill="${accent}" opacity=".18"/><rect x="72" y="90" width="12" height="160" rx="6" fill="${accent}"/><text class="rtl" x="930" y="${height * .39}" direction="rtl" unicode-bidi="embed" text-anchor="end" fill="${index % 2 ? bg : ink}" font-size="72" font-weight="700">${lines.map((l, i) => `<tspan x="930" dy="${i ? 105 : 0}">${esc(l)}</tspan>`).join('')}</text><text x="72" y="${height - 92}" direction="ltr" fill="${accent}" font-family="Arial" font-size="34">${esc(profile.instagramId)}</text><text x="930" y="${height - 92}" text-anchor="end" fill="${index % 2 ? bg : ink}" opacity=".55" font-size="30">${index + 1} / ${total}</text></svg>`;
}
function run(bin, args) { const result = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true }); if (result.status !== 0) throw new Error(`${bin} failed: ${result.stderr || result.error?.message}`); }
async function raster(text, options, target, format) { const pipeline = sharp(Buffer.from(svg({ text, ...options })), { density: 144 }); if (format === 'jpeg') await pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(target); else await pipeline.png({ compressionLevel: 9 }).toFile(target); }

export async function renderCarousel(item, profile, outputRoot) {
  const dir = path.join(outputRoot, item.id, 'carousel'); fs.mkdirSync(dir, { recursive: true }); const files = [];
  for (const [i, text] of item.slides.slice(0, 8).entries()) { const target = path.join(dir, `slide-${i + 1}.jpg`); await raster(text, { index: i, total: Math.min(item.slides.length, 8), profile }, target, 'jpeg'); files.push(target); }
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify({ id: item.id, format: '1080x1350 JPEG', files }, null, 2)}\n`); return files;
}
export async function renderReel(item, profile, outputRoot, { ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg', narrationPath = '', runner = run } = {}) {
  const dir = path.join(outputRoot, item.id, 'reel'); fs.mkdirSync(dir, { recursive: true }); const frames = reelFrames(item); const inputs = [];
  for (const [i, text] of frames.entries()) { const frame = path.join(dir, `scene-${i + 1}.png`); await raster(text, { index: i, total: frames.length, profile, portrait: true }, frame, 'png'); inputs.push('-loop', '1', '-t', '5', '-i', frame); }
  const video = path.join(dir, 'reel.mp4'); const concat = frames.map((_, i) => `[${i}:v]scale=1080:1920,format=yuv420p[v${i}]`).join(';') + `;${frames.map((_, i) => `[v${i}]`).join('')}concat=n=${frames.length}:v=1:a=0[v]`;
  const args = ['-y', ...inputs]; if (narrationPath) args.push('-i', narrationPath); args.push('-filter_complex', concat, '-map', '[v]', ...(narrationPath ? ['-map', `${frames.length}:a`, '-shortest'] : []), '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video); runner(ffmpeg, args); return video;
}
export function reelFrames(item) { return [...item.slides]; }
export class NoopTtsProvider { async synthesize() { return null; } }
