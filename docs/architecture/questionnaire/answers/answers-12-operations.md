### 62

- Logs + metrics (Prometheus-style counters/histograms) — trend-visible; needs a metrics endpoint, dashboards, and alert thresholds.


### 63

- Redacted-by-default logs (IDs, timings, outcome codes; text only with explicit per-karte consent + expiry) — supportable; needs a consent flow and redaction tests.

### 64

Q64. How is the extension distributed and updated?
Decision: Chrome Web Store distribution with automatic updates, backed by an explicit backend compatibility window. Manual unpacked installation remains a development/debugging path only. Backend changes are deployed before the extension version that depends on them; database migrations follow expand–migrate–contract. Generation jobs are server-owned and continue independently of the extension lifecycle.
5-step user update procedure:
1. Chrome automatically downloads the new extension version from the Chrome Web Store.
2. The extension reloads/restarts when Chrome activates the new version; the user may briefly lose the extension UI.
3. Any in-flight generation continues on the backend because jobs are not owned by the extension.
4. After the extension reconnects, it fetches the current generation state and displays the result or failure.
5. If the update cannot connect to the backend, the extension shows a clear compatibility/update error rather than silently failing.
Rollback procedure:
1. Stop the rollout and identify the affected extension/backend version using telemetry.
2. Restore the previous backend application version that is compatible with both the previous and current extension where possible.
3. If the extension release itself is faulty, halt further Web Store rollout and publish a fixed compatible version.
4. Verify generation, authentication, capture, and existing in-flight jobs.
5. Keep database changes backward-compatible through the expand–migrate–contract process; do not rely on destructive database rollback.
Compatibility rule: A new backend must support the previous extension version for a defined window, and a new extension must not depend on backend functionality that has not already been deployed.

### 65

2. Option B — Quota included in the product

### 66

- Documented RPO/RTO with tested restores (e.g. RPO 24h, RTO 4h) — needs scheduled backups, restore rehearsals (Stage 4/7 pattern), and status communication.
