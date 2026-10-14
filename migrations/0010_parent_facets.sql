-- Parent modules with facets (D08, 0.7.0): a facet list on deck modules and
-- components, and run order for a page's latest interpretation. Additive.
ALTER TABLE "components" ADD COLUMN "facets" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "deck_modules" ADD COLUMN "facets" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "ordinal" bigserial NOT NULL;