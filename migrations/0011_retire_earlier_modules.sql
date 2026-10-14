-- Parent modules (D08, 0.7.0) retire German explanation, German explanation +
-- examples and Sentence usage. The owner discarded the development data, as in
-- 0008: accounts and sign-in stay, and the account starts again with one My
-- Deck holding the main key, Context and German with all four facets.
TRUNCATE "receipts";--> statement-breakpoint
WITH "fresh" AS (
	INSERT INTO "decks" ("id", "name") SELECT gen_random_uuid()::text, 'My Deck' WHERE EXISTS (SELECT 1 FROM "account") RETURNING "id"
), "modules" AS (
	INSERT INTO "deck_modules" ("id", "deck_id", "position", "type", "facets")
	SELECT gen_random_uuid()::text, "fresh"."id", "m"."position", "m"."type", "m"."facets"
	FROM "fresh", (VALUES (0, 'main-key', '{}'::text[]), (1, 'context', '{}'::text[]),
		(2, 'german', '{article,examples,synonyms,antonyms}'::text[])) AS "m" ("position", "type", "facets")
)
UPDATE "account" SET "default_deck_id" = "fresh"."id" FROM "fresh";--> statement-breakpoint
-- Cascades to the old decks' modules, pages, components, runs and attempts.
DELETE FROM "decks" WHERE NOT EXISTS (SELECT 1 FROM "account" WHERE "account"."default_deck_id" = "decks"."id");
