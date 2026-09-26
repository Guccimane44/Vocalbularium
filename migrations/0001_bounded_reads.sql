ALTER TABLE "cards" ADD COLUMN "front_sort_key" "bytea" DEFAULT '\x'::bytea NOT NULL;--> statement-breakpoint
CREATE INDEX "cards_deck_created_desc_id" ON "cards" USING btree ("deck_id","created_at" COLLATE "C" DESC,"id" COLLATE "C" ASC);--> statement-breakpoint
CREATE INDEX "cards_deck_created_asc_id" ON "cards" USING btree ("deck_id","created_at" COLLATE "C" ASC,"id" COLLATE "C" ASC);--> statement-breakpoint
CREATE INDEX "cards_deck_front_asc_id" ON "cards" USING btree ("deck_id","front_sort_key","id" COLLATE "C" ASC);--> statement-breakpoint
CREATE INDEX "cards_deck_front_desc_id" ON "cards" USING btree ("deck_id","front_sort_key" DESC,"id" COLLATE "C" ASC);--> statement-breakpoint
CREATE INDEX "cards_recent_captures" ON "cards" USING btree ("created_at" COLLATE "C" DESC,"id" COLLATE "C" ASC) WHERE "cards"."selected_text" IS NOT NULL;
