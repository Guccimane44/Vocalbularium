ALTER TABLE "components" ADD COLUMN "module_type" text;--> statement-breakpoint
CREATE UNIQUE INDEX "components_single_main_key_module" ON "components" USING btree ("page_id") WHERE "components"."module_type" = 'main-key';--> statement-breakpoint
CREATE UNIQUE INDEX "components_single_context_module" ON "components" USING btree ("page_id") WHERE "components"."module_type" = 'context';--> statement-breakpoint
CREATE UNIQUE INDEX "deck_modules_single_main_key" ON "deck_modules" USING btree ("deck_id") WHERE "deck_modules"."type" = 'main-key';--> statement-breakpoint
CREATE UNIQUE INDEX "deck_modules_single_context" ON "deck_modules" USING btree ("deck_id") WHERE "deck_modules"."type" = 'context';