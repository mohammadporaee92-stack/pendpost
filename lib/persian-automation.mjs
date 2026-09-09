import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_PROFILE = Object.freeze({
  pageName: 'محمد، هوش مصنوعی کاربردی', instagramId: '@mohammad_por_ai',
  topic: 'آموزش کاربردی هوش مصنوعی به زبان فارسی',
  targetAudience: ['مبتدیان', 'دانشجویان', 'تولیدکنندگان محتوا', 'صاحبان کسب‌وکار کوچک', 'متخصصان'],
  tone: 'ساده، کاربردی و قابل اعتماد',
  pillars: ['آموزش‌های کاربردی هوش مصنوعی', 'اشتباهات رایج هوش مصنوعی', 'بررسی ابزارهای هوش مصنوعی', 'پروژه‌های واقعی و مثال‌های مفید'],
  brandColors: ['#F7F7F2', '#111827', '#14B8A6', '#F59E0B'], font: 'Vazirmatn', logoPath: '',
  postingFrequency: 'daily', preferredTime: '18:00', timezone: 'Asia/Tehran',
  ctaPreferences: 'ذخیره، اشتراک‌گذاری و دنبال‌کردن صفحه', hashtagRules: '۵ تا ۸ هشتگ مرتبط؛ بدون هشتگ نامرتبط', forbiddenTopics: []
});

const words = (value) => String(value || '').toLocaleLowerCase('fa').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2);
export function topicSimilarity(a, b) {
  const aa = new Set(words(a)); const bb = new Set(words(b));
  if (!aa.size || !bb.size) return 0;
  const intersection = [...aa].filter((w) => bb.has(w)).length;
  return intersection / new Set([...aa, ...bb]).size;
}
export function isDuplicateTopic(topic, prior = [], threshold = 0.55) {
  return prior.some((item) => topicSimilarity(topic, item.topic || item.title || item) >= threshold);
}

export class JsonStore {
  constructor(root = process.env.PENDPOST_PERSIAN_ROOT || path.resolve('data/persian-instagram')) { this.root = root; }
  file(name) { return path.join(this.root, `${name}.json`); }
  read(name, fallback) { try { return JSON.parse(fs.readFileSync(this.file(name), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return fallback; throw e; } }
  write(name, value) { fs.mkdirSync(this.root, { recursive: true }); const tmp = `${this.file(name)}.${process.pid}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); fs.renameSync(tmp, this.file(name)); return value; }
  profile() { return { ...DEFAULT_PROFILE, ...this.read('profile', {}) }; }
  saveProfile(profile) { return this.write('profile', { ...DEFAULT_PROFILE, ...profile, instagramId: String(profile.instagramId || DEFAULT_PROFILE.instagramId).replace(/^([^@])/, '@$1') }); }
  items() { return this.read('content', []); }
  saveItem(item) { const all = this.items(); const at = all.findIndex((x) => x.id === item.id); if (at < 0) all.push(item); else all[at] = item; this.write('content', all); return item; }
}

export class MockPersianProvider {
  async generate({ profile, type, previous = [] }) {
    const choices = [
      ['سه روش ساده برای شروع کار با هوش مصنوعی', 'از یک مسئله کوچک شروع کنید، خروجی را بررسی کنید و دستور خود را مرحله‌به‌مرحله بهتر کنید.'],
      ['اشتباه رایج: اعتماد کامل به اولین پاسخ هوش مصنوعی', 'پاسخ را با منبع معتبر مقایسه کنید، سؤال دقیق‌تر بپرسید و اطلاعات حساس را وارد نکنید.'],
      ['چطور یک ابزار هوش مصنوعی را درست ارزیابی کنیم؟', 'کیفیت خروجی، حریم خصوصی، زبان فارسی و هزینه واقعی را با یک نمونه کار ثابت بسنجید.'],
      ['یک پروژه واقعی: ساخت تقویم محتوایی با کمک هوش مصنوعی', 'هدف، مخاطب و چهار ستون محتوایی را مشخص کنید؛ سپس هر ایده را پیش از انتشار بازبینی کنید.']
    ];
    const [title, lesson] = choices.find(([candidate]) => !isDuplicateTopic(candidate, previous)) || choices[previous.length % choices.length];
    const slides = [title, 'مسئله چیست؟', lesson, 'یک تمرین کوچک برای امروز', 'خروجی را انسانی بازبینی کنید', 'خلاصه و قدم بعدی'];
    return { title, hook: title, type, slides, script: `${title}. ${lesson} همین امروز این روش را روی یک کار کوچک امتحان کنید.`, caption: `${title}\n\n${lesson}\n\nاگر مفید بود ذخیره کنید و تجربه‌تان را بنویسید.`, hashtags: ['#هوش_مصنوعی', '#آموزش_هوش_مصنوعی', '#ابزار_هوش_مصنوعی', '#تولید_محتوا', '#mohammad_por_ai'], sources: [], profile: profile.instagramId };
  }
}

export class OllamaPersianProvider {
  constructor({ baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', model = process.env.OLLAMA_MODEL || 'qwen2.5:7b', fetchImpl = fetch } = {}) { this.baseUrl = baseUrl; this.model = model; this.fetch = fetchImpl; }
  async generate(context) {
    const prompt = `فقط JSON معتبر بساز. زبان فارسی و ادعاها قابل راستی‌آزمایی باشند. آمار یا منبع ساختگی ممنوع. کلیدها: title,hook,slides,script,caption,hashtags,sources. نوع محتوا: ${context.type}. برند: ${JSON.stringify(context.profile)}. موضوعات قبلی: ${JSON.stringify(context.previous.map((x) => x.title))}`;
    const response = await this.fetch(`${this.baseUrl}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: this.model, prompt, stream: false, format: 'json' }) });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    return JSON.parse((await response.json()).response);
  }
}

export async function generateDaily({ store = new JsonStore(), provider = new MockPersianProvider(), now = new Date() } = {}) {
  const items = store.items(); const type = items.length % 2 === 0 ? 'carousel' : 'reel';
  let content;
  for (let attempt = 0; attempt < 3; attempt++) { content = await provider.generate({ profile: store.profile(), type, previous: items, attempt }); if (!isDuplicateTopic(content.title, items)) break; content = null; }
  if (!content) throw new Error('موضوع تازه‌ای پس از سه تلاش پیدا نشد');
  const createdAt = now.toISOString();
  return store.saveItem({ ...content, id: `${createdAt.slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`, type, status: 'draft', createdAt, updatedAt: createdAt, proposedAt: `${createdAt.slice(0, 10)}T${store.profile().preferredTime}:00`, publish: { attempts: 0, instagramPostId: null, containerId: null, error: null } });
}
