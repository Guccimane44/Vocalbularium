-- One-time conversions of stored content (D10, amended a fourth time, 0.7.5),
-- each recorded by name once scripts/migrate.mjs has applied it. Additive.
CREATE TABLE "data_migrations" (
	"name" text PRIMARY KEY NOT NULL
);
