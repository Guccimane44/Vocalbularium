import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const digest = value => createHash('sha256').update(value).digest('hex');
export class Authentication {
  constructor(db, { lifetimeMs = 7 * 24 * 60 * 60 * 1000, clock = Date.now } = {}) {
    this.db = db;
    this.lifetimeMs = lifetimeMs;
    this.clock = clock;
    db.exec(`
      CREATE TABLE IF NOT EXISTS credentials (username TEXT PRIMARY KEY, salt TEXT NOT NULL, password_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS login_tokens (hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
    `);
    if (!db.prepare('SELECT username FROM credentials WHERE username = ?').get('admin')) {
      const salt = randomBytes(16).toString('hex');
      db.prepare('INSERT INTO credentials VALUES (?, ?, ?)').run('admin', salt, scryptSync('admin', salt, 32).toString('hex'));
    }
  }
  login(username, password) {
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 128 || password.length > 1024) return null;
    const saved = this.db.prepare('SELECT * FROM credentials WHERE username = ?').get('admin');
    const actual = scryptSync(password, saved.salt, 32);
    if (!timingSafeEqual(actual, Buffer.from(saved.password_hash, 'hex')) || username !== 'admin') return null;
    const token = randomBytes(32).toString('base64url');
    const expiresAt = this.clock() + this.lifetimeMs;
    this.db.prepare('DELETE FROM login_tokens WHERE expires_at <= ?').run(this.clock());
    this.db.prepare('INSERT INTO login_tokens VALUES (?, ?)').run(digest(token), expiresAt);
    return { token, expiresAt };
  }
  accepts(token) {
    if (typeof token !== 'string' || token.length > 128) return false;
    const row = this.db.prepare('SELECT expires_at FROM login_tokens WHERE hash = ?').get(digest(token));
    return Boolean(row && row.expires_at > this.clock());
  }
  logout(token) { this.db.prepare('DELETE FROM login_tokens WHERE hash = ?').run(digest(token)); }
}
