// @ts-check
// Spoken parts' audio (D24): one clip per spoken line of a component's part.
import { randomUUID } from 'node:crypto';
/** @import { ClipKey, ClipRow, ComponentRow, GenerationEntry } from './store-records.js' */
import { fail } from './store-common.mjs';
import { GenerationStore } from './store-generation.mjs';

export class AudioStore extends GenerationStore {
  // Spoken parts' audio (D24): one clip per spoken line of a component's part.
  // A part's clips are replaced whole when its text is spoken again, and go with
  // their component. Audio is never cached: every clip is spoken anew.
  /** @param {string} pageId @param {string} componentId @param {string} part @param {readonly string[]} lines @param {string} language @returns {Promise<ClipKey[]>} */
  async replaceClips(pageId, componentId, part, lines, language) {
    return this.database.transaction(async () => {
      if (!await this.database.one("SELECT id FROM components WHERE page_id = $1 AND id = $2 AND status = 'completed'", [pageId, componentId])) {
        fail('deleted', 'The component is no longer completed.');
      }
      await this.database.run('DELETE FROM component_audio WHERE page_id = $1 AND component_id = $2 AND part = $3', [pageId, componentId, part]);
      const created = new Date().toISOString();
      for (const [line, text] of lines.entries()) {
        await this.database.run('INSERT INTO component_audio (page_id, component_id, part, line, text, language, token, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [pageId, componentId, part, line, text, language, randomUUID(), created]);
      }
      return lines.map((_, line) => ({ pageId, componentId, part, line }));
    });
  }
  // Removes a component's clips, or only those of the parts named.
  /** @param {string} pageId @param {string} componentId @param {readonly string[]} [parts] */
  async dropClips(pageId, componentId, parts) {
    await this.database.transaction(() => parts
      ? this.database.run('DELETE FROM component_audio WHERE page_id = $1 AND component_id = $2 AND part = ANY($3)', [pageId, componentId, parts])
      : this.database.run('DELETE FROM component_audio WHERE page_id = $1 AND component_id = $2', [pageId, componentId]));
  }
  // A page's clips without their audio, in page order.
  /** @param {string} pageId @returns {Promise<ClipRow[]>} */
  async clips(pageId) {
    return this.database.transaction(async () => {
      await this.page(pageId);
      return /** @type {ClipRow[]} */ (await this.database.all(`SELECT a.component_id, a.part, a.line, a.state, a.error, a.duration_ms FROM component_audio a
        JOIN components c ON c.page_id = a.page_id AND c.id = a.component_id WHERE a.page_id = $1 ORDER BY c.position, a.part, a.line`, [pageId]));
    });
  }
  // One ready clip's audio.
  /** @param {ClipKey} key @returns {Promise<{ mime: string, bytes: Buffer }>} */
  async clipAudio({ pageId, componentId, part, line }) {
    return this.database.transaction(async () => {
      const row = /** @type {{ mime: string, bytes: Buffer } | undefined} */ (await this.database.one(
        "SELECT mime, bytes FROM component_audio WHERE page_id = $1 AND component_id = $2 AND part = $3 AND line = $4 AND state = 'ready'", [pageId, componentId, part, line]));
      if (!row) fail('deleted', 'This audio is unavailable.');
      return row;
    });
  }
  // A waiting clip starts generating; null when it no longer waits. Its token
  // names this version of the clip for finishClip and failClip.
  // Its module type names the part's voice.
  /** @param {ClipKey} key @returns {Promise<{ text: string, language: string, token: string, module_type: string } | null>} */
  async claimClip({ pageId, componentId, part, line }) {
    return this.database.transaction(async () => /** @type {{ text: string, language: string, token: string, module_type: string } | undefined} */ (await this.database.one(
      `UPDATE component_audio a SET state = 'generating' FROM components c
        WHERE a.page_id = $1 AND a.component_id = $2 AND a.part = $3 AND a.line = $4 AND a.state = 'waiting' AND c.page_id = a.page_id AND c.id = a.component_id
        RETURNING a.text, a.language, a.token, c.module_type`,
      [pageId, componentId, part, line])) ?? null);
  }
  // A generating clip's audio, and the speech model and voice in its part's
  // generation record (D24). False when the clip was replaced or deleted meanwhile.
  /** @param {ClipKey} key @param {string} token @param {{ bytes: Buffer, mime: string, durationMs: number, model: string | null, voice: string | null }} audio */
  async finishClip({ pageId, componentId, part, line }, token, { bytes, mime, durationMs, model, voice }) {
    return this.database.transaction(async () => {
      const changed = await this.database.run(`UPDATE component_audio SET state = 'ready', error = NULL, mime = $6, duration_ms = $7, bytes = $8
        WHERE page_id = $1 AND component_id = $2 AND part = $3 AND line = $4 AND token = $5 AND state = 'generating'`, [pageId, componentId, part, line, token, mime, durationMs, bytes]);
      if (!changed.rowCount) return false;
      const row = /** @type {Pick<ComponentRow, 'generation'> | undefined} */ (await this.database.one('SELECT generation FROM components WHERE page_id = $1 AND id = $2', [pageId, componentId]));
      const record = row?.generation ? /** @type {Record<string, GenerationEntry>} */ (JSON.parse(row.generation)) : null;
      if (record?.[part]) {
        record[part] = { ...record[part], speech: { model, voice } };
        await this.database.run('UPDATE components SET generation = $3 WHERE page_id = $1 AND id = $2', [pageId, componentId, JSON.stringify(record)]);
      }
      return true;
    });
  }
  // A waiting or generating clip fails with its error code; with a token, only
  // that version of it.
  /** @param {ClipKey} key @param {string} error @param {string} [token] */
  async failClip({ pageId, componentId, part, line }, error, token) {
    await this.database.transaction(() => this.database.run(`UPDATE component_audio SET state = 'failed', error = $5
      WHERE page_id = $1 AND component_id = $2 AND part = $3 AND line = $4 AND ($6::text IS NULL OR token = $6) AND state IN ('waiting', 'generating')`,
    [pageId, componentId, part, line, error, token ?? null]));
  }
  // A clip's Retry: a ready or failed clip waits to be spoken again. False when
  // it is still waiting or generating.
  /** @param {ClipKey} key */
  async restartClip({ pageId, componentId, part, line }) {
    return this.database.transaction(async () => {
      await this.page(pageId);
      const clip = await this.database.one('SELECT state FROM component_audio WHERE page_id = $1 AND component_id = $2 AND part = $3 AND line = $4', [pageId, componentId, part, line]);
      if (!clip) fail('deleted', 'This audio is unavailable.');
      const changed = await this.database.run(`UPDATE component_audio SET state = 'waiting', token = $5, error = NULL, mime = NULL, duration_ms = NULL, bytes = NULL
        WHERE page_id = $1 AND component_id = $2 AND part = $3 AND line = $4 AND state IN ('ready', 'failed')`, [pageId, componentId, part, line, randomUUID()]);
      return (changed.rowCount ?? 0) > 0;
    });
  }
  // The clips still waiting or generating.
  /** @returns {Promise<ClipKey[]>} */
  async pendingClips() {
    return this.database.transaction(async () => (/** @type {{ page_id: string, component_id: string, part: string, line: number }[]} */ (await this.database.all(
      "SELECT page_id, component_id, part, line FROM component_audio WHERE state IN ('waiting', 'generating')"))).map(row => ({ pageId: row.page_id, componentId: row.component_id, part: row.part, line: row.line })));
  }
}
