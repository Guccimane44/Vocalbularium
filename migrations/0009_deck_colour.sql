-- Decks get an optional colour chosen in deck settings (D06). Existing decks keep
-- none and show the colour derived from their ID, so nothing changes on upgrade.
ALTER TABLE "decks" ADD COLUMN "colour" text;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "deck_colour" CHECK ("decks"."colour" in ('meaning', 'usage', 'roots', 'connections', 'sound', 'notes'));