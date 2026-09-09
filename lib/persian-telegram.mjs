import crypto from 'node:crypto'; import fs from 'node:fs'; import path from 'node:path';
export class TelegramApproval {
  constructor({ token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_APPROVAL_CHAT_ID, allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID, fetchImpl = fetch } = {}) { this.token = token; this.chatId = String(chatId || ''); this.allowedUserId = String(allowedUserId || ''); this.fetch = fetchImpl; }
  callback(item, action) { return `${action}:${item.id}:${item.telegramNonce}`; }
  async send(item) {
    if (!this.token || !this.chatId || !this.allowedUserId) throw new Error('Telegram environment is incomplete');
    item.telegramNonce ||= crypto.randomBytes(12).toString('hex');
    const text = `نوع: ${item.type === 'carousel' ? 'کاروسل' : 'ریل'}\nزمان پیشنهادی: ${item.proposedAt}\n\n${item.caption}\n\n${item.hashtags.join(' ')}`;
    const reply_markup = { inline_keyboard: [[['✅ تأیید', 'approve'], ['❌ رد', 'reject'], ['🔄 بازتولید', 'regenerate']].map(([label, action]) => ({ text: label, callback_data: this.callback(item, action) }))] };
    const response = await this.fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: this.chatId, text, reply_markup }) });
    if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
    for (const file of item.previewFiles || []) { const form = new FormData(); form.set('chat_id', this.chatId); form.set('document', new Blob([fs.readFileSync(file)]), path.basename(file)); const upload = await this.fetch(`https://api.telegram.org/bot${this.token}/sendDocument`, { method: 'POST', body: form }); if (!upload.ok) throw new Error(`Telegram upload HTTP ${upload.status}`); }
    return response.json();
  }
  authenticate(callback, item) {
    const [action, id, nonce] = String(callback.data || '').split(':');
    if (String(callback.from?.id) !== this.allowedUserId) throw new Error('telegram_user_forbidden');
    if (id !== item.id || !nonce || nonce !== item.telegramNonce) throw new Error('telegram_callback_invalid');
    if (item.telegramCallbackUsedAt) throw new Error('telegram_callback_replayed');
    if (!['approve', 'reject', 'regenerate'].includes(action)) throw new Error('telegram_action_invalid');
    return action;
  }
  apply(callback, item, now = new Date()) { const action = this.authenticate(callback, item); item.telegramCallbackUsedAt = now.toISOString(); item.updatedAt = item.telegramCallbackUsedAt; item.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'regenerate_requested'; item.approvedBy = action === 'approve' ? String(callback.from.id) : null; return item; }
}
