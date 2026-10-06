### Q35

shared tables + `account_id` — one migration path, cross-account analytics easy; every read/write must filter by account, and one bad query leaks across users.

### Q36

Expand–migrate–contract (additive first, backfill, then remove) 

### Q37

pg_trgm fuzzy — good for typo-tolerant title search; poor for semantic or cross-language queries.

### Q38

Per-account export (JSON) + import (CSV/Anki) — real portability; needs a versioned interchange schema and a generation-history policy on import (fresh attempts vs carried outcomes).

### Q39

Tiered retention (content durable; attempts/journals/logs time-boxed; backups rotated) — bounded growth; needs purge jobs and restore-from-purge testing.
