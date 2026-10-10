# 11 — Security and privacy (Q57–Q61)

Security here is not abstract: captured web text is untrusted input, generated content is rendered output, and the LLM key is the most valuable secret on the server. Decide the threat model before adding surfaces.

## Q57. What is the threat model?

**Decision:** What is sensitive (captured text, URLs, generated content, API keys, logs), who is the adversary (malicious webpage, malicious user, network observer), and what is explicitly out of scope?

**Context:** Generated content renders as plain text today, which neutralizes stored markup; any move to rich rendering (Q13) reopens stored XSS. Captured text flows into prompts, which reopens instruction override (Q51). The API bound loopback-only with no public auth surface ([local-postgresql](../local-postgresql.md)).

**Options:**
- Local-adversary model (malicious page content + local network) — matches today; focus on sanitization and loopback binding.
- Multi-user model (malicious users attacking each other + the server) — adds IDOR testing (can account A read account B's page/receipt/journal?), quota abuse, and prompt-abuse controls.
- Public-service model (+ network attackers, CSRF, session theft, DDoS) — full web hardening: CSRF tokens, secure cookies, rate limits, WAF/CDN policy.

**Answer prompt:** Name the adversaries and the top five attacks you test per release. Research task: attempt one IDOR (fetch another account's page by ID) and one stored-markup capture in dev; record the outcome.

## Q58. How do auth, sessions, and secrets work?

**Decision:** Password hashing (argon2/scrypt), session storage and rotation, CSRF protection, login rate limiting — and where does each secret live?

**Context:** `admin`/`admin` with 7-day sessions; `OPENCODE_API_KEY` server-only via `.env`, never in the extension package; build-time `VOCABULARIUM_API_URL` sets host permissions; DB credentials in ignored `.env.postgres` with role separation (README, [local-postgresql](../local-postgresql.md)).

**Options:**
- Keep shared-secret single account — viable only for single-owner local use; document that it must never face the public internet.
- Real credential store (hashed passwords + server-side sessions + CSRF + login throttling) — baseline for any multi-user or hosted story.
- Delegated identity (OAuth/passkey via provider) — less secret storage; adds provider integration and account-recovery dependency.

**Answer prompt:** Draw the secret map (which secret lives where, who can read it, how it rotates). Research task: grep the extension bundle for anything resembling a key or connection string and confirm the package contains none.

## Q59. How is captured and generated content isolated?

**Decision:** What stops a malicious page from steering generation or smuggling markup/scripts into pages, deck names, or logs?

**Context:** Deck names, selected text, the captured Context, and generated text are user/attacker-influenced data rendered across dashboard, lists, editors, and feedback popups. Components are stored as block documents but render as plain text today ([model](../../product/model.md#component)); rendering richer blocks needs its own policy.

**Options:**
- Text-only rendering + escaping everywhere (current) — strongest default; any rich rendering must pass an allowlist review.
- Sanitized HTML subset — enables Q13 richness; needs a maintained sanitizer with tests per release.
- Per-module render contracts — each module declares its output grammar; most precise, most spec work.

**Answer prompt:** State the rendering rule and its test (which payloads must render inert). Research task: capture `<img src=x onerror=alert(1)>` and a deck name with markup; verify both render inert everywhere.

## Q60. What privacy promises hold for captures and prompts?

**Decision:** What of the capture (text, URL, context) is sent to the LLM, logged, or retained — and what can the user delete?

**Context:** Q07 decides the payload; Q39 decides retention. Provider terms decide what the model side retains. Without a key, capture still saves while generative components fail visibly — a privacy-relevant degraded mode (no data leaves the machine) worth naming (README).

**Options:**
- Local-first privacy (no capture leaves the machine without explicit generation) — strongest story; keyless mode becomes a feature, not just a failure.
- Full-pipeline (captures + context routinely sent) — best quality; needs consent, per-page opt-out, and provider zero-retention terms.
- Tiered (user picks per deck/page whether generation may use external models) — most control; most settings UI and policy plumbing.

**Answer prompt:** Write the promise in one paragraph a user could rely on. Research task: trace one capture from selection to stored component and list every system that saw its text (extension, API log, DB, journal, provider).

## Q61. What compliance obligations apply?

**Decision:** GDPR erasure/export? Provider DPA? Chrome Web Store privacy disclosures? Data jurisdiction? Age rating?

**Context:** Scope defers public onboarding and account management; the Windows guide already requires version/evidence reporting without API keys ([scope](../../product/scope.md), [windows-install](../../history/guides/windows-install.md)). None of this matters for single-owner local use; all of it matters the moment strangers sign up or data leaves the machine.

**Options:**
- None (single-owner local) — state it and the tripwire that reopens the question (first external user or hosted data).
- Store-minimum (privacy policy + disclosures + export/delete) — baseline for Web Store distribution.
- Full (DPA with provider, jurisdiction statement, retention schedule, incident process) — needed for EU users, teams, or paid plans.

**Answer prompt:** Pick the tier and the tripwire. Research task: read the Chrome Web Store privacy disclosure requirements and list what a hosted Vocabularium would have to declare.
