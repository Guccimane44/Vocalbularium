# Local PostgreSQL development (v0.3.0, Stage 4)

The API now requires Node 24 and PostgreSQL 18. PostgreSQL is its only runtime database. The Drizzle schema is in `src/persistence/schema.ts`; reviewed SQL and migration metadata are in `migrations/`. Current product behavior remains governed by the [MVP scope](../MVP-Product-scope.md) and [Select and Add](../MVP-Product-spec-select-and-add.md).

## Start locally

Use the installed Homebrew PostgreSQL 18 on the development Mac. First check the listener and cluster status; do not initialize another cluster over existing data or stop an unrelated server.

```sh
export PATH="/opt/homebrew/opt/postgresql@18/bin:$PATH"
pg_isready -h 127.0.0.1 -p 5432
pg_ctl -D /opt/homebrew/var/postgresql@18 status
```

If this cluster is shut down and the port is free, start it on loopback:

```sh
pg_ctl -D /opt/homebrew/var/postgresql@18 \
  -l /opt/homebrew/var/log/postgresql@18.log -o '-h 127.0.0.1' start
npm ci
npm run db:setup
npm start
```

Setup uses the current macOS user's local PostgreSQL administrator connection to the `postgres` maintenance database. `POSTGRES_ADMIN_URL` can select another **loopback** administrator connection. Setup refuses a conflicting existing role/database instead of replacing it. It creates:

| Resource | Purpose |
| --- | --- |
| `vocabularium_dev` | Persistent development account, owned by the migration role |
| `vocabularium_migrator` | Login with schema ownership; no superuser, database-creation, or role-creation privilege |
| `vocabularium_app` | API login with table/sequence access; no schema-creation, database-creation, or role-creation privilege |
| `vocabularium_test` | Non-superuser login that can create its disposable test/restore databases |

Generated connection settings go into ignored `.env.postgres`, created with mode `0600`. Setup preserves this file on subsequent runs. `npm start` reads `.env` for provider settings and `.env.postgres` for database connections. Keep both server-side. Neither is included in the extension package.

`npm run db:setup` applies migrations and grants application privileges. Future schema changes use `npm run db:generate` to generate SQL for review, then `npm run db:migrate` with the API stopped. Normal startup never performs DDL. Keep PostgreSQL on major version 18; apply compatible 18.x maintenance updates deliberately, with a backup and a regression run. CI uses the maintained `postgres:18` image.

The API binds to `127.0.0.1:4318` by default. Startup rejects non-loopback API binding for this single-account development milestone. Login remains `admin` / `admin`. The first startup seeds one empty **My Deck**. Stopping the API does not stop PostgreSQL or remove its data. The manual cluster-start command above does not configure automatic startup after a machine reboot.

## Keep the old installation separate

Use a **new Chrome profile** for this PostgreSQL environment and load the local build from `artifacts/extension`. Keep the existing hosted extension/profile and every SQLite file intact. Do not move old local capture receipts or pending saves into the new profile. There is no automatic SQLite import, old-account export, or in-place cache/session cutover in Stage 4. Existing vocabulary import remains an explicit future operation.

The existing Render deployment is a separate historical MVP environment; do not deploy this local branch through its old SQLite setup. Later hosting needs PostgreSQL, deliberate data cutover, authenticated deployment configuration, and durable journal storage.

## Ordering, recovery, and single-process ownership

The persistence boundary has an explicit owner account ID. Only account `1` is supported; this is not multi-tenant authorization. Complete validated commands are admitted to the per-account executor before asynchronous handler authentication. Initial authentication also runs in that executor. Each mutation commits with its operation receipt before acknowledgment. Replaying an operation returns the original result and sequence; a different payload with the same operation ID is rejected.

All account mutations, authentication writes, generation transitions, and assembled reads use the same ordered executor. Transactions acquire the account row lock and use repeatable-read isolation, so a snapshot cannot combine different layout/card revisions. Query, lock, connection, and idle-transaction waits are bounded. Provider calls run outside the executor and transactions. A save rejected while a page is generating is not queued for eventual application; the user must resubmit explicitly under the existing [recovery rules](../MVP-Product-spec-select-and-add.md#saving-and-synchronization-failures).

One dedicated pool connection holds an advisory ownership lock. A second API or a migration attempt against an active API fails. This enforces the one-process deployment limit; database locks alone are not used to claim cross-process arrival ordering. The pool holds at most five connections including ownership. If ownership is lost, readiness fails and account operations stop until the API restarts; liveness still responds.

Completed provider results that cannot reach PostgreSQL are retained in memory and in `DATA_DIR/generation-outbox`. Keep that directory on durable storage alongside database backups. Startup stages retained journal results without calling the provider again; unfinished attempts without a staged/journaled result fail. Publication still requires the originating browser session. No automatic provider retry or failed-save resubmission is introduced. If both the journal and database writes fail before a process exit, unstored output cannot be recovered; a retry remains necessary. PostgreSQL does not make the filesystem journal durable by itself.

## Verification and disposable databases

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
npm run build
python3 scripts/package.py
```

Tests load `.env.postgres` when present. CI supplies `TEST_DATABASE_ADMIN_URL` directly. It must address the loopback `postgres` maintenance database, never `vocabularium_dev`. Each fixture creates a random `vocabularium_test_<24 hex characters>` database, applies migrations, and drops only its own generated name during cleanup. A process killed outside test cleanup can leave disposable databases for manual inspection; there is no broad prefix-based reset command. Tests do not require local Docker and inject controlled generation providers.

Browser tests own ports 4317/4318 and temporary Chrome profiles. Check for listener conflicts before running them. The historical foundation prototype also uses a disposable PostgreSQL fixture during tests; manual use requires an explicitly provisioned `PROTOTYPE_DATABASE_URL` and must never point at the development account.

GitHub Actions runs database/browser suites on Linux with PostgreSQL 18. Ubuntu and Windows retain syntax, strict type checks, extension-worker checks, building, and packaging. Native Windows PostgreSQL/browser coverage is not claimed.

## Backup and restore into a separate database

With PostgreSQL 18 tools on `PATH` (or `PG_BIN` pointing at their directory):

```sh
npm run db:backup -- .data/development-backup.dump
npm run db:restore -- .data/development-backup.dump vocabularium_restore_review
```

Backup refuses an existing output path and creates a private custom-format dump. Restore creates a **new** database owned by the test role; it accepts only `vocabularium_restore_*` names and never drops or overwrites a database. The archive excludes ownership/grants. Inspect a restored database with the test role, using its generated password locally without sharing the connection URL. A failed restore leaves its new database available for diagnosis. Confirm application login, default-deck/page relationships, representative card text, and operation replay before using restored data. Do not overwrite the live development database as a restore test.

A Stage 4 rehearsal restored the fresh development seed and verified its relationships and login. This establishes the commands, not the final release's populated-account/machine-restart acceptance; see the [Stage 4 evidence](../evidence/v0.3.0-stage4-postgresql.md).

## References

- [Drizzle PostgreSQL setup](https://orm.drizzle.team/docs/get-started-postgresql)
- [Drizzle migration workflow](https://orm.drizzle.team/docs/migrations)
- [PostgreSQL 18 client timeouts](https://www.postgresql.org/docs/18/runtime-config-client.html)
