### Q57

- Multi-user model (malicious users attacking each other + the server) — adds IDOR testing (can account A read account B's karte/receipt/journal?), quota abuse, and prompt-abuse controls.

### Q58

- Real credential store (hashed passwords + server-side sessions + CSRF + login throttling) — baseline for any multi-user or hosted story. And add Delegated identity (OAuth/passkey via provider) later.

### Q59

- Text-only rendering + escaping everywhere. No rich formatting

### Q60

- Capturing and organizing information does not require sending it to an external AI provider. External processing happens only when the user explicitly requests generation, and only the information necessary for that generation is sent. Stored captures can be deleted by the user according to the application's retention policy.

### Q61

- Store-minimum (privacy policy + disclosures + export/delete) — baseline for Web Store distribution.

