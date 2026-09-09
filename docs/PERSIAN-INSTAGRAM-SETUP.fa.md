# راهنمای فارسی سامانه محتوای اینستاگرام `@mohammad_por_ai`

این افزونه یک نسخه حداقلی، رایگان و **local-first** است: پروفایل، پیش‌نویس‌ها، وضعیت تأیید، خطاها و شناسه پست در `data/persian-instagram` روی لپ‌تاپ ذخیره می‌شوند. مجوز مخزن MIT است. انتشار واقعی در این تغییر اجرا نشده و `PERSIAN_DRY_RUN=true` پیش‌فرض است.

## پیش‌نیاز ویندوز ۱۱

PowerShell را باز کنید:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Gyan.FFmpeg
winget install Ollama.Ollama
git clone <YOUR-FORK-URL> pendpost
cd pendpost
powershell -ExecutionPolicy Bypass -File .\scripts\windows\setup-persian.ps1
ollama pull qwen2.5:7b
```

برای شروع بدون Ollama، `PERSIAN_AI_PROVIDER=mock` را نگه دارید. برای مدل محلی، آن را به `ollama` تغییر دهید. اشتراک ChatGPT شامل اعتبار API نیست و این سامانه به آن وابسته نیست.

## ۱. فرم راه‌اندازی راست‌به‌چپ

```powershell
npm run persian:serve
```

مرورگر را روی `http://127.0.0.1:8091` باز و همه فیلدهای برند را تکمیل کنید. داده‌ها فقط محلی‌اند. رنگ‌ها و فهرست‌ها را با ویرگول فارسی جدا کنید. فونت پیشنهادی آزاد `Vazirmatn` است. برای نتیجه یکسان در همه سیستم‌ها مسیر فایل `.ttf`، `.woff` یا `.woff2` را در `PERSIAN_FONT_PATH` قرار دهید؛ renderer آن را داخل SVG جاسازی می‌کند.

## ۲. ساخت محتوا و خروجی

```powershell
npm run persian:daily
```

روز اول کاروسل ۶ تا ۸ اسلاید PNG با ابعاد ۱۰۸۰×۱۳۵۰ و روز بعد ریل MP4 عمودی ۱۰۸۰×۱۹۲۰ ساخته می‌شود. قالب‌ها روشن/تیره، RTL و دارای شناسه صفحه‌اند. `Sharp` ابتدا SVG را با شکل‌دهی حروف فارسی به PNG تبدیل می‌کند؛ FFmpeg فقط PNGهای آماده را به ویدئو تبدیل می‌کند و هرگز SVG را decode نمی‌کند. بنابراین buildهای ویندوز FFmpeg که decoder مربوط به SVG ندارند نیز کار می‌کنند. موضوع‌های نزدیک با شباهت واژگانی رد می‌شوند. ارائه‌دهنده mock برای تست و رابط Ollama برای تولید واقعی وجود دارد. فایل manifest بسته کاروسل را معرفی می‌کند. شکست render وضعیت محتوا را به `render_failed` همراه متن خطا تغییر می‌دهد و فایل ناقص به‌عنوان draft عادی باقی نمی‌ماند.

ریل حداقلی ۳۰ ثانیه، بی‌چهره و مبتنی بر متن/شکل متحرک است. رابط TTS عمداً قابل‌تعویض است؛ نسخه فعلی بدون صدای ساختگی خروجی می‌دهد. می‌توان Piper و **یک مدل فارسی با مجوز روشن** را محلی افزود، اما کیفیت مدل‌های فارسی باید توسط صاحب صفحه ارزیابی شود. موسیقی فقط در صورت داشتن مجوز مناسب باید اضافه شود و صدای آن باید زیر روایت نگه داشته شود؛ MVP موسیقی اضافه نمی‌کند.

## ۳. تلگرام و محل ورود محرمانه‌ها

فقط خود شما فایل `.env` محلی را باز کنید و این مقادیر را وارد کنید؛ آن‌ها را در چت یا Git قرار ندهید:

```dotenv
TELEGRAM_BOT_TOKEN=<توکن BotFather>
TELEGRAM_APPROVAL_CHAT_ID=<شناسه چت دریافت پیش‌نمایش>
TELEGRAM_ALLOWED_USER_ID=<شناسه عددی حساب مجاز برای تأیید>
```

سپس `node scripts/persian-instagram.mjs daily --notify` پیش‌نمایش‌ها، کپشن، هشتگ، نوع و زمان را همراه دکمه‌های **تأیید، رد و بازتولید** می‌فرستد. دریافت دکمه‌ها با long polling رسمی `getUpdates` انجام می‌شود؛ بنابراین webhook، دامنه یا tunnel لازم نیست:

```powershell
npm run persian:telegram
```

Task Scheduler این worker را هنگام ورود به ویندوز اجرا می‌کند. worker ابتدا webhook قدیمی را با `deleteWebhook` غیرفعال می‌کند و سپس برای هر دکمه `answerCallbackQuery` می‌فرستد تا حالت انتظار Telegram تمام شود. تأیید وضعیت را `approved` می‌کند، رد هیچ انتشار ایجاد نمی‌کند و بازتولید یک پیش‌نویس جایگزین هم‌نوع را تولید و render و دوباره ارسال می‌کند. شناسه کاربر، nonce یک‌بارمصرف و offset ذخیره‌شده جلوی کاربر غیرمجاز، replay و تأیید تکراری را می‌گیرد.

## ۴. اتصال رسمی Meta (توقفگاه اطلاعات محرمانه)

تنها مسیر انتشار، **Instagram Graph API رسمی** برای حساب Professional متصل به Facebook Page است. در Meta Developers یک Business App بسازید، Instagram Graph API و Facebook Login for Business را اضافه کنید و callback مربوط به جریان OAuth خودتان را در داشبورد Meta ثبت کنید (Pendpost System User CLI به callback نیاز ندارد؛ اگر OAuth وب می‌سازید URL دقیق HTTPS همان برنامه را ثبت کنید). مجوزها:

`instagram_basic instagram_content_publish pages_show_list pages_read_engagement business_management`

شناسه‌های غیرمحرمانه و secrets را فقط در `.env` محلی وارد کنید:

```dotenv
META_APP_ID=<app-id>
META_APP_SECRET=<secret>
META_PAGE_ID=<page-id>
META_IG_USER_ID=<instagram-professional-user-id>
META_SYSTEM_USER_TOKEN=<long-lived-system-user-token>
PERSIAN_DRY_RUN=true
```

Graph API باید فایل را از URL عمومی HTTPS دریافت کند؛ `localhost` و مسیر فایل محلی قابل استفاده نیست. امن‌ترین گزینه رایگان پیشنهادی، **Cloudflare R2 free tier در یک bucket اختصاصی** با دامنه عمومی محدود به فایل‌های خروجی و ابزار متن‌باز `rclone` است. secretهای R2 فقط در config محلی rclone می‌مانند. پس از `rclone config` این موارد را در `.env` تنظیم کنید:

```dotenv
MEDIA_UPLOADER=rclone
MEDIA_RCLONE_REMOTE=pendpost-r2:public-media
MEDIA_PUBLIC_BASE_URL=https://media.example.com
RCLONE_PATH=C:\Program Files\rclone\rclone.exe
```

میزبانی عمومی ذاتاً فایل را برای هرکس که URL را دارد قابل دریافت می‌کند؛ bucket را فقط برای media انتشار بسازید، directory listing را ببندید و فایل‌های قدیمی را با lifecycle حذف کنید. adapter قابل تعویض است و پیش‌فرض `disabled` باقی می‌ماند.

publisher نوع/تعداد URL، ساخت container، polling وضعیت و `media_publish` را مدیریت می‌کند. خطاهای دائمی مانند token/permission خودکار retry نمی‌شوند؛ خطاهای موقت حداکثر سه بار با backoff نمایی retry می‌شوند. اگر پاسخ `media_publish` به علت قطع شبکه نامعلوم باشد، وضعیت `publish_unknown` می‌شود و **هیچ retry خودکاری انجام نمی‌شود** تا ابتدا در Instagram/Meta تطبیق انسانی انجام شود. پس از ثبت `instagramPostId` همان رکورد دوباره منتشر نمی‌شود.

**فعلاً `PERSIAN_DRY_RUN=true` بماند.** فقط پس از آزمون کامل و تصمیم آگاهانه خودتان آن را `false` کنید. فرمان زیر در حالت پیش‌فرض فقط dry-run است:

```powershell
npm run persian:publish
```

## ۵. زمان‌بندی ویندوز

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\register-persian-tasks.ps1 -GenerationTime "17:30" -PublishCheckMinutes 5
```

Task Scheduler روزانه پیش‌نویس می‌سازد و هر پنج دقیقه موارد تأییدشده را بررسی می‌کند. **لپ‌تاپ باید روشن، بیدار و هنگام ارسال تلگرام/انتشار به اینترنت متصل باشد.** زمان دلخواه فرم برای پیشنهاد محتواست؛ زمان trigger را نیز متناسب تنظیم کنید.

## امنیت و محدودیت‌های باقی‌مانده

- `.env` و پوشه داده runtime در Git نادیده گرفته شده‌اند؛ secret را log یا commit نکنید.
- فرم فقط روی `127.0.0.1` است. آن را مستقیم در اینترنت باز نکنید.
- منابع پژوهش وب در فیلد `sources` ذخیره می‌شوند؛ مدل نباید آمار یا ادعای بدون منبع بسازد. MVP خودش web research انجام نمی‌دهد.
- حساب Instagram باید Professional (Business یا Creator) و به Facebook Page متصل باشد؛ حساب شخصی با Graph publishing کار نمی‌کند. مجوز `instagram_content_publish` الزامی است و ممکن است برای استفاده خارج از نقش‌های app به App Review نیاز باشد.
- کیفیت RTL و فونت نصب‌شده را پیش از انتشار انسانی بررسی کنید. ریل فعلی انیمیشن ساده و بدون TTS/موسیقی است؛ کیفیت صدای فارسی Piper یکنواخت نیست و انتخاب/مجوز مدل صوتی بر عهده مالک است.
- اگر لپ‌تاپ sleep/offline/خاموش باشد long polling، ارسال و انتشار اجرا نمی‌شوند. `StartWhenAvailable` کارهای زمان‌بندی‌شده را پس از بیدارشدن جبران می‌کند، اما worker Telegram پس از logon باید در حال اجرا باشد.
- مسیر مهاجرت بعدی می‌تواند GitHub Actions یا Cloudflare باشد، ولی هیچ deployment ابری در این تغییر پیاده نشده است.
