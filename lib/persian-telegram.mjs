import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class TelegramApproval {
  constructor({ token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_APPROVAL_CHAT_ID, allowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID, fetchImpl = fetch, persistItem = async () => {} } = {}) { this.token = token; this.chatId = String(chatId || ''); this.allowedUserId = String(allowedUserId || ''); this.fetch = fetchImpl; this.persistItem = persistItem; }
  endpoint(method) { if (!this.token) throw new Error('Telegram environment is incomplete'); return `https://api.telegram.org/bot${this.token}/${method}`; }
  callback(item, action) { return `${action}:${item.id}:${item.telegramNonce}`; }
  async json(method, payload) { const response = await this.fetch(this.endpoint(method), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const body = await response.json(); if (!response.ok || !body.ok) throw new Error(`Telegram ${method} failed: ${body.description || response.status}`); return body.result; }
  async send(item) {
    if (!this.chatId || !this.allowedUserId) throw new Error('Telegram environment is incomplete'); item.telegramNonce = crypto.randomBytes(12).toString('hex'); await this.persistItem(item);
    for (const file of item.previewFiles || []) { const form = new FormData(); form.set('chat_id', this.chatId); form.set('document', new Blob([fs.readFileSync(file)]), path.basename(file)); const upload = await this.fetch(this.endpoint('sendDocument'), { method: 'POST', body: form }); if (!upload.ok || !(await upload.json()).ok) throw new Error(`Telegram upload failed: ${upload.status}`); }
    const text = `نوع: ${item.type === 'carousel' ? 'کاروسل' : 'ریل'}\nزمان پیشنهادی تهران: ${item.proposedAt}\n\n${item.caption}\n\n${item.hashtags.join(' ')}`;
    const choices = [['✅ تأیید', 'approve'], ['❌ رد', 'reject'], ['🔄 بازتولید', 'regenerate']]; const reply_markup = { inline_keyboard: [choices.map(([label, action]) => ({ text: label, callback_data: this.callback(item, action) }))] };
    const result = await this.json('sendMessage', { chat_id: this.chatId, text, reply_markup }); item.telegramMessageId = result.message_id; return result;
  }
  authenticate(callback, item) { const [action, id, nonce] = String(callback.data || '').split(':'); if (String(callback.from?.id) !== this.allowedUserId) throw new Error('telegram_user_forbidden'); if (id !== item.id || !nonce || nonce !== item.telegramNonce) throw new Error('telegram_callback_invalid'); if (item.telegramCallbackUsedAt) throw new Error('telegram_callback_replayed'); if (!['approve', 'reject', 'regenerate'].includes(action)) throw new Error('telegram_action_invalid'); return action; }
  apply(callback, item, now = new Date()) { const action = this.authenticate(callback, item); item.telegramCallbackUsedAt = now.toISOString(); item.updatedAt = item.telegramCallbackUsedAt; item.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'regenerate_requested'; item.approvedBy = action === 'approve' ? String(callback.from.id) : null; return { action, item }; }
  async answer(callbackId, text, showAlert = false) { return this.json('answerCallbackQuery', { callback_query_id: callbackId, text, show_alert: showAlert }); }
  async prepareLongPolling() { return this.json('deleteWebhook', { drop_pending_updates: false }); }
  async getUpdates(offset = 0, timeout = 25) { return this.json('getUpdates', { offset, timeout, allowed_updates: ['callback_query'] }); }
}

export async function pollTelegramOnce({ telegram, offset = 0, onCallback }) {
  const updates = await telegram.getUpdates(offset); let nextOffset = offset;
  for (const update of updates) { nextOffset = Math.max(nextOffset, update.update_id + 1); const callback = update.callback_query; if (!callback) continue; try { const message = await onCallback(callback); await telegram.answer(callback.id, message || 'انجام شد'); } catch (error) { await telegram.answer(callback.id, `انجام نشد: ${error.message}`, true); } }
  return nextOffset;
}

export async function runTelegramPolling({ telegram, offset = 0, onCallback, persistOffset = async () => {}, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), once = false, maxCycles = Infinity }) {
  let initialized = false; let cycles = 0;
  while (cycles < maxCycles) { try { if (!initialized) { await telegram.prepareLongPolling(); initialized = true; } offset = await pollTelegramOnce({ telegram, offset, onCallback }); await persistOffset(offset); cycles++; if (once) break; } catch (error) { if (once) throw error; await wait(5000); } }
  return offset;
}
