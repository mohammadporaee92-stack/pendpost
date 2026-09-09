import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_PROFILE = Object.freeze({
  pageName: 'محمد، هوش مصنوعی کاربردی', instagramId: '@mohammad_por_ai', topic: 'آموزش کاربردی هوش مصنوعی به زبان فارسی',
  targetAudience: ['مبتدیان', 'دانشجویان', 'تولیدکنندگان محتوا', 'صاحبان کسب‌وکار کوچک', 'متخصصان'], tone: 'ساده، کاربردی و قابل اعتماد',
  pillars: ['آموزش‌های کاربردی هوش مصنوعی', 'اشتباهات رایج هوش مصنوعی', 'بررسی ابزارهای هوش مصنوعی', 'پروژه‌های واقعی و مثال‌های مفید'],
  brandColors: ['#F7F7F2', '#111827', '#14B8A6', '#F59E0B'], font: 'Vazirmatn', logoPath: '', postingFrequency: 'daily',
  preferredTime: '18:00', timezone: 'Asia/Tehran', ctaPreferences: 'ذخیره، اشتراک‌گذاری و دنبال‌کردن صفحه',
  hashtagRules: '۵ تا ۸ هشتگ مرتبط؛ بدون هشتگ نامرتبط', forbiddenTopics: []
});
export const CONTENT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false, required: ['title', 'hook', 'slides', 'script', 'caption', 'hashtags', 'sources'], properties: { title: { type: 'string' }, hook: { type: 'string' }, slides: { type: 'array', items: { type: 'string' } }, script: { type: 'string' }, caption: { type: 'string' }, hashtags: { type: 'array', items: { type: 'string' } }, sources: { type: 'array', items: { type: 'string' } } } });
const MAX_FIELD = 5000;
const words = (value) => String(value || '').toLocaleLowerCase('fa').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2);
const clean = (value, max = MAX_FIELD) => String(value || '').trim().slice(0, max);
const cleanList = (value, maxItems = 30) => (Array.isArray(value) ? value : String(value || '').split(/[،,]/)).map((x) => clean(x, 200)).filter(Boolean).slice(0, maxItems);
export function topicSimilarity(a, b) { const aa = new Set(words(a)); const bb = new Set(words(b)); if (!aa.size || !bb.size) return 0; return [...aa].filter((w) => bb.has(w)).length / new Set([...aa, ...bb]).size; }
export function isDuplicateTopic(topic, prior = [], threshold = 0.55) { return prior.some((item) => topicSimilarity(topic, item.topic || item.title || item) >= threshold); }

export function validateProfile(input = {}) {
  const profile = { ...DEFAULT_PROFILE, ...input };
  for (const key of ['targetAudience', 'pillars', 'brandColors', 'forbiddenTopics']) profile[key] = cleanList(profile[key], key === 'brandColors' ? 6 : 30);
  for (const key of ['pageName', 'instagramId', 'topic', 'tone', 'font', 'logoPath', 'postingFrequency', 'preferredTime', 'ctaPreferences', 'hashtagRules']) profile[key] = clean(profile[key]);
  profile.instagramId = profile.instagramId.replace(/^([^@])/, '@$1');
  if (!/^@[A-Za-z0-9._]{1,30}$/.test(profile.instagramId)) throw new Error('instagramId_invalid');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(profile.preferredTime)) throw new Error('preferredTime_invalid');
  if (profile.brandColors.length < 2 || !profile.brandColors.every((c) => /^#[0-9a-f]{6}$/i.test(c))) throw new Error('brandColors_invalid');
  if (!profile.pageName || !profile.topic || !profile.pillars.length) throw new Error('profile_required_fields_missing');
  profile.timezone = 'Asia/Tehran'; return profile;
}

export function tehranDateParts(now = new Date()) { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value])); return `${parts.year}-${parts.month}-${parts.day}`; }
export function proposedTehranTime(now, preferredTime) { return `${tehranDateParts(now)}T${preferredTime}:00+03:30`; }

export function validateContent(raw, { type, profile }) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('content_not_object');
  const allowed = Object.keys(CONTENT_SCHEMA.properties); if (Object.keys(raw).some((k) => !allowed.includes(k))) throw new Error('content_unknown_field');
  for (const key of ['title', 'hook', 'script', 'caption']) if (typeof raw[key] !== 'string' || !raw[key].trim()) throw new Error(`content_${key}_invalid`);
  if (!Array.isArray(raw.slides) || !raw.slides.every((x) => typeof x === 'string' && x.trim())) throw new Error('content_slides_invalid');
  const [minSlides, maxSlides] = type === 'carousel' ? [6, 8] : [5, 9]; if (raw.slides.length < minSlides || raw.slides.length > maxSlides) throw new Error('content_slide_count_invalid');
  if (raw.caption.length > 2200) throw new Error('content_caption_too_long');
  if (!Array.isArray(raw.hashtags) || raw.hashtags.length < 1 || raw.hashtags.length > 30 || raw.hashtags.some((x) => typeof x !== 'string' || !/^#[\p{L}\p{N}_]+$/u.test(x))) throw new Error('content_hashtags_invalid');
  if (`${raw.caption}\n\n${raw.hashtags.join(' ')}`.length > 2200) throw new Error('content_instagram_caption_too_long');
  if (!Array.isArray(raw.sources) || raw.sources.some((x) => typeof x !== 'string' || !/^https:\/\//.test(x))) throw new Error('content_sources_invalid');
  const corpus = [raw.title, raw.hook, raw.script, raw.caption, ...raw.slides].join(' '); if (profile.forbiddenTopics.some((topic) => topic && corpus.toLocaleLowerCase('fa').includes(topic.toLocaleLowerCase('fa')))) throw new Error('content_forbidden_topic');
  return { ...raw, title: raw.title.trim(), slides: raw.slides.map((x) => x.trim()), hashtags: [...new Set(raw.hashtags)] };
}

export class JsonStore {
  constructor(root = process.env.PENDPOST_PERSIAN_ROOT || path.resolve('data/persian-instagram')) { this.root = root; }
  file(name) { return path.join(this.root, `${name}.json`); }
  read(name, fallback) { try { return JSON.parse(fs.readFileSync(this.file(name), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; } }
  write(name, value) { fs.mkdirSync(this.root, { recursive: true }); const tmp = `${this.file(name)}.${process.pid}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(tmp, this.file(name)); return value; }
  profile() { return validateProfile(this.read('profile', {})); }
  saveProfile(profile) { return this.write('profile', validateProfile(profile)); }
  items() { return this.read('content', []); }
  saveItem(item) { const all = this.items(); const at = all.findIndex((x) => x.id === item.id); if (at < 0) all.push(item); else all[at] = item; this.write('content', all); return item; }
}

export class MockPersianProvider {
  async generate({ previous = [] }) { const choices = [['شروع مسئله‌محور', 'از یک مسئله کوچک شروع کنید، خروجی را بررسی کنید و دستور خود را مرحله‌به‌مرحله بهتر کنید.'], ['بازبینی پاسخ مدل', 'پاسخ را با منبع معتبر مقایسه کنید، سؤال دقیق‌تر بپرسید و اطلاعات حساس را وارد نکنید.'], ['ارزیابی ابزار مناسب', 'کیفیت خروجی، حریم خصوصی، زبان فارسی و هزینه واقعی را با یک نمونه کار ثابت بسنجید.'], ['طراحی پروژه واقعی', 'هدف، مخاطب و چهار ستون محتوایی را مشخص کنید؛ سپس هر ایده را پیش از انتشار بازبینی کنید.']]; const sequence = previous.length + 1; const [theme, lesson] = choices[(sequence - 1) % choices.length]; const marker = String(sequence).padStart(6, '0'); const title = `تمرین ${marker} ${theme} شناسه${marker}`; const slides = [title, 'مسئله چیست؟', lesson, 'یک تمرین کوچک برای امروز', 'خروجی را انسانی بازبینی کنید', 'خلاصه و قدم بعدی']; return { title, hook: title, slides, script: `${title}. ${lesson} همین امروز این روش را روی یک کار کوچک امتحان کنید.`, caption: `${title}\n\n${lesson}\n\nاگر مفید بود ذخیره کنید و تجربه‌تان را بنویسید.`, hashtags: ['#هوش_مصنوعی', '#آموزش_هوش_مصنوعی', '#ابزار_هوش_مصنوعی', '#تولید_محتوا', '#mohammad_por_ai'], sources: [] }; }
}

export class OllamaPersianProvider {
  constructor({ baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', model = process.env.OLLAMA_MODEL || 'qwen2.5:7b', fetchImpl = fetch } = {}) { this.baseUrl = baseUrl; this.model = model; this.fetch = fetchImpl; }
  async generate(context) { const prompt = `فقط JSON معتبر فارسی بساز؛ آمار و منبع ساختگی ممنوع. نوع: ${context.type}. برند: ${JSON.stringify(context.profile)}. ممنوع: ${context.profile.forbiddenTopics.join('،')}. قبلی: ${JSON.stringify(context.previous.map((x) => x.title))}`; const response = await this.fetch(`${this.baseUrl}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: this.model, prompt, stream: false, format: CONTENT_SCHEMA }) }); if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`); const payload = await response.json(); try { return JSON.parse(payload.response); } catch { throw new Error('ollama_invalid_json'); } }
}

export async function generateDaily({ store = new JsonStore(), provider = new MockPersianProvider(), now = new Date(), type: forcedType, replacesId = null } = {}) {
  const items = store.items(); const profile = store.profile(); const type = forcedType || (items.filter((x) => !x.replacesId).length % 2 === 0 ? 'carousel' : 'reel'); let content; let lastError;
  for (let attempt = 0; attempt < 3; attempt++) { try { const candidate = validateContent(await provider.generate({ profile, type, previous: items, attempt }), { type, profile }); if (isDuplicateTopic(candidate.title, items)) throw new Error('content_duplicate_topic'); content = candidate; break; } catch (error) { lastError = error; } }
  if (!content) throw new Error(`content_generation_failed: ${lastError?.message || 'unknown'}`);
  const createdAt = now.toISOString(); return store.saveItem({ ...content, id: `${tehranDateParts(now)}-${crypto.randomUUID().slice(0, 8)}`, type, replacesId, status: 'draft', createdAt, updatedAt: createdAt, proposedAt: proposedTehranTime(now, profile.preferredTime), publish: { attempts: 0, instagramPostId: null, containerId: null, error: null, nextRetryAt: null, ambiguous: false } });
}
