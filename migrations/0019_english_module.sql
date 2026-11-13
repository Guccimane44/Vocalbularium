-- One English module (D31): English (British) and English (American) become
-- English. Decks, pages, cards and their audio stay as written; only the module
-- type changes, in the deck's modules, the page's components and any attempt.
UPDATE "deck_modules" SET "type" = 'english' WHERE "type" IN ('english-british', 'english-american');--> statement-breakpoint
UPDATE "components" SET "module_type" = 'english' WHERE "module_type" IN ('english-british', 'english-american');--> statement-breakpoint
UPDATE "component_attempts" SET "module" = jsonb_set("module"::jsonb, '{type}', '"english"')::text
	WHERE ("module"::jsonb ->> 'type') IN ('english-british', 'english-american');
