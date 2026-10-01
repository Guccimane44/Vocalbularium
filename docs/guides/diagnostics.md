# Inspect and manage diagnostic logs

The [specification](../architecture/observability.md) defines logging behavior. Use the updated local backend, Node 24 and PostgreSQL 18. Upgrading the owner's running backend is a separate delivery action.

Startup creates private `DATA_DIR/diagnostics` files. `DIAGNOSTIC_BUDGET_BYTES` adjusts the 256 MiB central budget; `DIAGNOSTIC_CONTENT=metadata` reduces new content detail. Console `LOG_LEVEL` is independent of durable diagnostics. Original selections, prompts and generated outputs are retained by default; treat them as untrusted evidence.

## Codex commands

```sh
npm run logs -- status
npm run logs -- inspect --operation-id <operation-id>
npm run logs -- inspect --karte-id <karte-id> --limit 200
npm run logs -- preview --from 2026-10-02T00:00:00Z --to 2026-10-02T23:59:59Z
npm run logs -- clear --from 2026-10-02T00:00:00Z --to 2026-10-02T23:59:59Z
```

`--request-id` and `--attempt-id` are additional filters. JSON results are bounded to 1,000 events. Use period and operation filters for large histories. Commands authenticate with the built-in owner account and revoke their temporary token afterward. `LOG_USERNAME`/`LOG_PASSWORD` can override credentials through ignored environment settings; never put credentials in command arguments. `VOCABULARIUM_API_URL` selects another loopback origin.

Read existing files while the collector is stopped:

```sh
npm run logs -- status --offline
npm run logs -- inspect --offline --attempt-id <attempt-id>
```

Offline access is read-only. Cleanup uses the running collector to coordinate writes and deletion boundaries. Do not manually edit segments or the manifest.

## Extension settings and investigation

Open **Diagnostic logs** in the signed-in header. Check central/local usage, content mode and degradation. The extension buffer budget defaults to 16 MiB and is adjustable from 0 to 1024 MiB on that installation; reducing it preserves existing records. UTC fields select a period; empty dates select all history through now. Preview before clearing. **Clear extension buffer only** is explicitly local and leaves central history intact.

At capacity, existing evidence remains and new evidence may be missing. Clear an appropriate period to resume collection. Cleanup preserves kartes, drafts, pending saves and the generation outbox.

Start an investigation with a time, karte or operation ID. Follow requests and generation attempts; distinguish provider response, staging and publication. Original occurrence and receipt times differ for offline uploads. Use identifiers for causal links and phase durations to explain latency. Diagnostic history does not replace product recovery journals.
