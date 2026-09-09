import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FONT_FORMATS = { '.ttf': 'truetype', '.woff': 'woff', '.woff2': 'woff2' };
const TEXT_LEFT = 96; const TEXT_RIGHT = 984; const TEXT_WIDTH = TEXT_RIGHT - TEXT_LEFT;
const glyphUnits = (value) => [...String(value)].reduce((total, char) => total + (/\s/u.test(char) ? .34 : /[A-Za-z0-9۰-۹٠-٩]/u.test(char) ? .62 : .68), 0);
function wrapAtUnits(text, capacity) { const words = String(text).trim().split(/\s+/u).filter(Boolean); const lines = []; let line = ''; for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (line && glyphUnits(candidate) > capacity) { lines.push(line); line = word; } else line = candidate; while (glyphUnits(line) > capacity) { const chars = [...line]; let split = 1; while (split < chars.length && glyphUnits(chars.slice(0, split + 1).join('')) <= capacity) split++; lines.push(chars.slice(0, split).join('')); line = chars.slice(split).join(''); } } if (line) lines.push(line); return lines; }
export function layoutTitle(text, { portrait = false } = {}) { const maxLines = portrait ? 8 : 6; let fontSize = portrait ? 76 : 72; let lines; while (fontSize >= 44) { lines = wrapAtUnits(text, TEXT_WIDTH / fontSize); if (lines.length <= maxLines) break; fontSize -= 4; } if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.…]+$/u, '')}…`; } return { lines, fontSize, lineHeight: Math.round(fontSize * 1.42), x: TEXT_RIGHT, left: TEXT_LEFT, right: TEXT_RIGHT }; }
const titleSpans = (layout) => layout.lines.map((line, i) => `<tspan x="${layout.x}" dy="${i ? layout.lineHeight : 0}" textLength="${Math.min(TEXT_WIDTH, Math.ceil(glyphUnits(line) * layout.fontSize))}" lengthAdjust="spacingAndGlyphs">${esc(line)}</tspan>`).join('');

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
  const layout = layoutTitle(text, { portrait }); const y = Math.round(height * .34);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${font.css}.rtl{direction:rtl;unicode-bidi:plaintext;font-family:'${esc(font.family)}',Tahoma,sans-serif}</style><rect width="100%" height="100%" fill="${index % 2 ? ink : bg}"/><circle cx="920" cy="140" r="180" fill="${accent}" opacity=".18"/><rect x="72" y="90" width="12" height="160" rx="6" fill="${accent}"/><text class="rtl" x="${layout.x}" y="${y}" direction="rtl" unicode-bidi="plaintext" text-anchor="start" fill="${index % 2 ? bg : ink}" font-size="${layout.fontSize}" font-weight="700">${titleSpans(layout)}</text><text x="72" y="${height - 92}" direction="ltr" fill="${accent}" font-family="Arial" font-size="34">${esc(profile.instagramId)}</text><text x="1008" y="${height - 92}" text-anchor="end" fill="${index % 2 ? bg : ink}" opacity=".55" font-size="30">${index + 1} / ${total}</text></svg>`;
}
function titleMaskSvg(text, profile, portrait = false) { const width = 1080, height = portrait ? 1920 : 1350; const font = embeddedFont(profile); const layout = layoutTitle(text, { portrait }); const y = Math.round(height * .34); return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><style>${font.css}.rtl{direction:rtl;unicode-bidi:plaintext;font-family:'${esc(font.family)}',Tahoma,sans-serif}</style><text class="rtl" x="${layout.x}" y="${y}" direction="rtl" unicode-bidi="plaintext" text-anchor="start" fill="white" font-size="${layout.fontSize}" font-weight="700">${titleSpans(layout)}</text></svg>`; }
export async function renderTitleMask(text, profile, { portrait = false } = {}) { return sharp(Buffer.from(titleMaskSvg(text, profile, portrait)), { density: 144 }).resize(1080, portrait ? 1920 : 1350).png().toBuffer(); }
function run(bin, args) { const result = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true }); if (result.status !== 0) throw new Error(`${bin} failed: ${result.stderr || result.error?.message}`); }
async function raster(text, options, target, format) { const pipeline = sharp(Buffer.from(svg({ text, ...options })), { density: 144 }).resize(1080, options.portrait ? 1920 : 1350); if (format === 'jpeg') await pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toFile(target); else await pipeline.png({ compressionLevel: 9 }).toFile(target); }

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
