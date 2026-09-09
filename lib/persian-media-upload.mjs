import path from 'node:path';
import { spawnSync } from 'node:child_process';

export class DisabledMediaUploader { async upload() { throw new Error('media_uploader_disabled'); } }
export class RcloneMediaUploader {
  constructor({ executable = process.env.RCLONE_PATH || 'rclone', remote = process.env.MEDIA_RCLONE_REMOTE, publicBaseUrl = process.env.MEDIA_PUBLIC_BASE_URL, runner = spawnSync } = {}) { this.executable = executable; this.remote = remote; this.publicBaseUrl = String(publicBaseUrl || '').replace(/\/$/, ''); this.runner = runner; }
  async upload(files, contentId) { if (!this.remote || !/^https:\/\//.test(this.publicBaseUrl)) throw new Error('rclone_uploader_configuration_invalid'); const urls = []; for (const file of files) { const name = path.basename(file); const key = `${contentId}/${name}`; const result = this.runner(this.executable, ['copyto', file, `${this.remote.replace(/\/$/, '')}/${key}`], { encoding: 'utf8', windowsHide: true }); if (result.status !== 0) throw new Error(`rclone_upload_failed: ${result.stderr || result.error?.message}`); urls.push(`${this.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`); } return urls; }
}
export function configuredMediaUploader(env = process.env) { return env.MEDIA_UPLOADER === 'rclone' ? new RcloneMediaUploader() : new DisabledMediaUploader(); }
