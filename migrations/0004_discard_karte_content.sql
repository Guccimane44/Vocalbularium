DROP TABLE "attempts" CASCADE;--> statement-breakpoint
DROP TABLE "kartes" CASCADE;--> statement-breakpoint
DROP TABLE "layout_seites" CASCADE;--> statement-breakpoint
DROP TABLE "seites" CASCADE;--> statement-breakpoint
-- The owner discarded all 0.3.0+ content (Q72). Accounts and sign-in stay.
TRUNCATE "receipts";--> statement-breakpoint
WITH "fresh" AS (
	INSERT INTO "decks" ("id", "name") SELECT gen_random_uuid()::text, 'My Deck' WHERE EXISTS (SELECT 1 FROM "account") RETURNING "id"
), "module" AS (
	INSERT INTO "deck_modules" ("id", "deck_id", "position", "type") SELECT gen_random_uuid()::text, "id", 0, 'german-examples' FROM "fresh"
)
UPDATE "account" SET "default_deck_id" = "fresh"."id" FROM "fresh";--> statement-breakpoint
DELETE FROM "decks" WHERE NOT EXISTS (SELECT 1 FROM "account" WHERE "account"."default_deck_id" = "decks"."id");
