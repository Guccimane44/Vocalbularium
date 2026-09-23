import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const digest = value => createHash('sha256').update(value).digest('hex');
const scryptAsync = promisify(scrypt);
export class Authentication {
  constructor(persistence, { lifetimeMs = 7 * 24 * 60 * 60 * 1000, clock = Date.now } = {}) {
    this.persistence = persistence;
    this.lifetimeMs = lifetimeMs;
    this.clock = clock;
  }
  async initialize() {
    if (!await this.persistence.credential()) {
      const salt = randomBytes(16).toString('hex');
      const hash = await scryptAsync('admin', salt, 32);
      await this.persistence.seedCredential(salt, hash.toString('hex'));
    }
  }
  async login(username, password) {
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 128 || password.length > 1024) return null;
    const saved = await this.persistence.credential();
    const actual = await scryptAsync(password, saved.salt, 32);
    if (!timingSafeEqual(actual, Buffer.from(saved.password_hash, 'hex')) || username !== 'admin') return null;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.clock() + this.lifetimeMs;
    await this.persistence.saveToken(digest(token), expiresAt, this.clock());
    return { token, expiresAt };
  }
  async accepts(token) {
    if (typeof token !== 'string' || token.length > 128) return false;
    const row = await this.persistence.token(digest(token));
    return Boolean(row && row.account_id === this.persistence.accountId && row.expires_at > this.clock());
  }
  async logout(token) { await this.persistence.revokeToken(digest(token)); }
}
