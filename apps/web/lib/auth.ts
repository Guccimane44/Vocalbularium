import { createRemoteJWKSet, jwtVerify } from "jose";
import { DomainError } from "./domain";
import { Store } from "./store";
import type { RuntimeConfig } from "./generation";
export const hash = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const token = () => crypto.randomUUID() + crypto.randomUUID();
export function cookie(value: string, secure: boolean, maxAge = 60 * 60 * 24 * 30) {
  return (
    "vocab_session=" +
    value +
    "; HttpOnly; SameSite=Lax; Path=/; Max-Age=" +
    maxAge +
    (secure ? "; Secure" : "")
  );
}
export async function authenticate(request: Request, store: Store) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  const value =
    bearer ?? request.headers.get("cookie")?.match(/(?:^|;\s*)vocab_session=([^;]+)/)?.[1];
  if (!value) throw new DomainError(401, "Sign in to open your library.");
  const row = await store.db
    .prepare("SELECT owner FROM sessions WHERE token_hash=? AND expires>?")
    .bind(await hash(value), Date.now())
    .first<{ owner: string }>();
  if (!row) throw new DomainError(401, "Your session expired. Sign in again.");
  return (await store.read(row.owner)).owner;
}
export async function createSession(store: Store, owner: string) {
  const value = token();
  await store.db
    .prepare("INSERT INTO sessions(token_hash,owner,expires) VALUES(?,?,?)")
    .bind(await hash(value), owner, Date.now() + 30 * 86400000)
    .run();
  return value;
}
export async function limit(store: Store, key: string, max: number, windowMs: number) {
  const bucket = Math.floor(Date.now() / windowMs),
    id = key + ":" + bucket;
  await store.db
    .prepare(
      "INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
    )
    .bind(id, (bucket + 1) * windowMs)
    .run();
  const row = await store.db
    .prepare("SELECT count FROM rate_limits WHERE key=?")
    .bind(id)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > max)
    throw new DomainError(429, "Too many attempts. Please try again later.");
}
async function keyedHash(value: string, config: RuntimeConfig) {
  if (!config.AUTH_SECRET || config.AUTH_SECRET.length < 32)
    throw new DomainError(503, "Sign-in service is not configured yet.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function requestEmailCode(
  store: Store,
  email: string,
  config: RuntimeConfig,
  ip: string,
) {
  if (!config.RESEND_API_KEY || !config.EMAIL_FROM)
    throw new DomainError(503, "Email sign-in is not configured yet.");
  await limit(store, "email:" + (await hash(email)), 5, 3600000);
  await limit(store, "ip:" + ip, 20, 3600000);
  const id = crypto.randomUUID();
  const random = crypto.getRandomValues(new Uint32Array(1))[0];
  const code = String(random % 1000000).padStart(6, "0");
  await store.db
    .prepare(
      "INSERT INTO challenges(id,identity,secret_hash,expires,attempts,created,used) VALUES(?,?,?,?,0,?,0)",
    )
    .bind(
      id,
      "email:" + email,
      await keyedHash(id + ":" + code, config),
      Date.now() + 600000,
      Date.now(),
    )
    .run();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + config.RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.EMAIL_FROM,
      to: [email],
      subject: "Your Vocabularium sign-in code",
      text:
        "Your Vocabularium sign-in code is " +
        code +
        ". It expires in 10 minutes. If you did not request it, you can ignore this message.",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new DomainError(502, "The email could not be sent. Please try again.");
  return id;
}
export async function verifyEmailCode(
  store: Store,
  id: string,
  code: string,
  config: RuntimeConfig,
) {
  const row = await store.db
    .prepare(
      "UPDATE challenges SET attempts=attempts+1 WHERE id=? AND used=0 AND expires>? AND attempts<5 RETURNING identity,secret_hash",
    )
    .bind(id, Date.now())
    .first<{ identity: string; secret_hash: string }>();
  if (
    !row ||
    !row.identity.startsWith("email:") ||
    row.secret_hash !== (await keyedHash(id + ":" + code, config))
  )
    throw new DomainError(400, "The code is incorrect, expired, or has too many attempts.");
  const used = await store.db
    .prepare("UPDATE challenges SET used=1 WHERE id=? AND used=0")
    .bind(id)
    .run();
  if (used.meta.changes !== 1) throw new DomainError(400, "This code has already been used.");
  const email = row.identity.slice(6),
    owner = "email:" + (await hash(email));
  await store.ensure(owner, email, "live");
  return createSession(store, owner);
}
const appleKeys = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
export async function appleStart(store: Store, config: RuntimeConfig) {
  if (!config.APPLE_CLIENT_ID || !config.APPLE_REDIRECT_URI)
    throw new DomainError(503, "Sign in with Apple is not configured yet.");
  const id = crypto.randomUUID(),
    nonce = token();
  await store.db
    .prepare(
      "INSERT INTO challenges(id,identity,secret_hash,expires,attempts,created,used) VALUES(?,?,?,?,0,?,0)",
    )
    .bind(id, "apple", await hash(nonce), Date.now() + 600000, Date.now())
    .run();
  const params = new URLSearchParams({
    client_id: config.APPLE_CLIENT_ID.split(",")[0],
    redirect_uri: config.APPLE_REDIRECT_URI,
    response_type: "code id_token",
    response_mode: "form_post",
    scope: "name email",
    state: id,
    nonce,
  });
  return {
    url: "https://appleid.apple.com/auth/authorize?" + params,
    state: id,
    nonce,
    clientId: config.APPLE_CLIENT_ID,
  };
}
export async function appleFinish(
  store: Store,
  state: string,
  idToken: string,
  config: RuntimeConfig,
) {
  if (!config.APPLE_CLIENT_ID) throw new DomainError(503, "Apple sign-in is not configured.");
  const { payload } = await jwtVerify(idToken, appleKeys, {
    issuer: "https://appleid.apple.com",
    audience: config.APPLE_CLIENT_ID.split(","),
    algorithms: ["RS256"],
  });
  if (!payload.sub || typeof payload.nonce !== "string")
    throw new DomainError(401, "Apple sign-in could not be verified.");
  const row = await store.db
    .prepare(
      "SELECT secret_hash FROM challenges WHERE id=? AND identity=? AND used=0 AND expires>?",
    )
    .bind(state, "apple", Date.now())
    .first<{ secret_hash: string }>();
  if (!row || row.secret_hash !== (await hash(payload.nonce)))
    throw new DomainError(401, "Apple sign-in expired or did not match this request.");
  const used = await store.db
    .prepare("UPDATE challenges SET used=1 WHERE id=? AND used=0")
    .bind(state)
    .run();
  if (used.meta.changes !== 1)
    throw new DomainError(401, "This Apple sign-in has already been used.");
  const owner = "apple:" + (await hash(payload.sub)),
    email =
      typeof payload.email === "string" &&
      (payload.email_verified === true || payload.email_verified === "true")
        ? payload.email
        : "Apple account";
  // Deliberately keep identities separate until an explicit verified linking flow is available.
  await store.ensure(owner, email, "live");
  return createSession(store, owner);
}
