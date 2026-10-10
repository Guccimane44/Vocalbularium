### Q57

- Multi-user model (malicious users attacking each other + the server) — adds IDOR testing (can account A read account B's page/receipt/journal?), quota abuse, and prompt-abuse controls.

### Q58

- Delegated identity at 1.0 (OAuth + passkeys; revised to resolve C2 with Q17). No password store. The server still owns server-side sessions (Q21), CSRF protection, login/callback throttling, and OAuth state/nonce and passkey challenge verification. Provider client secrets live only in server environment configuration.

### Q59

- Per-module render contracts (revised from text-only to resolve C1 with Q13 Block JSON). Each block type has an allowlisted renderer and a declared schema; anything outside the allowlist is rejected or rendered as escaped text. Text inside blocks is always escaped; no raw HTML from captures or model output is ever interpreted.

### Q60

- Capturing and organizing information does not require sending it to an external AI provider. External processing happens only when the user explicitly requests generation, and only the information necessary for that generation is sent. Stored captures can be deleted by the user according to the application's retention policy.

### Q61

- Store-minimum + GDPR baseline (revised to resolve C12 in the [traceability map](../traceability-map.md#conflicts)):
  - Store requirements: privacy policy, Chrome Web Store and Firefox Add-ons disclosures, export (Q38) and user deletion (Q60).
  - A data processing agreement with every provider that processes user data: Vercel, Neon, the LLM provider, and the OAuth providers. A transfer basis where a provider stores data outside the EU.
  - The production LLM provider's terms must cover user content (forces K4: OpenCode Go is a development stand-in, not the production path).
  - Account deletion cascades to all account rows and ages out of backups within the retention schedule (Q39, K7).
  - The privacy policy lists the providers.
  - A one-page breach-response process: who notices, who is told, and within what time.
  - No certification at 1.0; a short legal review before public launch.

