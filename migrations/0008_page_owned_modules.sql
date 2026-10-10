-- The owner discarded the development test data (D02, 0.5.0). Accounts and sign-in stay.
TRUNCATE "receipts";--> statement-breakpoint
WITH "fresh" AS (
	INSERT INTO "decks" ("id", "name") SELECT gen_random_uuid()::text, 'My Deck' WHERE EXISTS (SELECT 1 FROM "account") RETURNING "id"
), "modules" AS (
	INSERT INTO "deck_modules" ("id", "deck_id", "position", "type")
	SELECT gen_random_uuid()::text, "fresh"."id", "m"."position", "m"."type"
	FROM "fresh", (VALUES (0, 'main-key'), (1, 'context'), (2, 'german-examples')) AS "m" ("position", "type")
)
UPDATE "account" SET "default_deck_id" = "fresh"."id" FROM "fresh";--> statement-breakpoint
-- Cascades to the old decks' modules, pages, components, runs and attempts.
DELETE FROM "decks" WHERE NOT EXISTS (SELECT 1 FROM "account" WHERE "account"."default_deck_id" = "decks"."id");--> statement-breakpoint
ALTER TABLE "components" DROP CONSTRAINT "component_kind";--> statement-breakpoint
ALTER TABLE "components" DROP CONSTRAINT "component_owner";--> statement-breakpoint
DROP INDEX "components_single_main_key";--> statement-breakpoint
DROP INDEX "components_single_context";--> statement-breakpoint
DROP INDEX "components_module_instance";--> statement-breakpoint
ALTER TABLE "components" ALTER COLUMN "module_instance_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "components" ALTER COLUMN "module_type" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "components_module_instance" ON "components" USING btree ("page_id","module_instance_id");--> statement-breakpoint
ALTER TABLE "components" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "decks" DROP COLUMN "capture_context";--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "component_limit" CHECK ("components"."position" between 0 and 11);--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "component_main_key_first" CHECK (("components"."module_type" = 'main-key') = ("components"."position" = 0));