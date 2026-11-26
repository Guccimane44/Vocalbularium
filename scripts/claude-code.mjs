// @ts-check
// The judge's way to Opus (v0.17.0 step 3): headless Claude Code, one
// `claude -p` per request, signed in with the owner's plan token
// (CLAUDE_CODE_OAUTH_TOKEN). The owner's own CLAUDE.md, rules, skills and
// settings must never shape a verdict, so `claude` runs from an empty folder,
// with no settings, skills or tools, and only HOME, PATH and the token in its
// environment (the 2026-11-26 trial showed default settings let them through).
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { OpenCodeProvider } from '../src/server/opencode.mjs';
import { failure } from '../src/server/provider.mjs';
/** @import { Request } from '@vocabularium/domain/composer' */
/** @import { Reply } from '../src/server/provider.mjs' */

// A JUDGE_MODEL that starts with this runs through Claude Code, not OpenCode:
// claude-haiku-5-5 alone names the OpenCode model.
export const CLAUDE_CODE = 'claude-code/';

// The prompts are OpenCode's: the schema travels inside the instructions.
export class ClaudeCodeProvider extends OpenCodeProvider {
  /** @param {{ model: string, token?: string, command?: string, folder?: string, timeout?: number }} options */
  constructor({ model, token = process.env.CLAUDE_CODE_OAUTH_TOKEN, command = 'claude', folder = '.data/claude-code/', timeout }) {
    super({ model, timeout });
    this.token = token; this.command = command; this.folder = folder;
  }
  /** @param {Request} _request @param {any} messages @param {AbortSignal} signal @param {string} _sessionId @param {Reply} reply */
  async send(_request, messages, signal, _sessionId, reply) {
    if (!this.token) throw failure('provider_unconfigured', 'Put CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token` in the ignored .env file.');
    await mkdir(this.folder, { recursive: true });
    const args = ['-p', '--model', this.model, '--output-format', 'json', '--system-prompt', messages[0].content,
      '--tools', '', '--setting-sources', '', '--disable-slash-commands', '--no-session-persistence'];
    const env = { HOME: process.env.HOME ?? '', PATH: process.env.PATH ?? '', CLAUDE_CODE_OAUTH_TOKEN: this.token };
    const output = await new Promise((resolve, reject) => {
      const child = spawn(this.command, args, { cwd: this.folder, env, signal });
      let text = '';
      child.stdout.on('data', chunk => { text += chunk; });
      child.stderr.on('data', chunk => { text += chunk; });
      child.on('error', reject);
      child.on('close', () => resolve(text));
      child.stdin.end(messages[1].content);
    });
    const at = output.indexOf('{"');
    let result;
    try { result = JSON.parse(output.slice(at)); } catch { throw failure('provider_invalid', `Claude Code returned no result: ${output.slice(0, 200)}`); }
    reply.status = result.is_error ? 500 : 200;
    reply.raw = output.slice(at);
    // Opus 5.5 needs Claude Code 2.1.280 or newer; its message says so.
    if (result.is_error) throw failure('provider_response', `Claude Code: ${String(result.result).slice(0, 300)}`);
    reply.content = String(result.result).trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  }
}
