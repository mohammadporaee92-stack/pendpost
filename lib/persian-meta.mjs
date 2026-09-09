const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export class InstagramGraphPublisher {
  constructor({ token = process.env.META_PAGE_TOKEN || process.env.META_SYSTEM_USER_TOKEN, igUserId = process.env.META_IG_USER_ID, graphVersion = process.env.META_GRAPH_VERSION || 'v23.0', dryRun = process.env.PERSIAN_DRY_RUN !== 'false', fetchImpl = fetch, wait = sleep } = {}) { this.token = token; this.igUserId = igUserId; this.base = `https://graph.facebook.com/${graphVersion}`; this.dryRun = dryRun; this.fetch = fetchImpl; this.wait = wait; }
  async call(url, init = {}) { const response = await this.fetch(url, init); const body = await response.json(); if (!response.ok || body.error) { const error = new Error(body.error?.message || `Meta HTTP ${response.status}`); error.code = body.error?.code; error.retryable = response.status === 429 || response.status >= 500 || [1, 2, 4, 17, 32, 613].includes(error.code); throw error; } return body; }
  async publish(item) {
    if (item.status !== 'approved') throw new Error('explicit_approval_required');
    if (item.publish?.instagramPostId) return { duplicatePrevented: true, id: item.publish.instagramPostId };
    if (this.dryRun) return { dryRun: true, id: null };
    if (!this.token || !this.igUserId) throw new Error('Meta environment is incomplete');
    item.publish ||= {}; item.publish.attempts = (item.publish.attempts || 0) + 1; item.publish.lastAttemptAt = new Date().toISOString();
    try {
      const urls = item.publicMediaUrls || []; if (!urls.length) throw new Error('public_media_urls_required');
      let creationId = item.publish.containerId;
      if (!creationId && item.type === 'carousel') {
        if (urls.length < 2 || urls.length > 10 || !urls.every((u) => /^https:\/\//.test(u))) throw new Error('invalid_carousel_media');
        const children = []; for (const imageUrl of urls) { const child = await this.call(`${this.base}/${this.igUserId}/media`, { method: 'POST', body: new URLSearchParams({ image_url: imageUrl, is_carousel_item: 'true', access_token: this.token }) }); children.push(child.id); }
        creationId = (await this.call(`${this.base}/${this.igUserId}/media`, { method: 'POST', body: new URLSearchParams({ media_type: 'CAROUSEL', children: children.join(','), caption: `${item.caption}\n\n${item.hashtags.join(' ')}`, access_token: this.token }) })).id;
      } else if (!creationId) {
        if (urls.length !== 1 || !/^https:\/\//.test(urls[0])) throw new Error('invalid_reel_media');
        creationId = (await this.call(`${this.base}/${this.igUserId}/media`, { method: 'POST', body: new URLSearchParams({ media_type: 'REELS', video_url: urls[0], caption: `${item.caption}\n\n${item.hashtags.join(' ')}`, share_to_feed: 'true', access_token: this.token }) })).id;
      }
      item.publish.containerId = creationId;
      for (let i = 0; i < 20; i++) { const status = await this.call(`${this.base}/${creationId}?fields=status_code,status&access_token=${encodeURIComponent(this.token)}`); if (status.status_code === 'FINISHED') break; if (status.status_code === 'ERROR' || i === 19) throw new Error(`container_processing_failed: ${status.status || status.status_code}`); await this.wait(3000); }
      const published = await this.call(`${this.base}/${this.igUserId}/media_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: creationId, access_token: this.token }) }); item.publish.instagramPostId = published.id; item.publish.publishedAt = new Date().toISOString(); item.publish.error = null; item.status = 'published'; return { id: published.id };
    } catch (error) { item.status = 'publish_failed'; item.publish.error = { message: error.message, code: error.code || null, retryable: Boolean(error.retryable), at: new Date().toISOString() }; throw error; }
  }
}
