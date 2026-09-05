import { env, waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { Store, type Database } from "@/lib/store";
import { applyMutation, mutationSchema, DomainError, available } from "@/lib/domain";
import { runGeneration, type RuntimeConfig } from "@/lib/generation";
import {
  authenticate,
  createSession,
  requestEmailCode,
  verifyEmailCode,
  appleStart,
  appleFinish,
  cookie,
  hash,
  limit,
} from "@/lib/auth";
export const dynamic = "force-dynamic";
const runtime = () => env as unknown as RuntimeConfig & { DB: Database };
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers },
  });
async function body(request: Request) {
  if (Number(request.headers.get("content-length")) > 32000)
    throw new DomainError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 32000) {
      await reader.cancel();
      throw new DomainError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder().decode(bytes);
  return text ? JSON.parse(text) : {};
}
function publicState(s: Awaited<ReturnType<Store["read"]>>) {
  const { receipts, ...state } = s;
  return { ...state, available: available(s) };
}
async function handle(request: Request) {
  const config = runtime(),
    store = new Store(config.DB),
    url = new URL(request.url),
    path = url.pathname.slice(5),
    secure = url.protocol === "https:";
  try {
    if (!config.DB) throw new DomainError(503, "Database setup is required.");
    const origin = request.headers.get("origin");
    if (
      request.method !== "GET" &&
      path !== "auth/apple/callback" &&
      origin &&
      origin !== url.origin &&
      origin !== config.APP_ORIGIN &&
      !request.headers.get("authorization")
    )
      throw new DomainError(403, "This request came from a different site.");
    if (path === "health") return json({ ok: true, version: "0.1.0" });
    if (path === "auth/config")
      return json({
        email: Boolean(config.RESEND_API_KEY && config.EMAIL_FROM && config.AUTH_SECRET),
        apple: Boolean(config.APPLE_CLIENT_ID && config.APPLE_REDIRECT_URI),
        preview: Boolean(request.headers.get("oai-authenticated-user-id")),
        generation: Boolean(config.OPENAI_API_KEY && config.OPENAI_MODEL),
      });
    if (path === "auth/preview" && request.method === "POST") {
      const platformId = request.headers.get("oai-authenticated-user-id");
      if (!platformId)
        throw new DomainError(
          401,
          "Open the private preview through your signed-in Sites session.",
        );
      const owner = "preview:" + (await hash(platformId)),
        email = request.headers.get("oai-authenticated-user-email") ?? "Private preview";
      await store.ensure(owner, email, "preview");
      const value = await createSession(store, owner);
      return json({ ok: true }, 200, { "Set-Cookie": cookie(value, secure) });
    }
    if (path === "auth/email/request" && request.method === "POST") {
      const data = z.object({ email: z.email().max(254) }).parse(await body(request));
      const id = await requestEmailCode(
        store,
        data.email.trim().toLowerCase(),
        config,
        request.headers.get("cf-connecting-ip") ?? "local",
      );
      return json({ challengeId: id });
    }
    if (path === "auth/email/verify" && request.method === "POST") {
      const data = z
        .object({
          challengeId: z.string().uuid(),
          code: z.string().regex(/^\d{6}$/),
          native: z.boolean().optional(),
        })
        .parse(await body(request));
      const value = await verifyEmailCode(store, data.challengeId, data.code, config);
      return json(data.native ? { token: value } : { ok: true }, 200, {
        "Set-Cookie": cookie(value, secure),
      });
    }
    if (path === "auth/apple/start" && request.method === "POST")
      return json(await appleStart(store, config));
    if (path === "auth/apple/callback" && request.method === "POST") {
      const form = await request.formData();
      const value = await appleFinish(
        store,
        String(form.get("state") ?? ""),
        String(form.get("id_token") ?? ""),
        config,
      );
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/",
          "Set-Cookie": cookie(value, secure),
          "Cache-Control": "no-store",
        },
      });
    }
    if (path === "auth/apple/native" && request.method === "POST") {
      const data = z
        .object({ state: z.string().uuid(), idToken: z.string().max(10000) })
        .parse(await body(request));
      const value = await appleFinish(store, data.state, data.idToken, config);
      return json({ token: value });
    }
    const owner = await authenticate(request, store);
    if (path === "sync" && request.method === "GET") {
      const s = await store.read(owner);
      if (url.searchParams.get("cursor") === String(s.revision))
        return json({ unchanged: true, revision: s.revision });
      return json(publicState(s));
    }
    if (path === "mutations" && request.method === "POST") {
      const m = mutationSchema.parse(await body(request));
      const result = await store.mutate(owner, (s) => applyMutation(s, m));
      if (["capture", "retry", "regenerate"].includes(m.type))
        waitUntil(runGeneration(store, owner, config).catch(() => {}));
      return json({ result: result.result, state: publicState(result.state) });
    }
    if (path === "jobs/run" && request.method === "POST") {
      await limit(store, "jobs:" + owner, 100, 60000);
      // Durable jobs are leased in D1 and recovered after interruption by the next client/cron tick.
      const ran = await runGeneration(store, owner, config);
      return json({ ran });
    }
    if (path === "account/export" && request.method === "GET") {
      const s = await store.read(owner);
      const { receipts, ...data } = s;
      return json(data, 200, {
        "Content-Disposition": 'attachment; filename="vocabularium-export.json"',
      });
    }
    if (path === "account" && request.method === "DELETE") {
      await store.delete(owner);
      return json({ ok: true }, 200, { "Set-Cookie": cookie("", secure, 0) });
    }
    if (path === "auth/logout" && request.method === "POST") {
      const value =
        request.headers.get("authorization")?.replace(/^Bearer /, "") ??
        request.headers.get("cookie")?.match(/(?:^|;\s*)vocab_session=([^;]+)/)?.[1];
      if (value)
        await store.db
          .prepare("DELETE FROM sessions WHERE token_hash=?")
          .bind(await hash(value))
          .run();
      return json({ ok: true }, 200, { "Set-Cookie": cookie("", secure, 0) });
    }
    if (path === "devices/token" && request.method === "POST")
      return json({ token: await createSession(store, owner), expiresInDays: 30 });
    throw new DomainError(404, "That action is not available.");
  } catch (error) {
    if (error instanceof DomainError) return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json({ error: error.issues.map((i) => i.message).join(" ") }, 400);
    if (error instanceof SyntaxError)
      return json({ error: "The request was not valid JSON." }, 400);
    console.error("API request failed", {
      path,
      type: error instanceof Error ? error.name : "unknown",
    });
    return json({ error: "This request could not be completed. Please try again." }, 500);
  }
}
export const GET = handle,
  POST = handle,
  DELETE = handle;
