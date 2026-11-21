# Local PostgreSQL development

The API now requires Node 24 and PostgreSQL 18. PostgreSQL is its only runtime database. The Drizzle schema is in `src/persistence/schema.ts`; reviewed SQL and migration metadata are in `migrations/`. How the store orders, recovers and owns its database, and how the tests make disposable databases, is in the [store](../subsystems/store.md) reference.

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
| `vocabularium_test` | Non-superuser login that can create and drop its disposable test/restore databases |

Generated connection settings go into ignored `.env.postgres`, created with mode `0600`. Setup preserves this file on subsequent runs. `npm start` reads `.env` for provider settings and `.env.postgres` for database connections. Keep both server-side. Neither is included in the extension package.

`npm run db:setup` applies migrations and grants application privileges. Future schema changes use `npm run db:generate` to generate SQL for review, then `npm run db:migrate` with the API stopped. Normal startup never performs DDL. Keep PostgreSQL on major version 18; apply compatible 18.x maintenance updates deliberately, with a backup and a regression run. CI uses the maintained `postgres:18` image.

The API binds to `127.0.0.1:4318` by default. Startup rejects non-loopback API binding for this single-account development milestone. Login remains `admin` / `admin`. The first startup seeds one empty **My Deck**. Stopping the API does not stop PostgreSQL or remove its data. The manual cluster-start command above does not configure automatic startup after a machine reboot.

## Keep the old installation separate

Use a **new Chrome profile** for this PostgreSQL environment and load the local build from `artifacts/extension`. Keep the existing hosted extension/profile and every SQLite file intact. Do not move old local capture receipts or pending saves into the new profile. There is no automatic SQLite import, old-account export, or in-place cache/session cutover in Stage 4. Existing vocabulary import remains an explicit future operation.

The former Render/SQLite deployment is retired. Later hosting needs PostgreSQL, deliberate data cutover, authenticated deployment configuration, and durable journal storage.

## Backup and restore into a separate database

With PostgreSQL 18 tools on `PATH` (or `PG_BIN` pointing at their directory):

```sh
npm run db:backup -- .data/development-backup.dump
npm run db:restore -- .data/development-backup.dump vocabularium_restore_review
```

Backup refuses an existing output path and creates a private custom-format dump. Restore creates a **new** database owned by the test role; it accepts only `vocabularium_restore_*` names and never drops or overwrites a database. The archive excludes ownership/grants. Inspect a restored database with the test role, using its generated password locally without sharing the connection URL. A failed restore leaves its new database available for diagnosis. Confirm application login, default-deck/page/component relationships, representative page text, and operation replay before using restored data. Do not overwrite the live development database as a restore test.

The [Stage 4 rehearsal](../history/evidence/v0.3.0-stage4-postgresql.md) restored the fresh development seed. The [Stage 7 rehearsal](../history/evidence/v0.3.0-stage7-local-candidate.md) additionally restored the current development backup and a separate populated synthetic account, then verified login, relationships, representative text and operation replay. The agent rehearsal did not include a physical machine reboot or native Windows PostgreSQL/browser run. The owner accepted Stage 7 without supplying itemized results of those checks; native Windows behavior remains unverified in this record.

## References

- [Drizzle PostgreSQL setup](https://orm.drizzle.team/docs/get-started-postgresql)
- [Drizzle migration workflow](https://orm.drizzle.team/docs/migrations)
- [PostgreSQL 18 client timeouts](https://www.postgresql.org/docs/18/runtime-config-client.html)
