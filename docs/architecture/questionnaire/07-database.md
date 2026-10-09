# 07 — Database (Q35–Q39)

PostgreSQL 18 is the only runtime database. These questions turn today's single-owner setup into a schema that can survive multi-user, search, and restore without rewrites.

## Q35. What is the tenancy unit?

**Decision:** One database per user, one schema per user, or shared tables keyed by `account_id`?

**Context:** Today there is one database, one owner account ID, and role separation (app/migrator/test) with no schema-creation rights for the app role ([local-postgresql](../local-postgresql.md)). Shared tables scale operationally (one backup, one migration) but make every query an authz query; separate databases isolate noisy neighbors and deletions at the cost of N migrations and connection sprawl.

**Options:**
- Shared tables + `account_id` — one migration path, cross-account analytics easy; every read/write must filter by account, and one bad query leaks across users.
- Schema per account — namespace isolation with shared backup; migration must loop schemas transactionally.
- Database per account — strongest isolation and per-user PITR/restore; connection pooling and migration orchestration get harder.

**Answer prompt:** Pick the unit and state how a request proves which account it may touch. Research task: count the queries that would need an account predicate under shared tables.

## Q36. How does the schema evolve?

**Decision:** Migration discipline: who writes SQL, when it runs, and what compatibility the old code keeps while new columns/tables land?

**Context:** Drizzle schema in `src/persistence/schema.ts`, reviewed SQL in `migrations/`, `db:generate` then `db:migrate` with the API stopped; normal startup never runs DDL; applied migrations are immutable ([local-postgresql](../local-postgresql.md)). The terminology migration demonstrated the pattern: rename via new migration, preserve IDs/relationships/timestamps, keep legacy contracts at the boundary ([terminology compatibility](../terminology-compatibility.md)).

**Options:**
- Stop-the-world reviewed migrations (current) — safest for correctness; needs downtime windows and the backend-before-extension order enforced.
- Expand–migrate–contract (additive first, backfill, then remove) — zero-downtime; each change ships 2–3 releases with compat shims.
- Auto-migrate on boot — fastest iteration; risks split-brain DDL across processes and unreviewed production changes. (Not recommended past single-owner.)

**Answer prompt:** Pick the discipline and the rollback story per migration. Research task: write the next hypothetical migration (e.g. adding referent columns from Q30) in expand–migrate–contract form and count the releases.

## Q37. How is search and sorting implemented?

**Decision:** PostgreSQL full-text (`tsvector`, per-language configs), trigram fuzzy search (`pg_trgm`), external engine (Typesense/Meilisearch), or no search at 1.0?

**Context:** Lists are bounded reads with explicit sort orders (Unicode NFKC + lowercase + code-unit + ID tiebreak) and cursor pagination; search does not exist ([reads tests](../../../README.md), scope). Multilingual content breaks naive stemming: German compounds, Chinese/Japanese tokenization, and mixed-language kartes need per-language configurations or external analyzers.

**Options:**
- PG full-text with per-language configs — no new service; needs language detection per karte and config plumbing.
- `pg_trgm` fuzzy — good for typo-tolerant title search; poor for semantic or cross-language queries.
- External engine — best relevance and CJK support; another service to sync, secure, and back up.
- No search (browse + sort only) — viable only for small libraries; state the karte-count ceiling where this breaks.

**Answer prompt:** Pick the engine and the indexed fields (main key only? all seites? deck names?). Research task: build a 5k-karte fixture with German/Chinese/English content and compare query relevance and latency across two options.

## Q38. What is the backup, export, and import story?

**Decision:** Whole-DB dumps plus what per-account operations: export (JSON/SQLite), import (Anki/CSV), and account deletion?

**Context:** `db:backup`/`restore` produce private custom-format dumps restored only into new `vocabularium_restore_*` databases for review, never overwriting live data ([local-postgresql](../local-postgresql.md)). Vocabulary import from old SQLite is an explicit future operation with no format promised; the old installation must be preserved untouched.

**Options:**
- Whole-DB dumps only — sufficient for single-owner disaster recovery; no user-facing portability.
- Per-account export (JSON) + import (CSV/Anki) — real portability; needs a versioned interchange schema and a generation-history policy on import (fresh attempts vs carried outcomes).
- Full GDPR erasure pipeline — required for public users; needs a deletion manifest (DB rows, backups, journals, logs, provider-side data) with verification.

**Answer prompt:** Define the formats and the deletion guarantee. Research task: export one deck by hand as JSON and re-import it into a fresh database; list every field that did not round-trip.

## Q39. What is retained and for how long?

**Decision:** Retention per data class: karte content, edit history, generation attempts/journals, operation receipts, server logs, deleted data, backups.

**Context:** Receipts must replay identically as long as historical receipts are retained (fingerprints pin original kinds/fields); journal files and `{ok,text}` results are kept verbatim; applied migrations stay immutable ([terminology compatibility](../terminology-compatibility.md)). Nothing states when any of this may be deleted.

**Options:**
- Keep everything forever — simplest code, unbounded growth, conflicts with erasure requests.
- Tiered retention (content durable; attempts/journals/logs time-boxed; backups rotated) — bounded growth; needs purge jobs and restore-from-purge testing.
- Minimal (content + latest outcome only) — smallest footprint; destroys provenance and eval history (see Q33).

**Answer prompt:** Write the retention table (class → duration → purge mechanism → verification). Research task: measure one month of journal + log growth under realistic capture volume and project a year.
