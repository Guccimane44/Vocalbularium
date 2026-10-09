CREATE TABLE "component_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"component_id" text NOT NULL,
	"run_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"session_id" text NOT NULL,
	"epoch" bigint NOT NULL,
	"module" text NOT NULL,
	"state" text DEFAULT 'loading' NOT NULL,
	"result" text,
	CONSTRAINT "component_attempt_state" CHECK ("component_attempts"."state" in ('loading', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "components" (
	"page_id" text NOT NULL,
	"id" text NOT NULL,
	"kind" text NOT NULL,
	"module_instance_id" text,
	"position" integer NOT NULL,
	"content" text NOT NULL,
	"status" text,
	"attempt_id" text,
	CONSTRAINT "components_page_id_id_pk" PRIMARY KEY("page_id","id"),
	CONSTRAINT "component_kind" CHECK ("components"."kind" in ('main_key', 'context', 'module', 'manual')),
	CONSTRAINT "component_owner" CHECK (("components"."kind" = 'module') = ("components"."module_instance_id" IS NOT NULL)),
	CONSTRAINT "component_status" CHECK ("components"."status" in ('loading', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "deck_modules" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_id" text NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "deck_module_position" UNIQUE("deck_id","position"),
	CONSTRAINT "deck_module_limit" CHECK ("deck_modules"."position" between 0 and 11)
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"page_id" text NOT NULL,
	"interpretation" text
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_id" text NOT NULL,
	"selected_text" text,
	"created_at" text NOT NULL,
	"main_key_sort_key" "bytea" DEFAULT '\x'::bytea NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "view" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE "component_attempts" ADD CONSTRAINT "component_attempts_run_id_generation_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."generation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_attempts" ADD CONSTRAINT "component_attempts_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_attempts" ADD CONSTRAINT "component_attempts_page_id_component_id_components_page_id_id_fk" FOREIGN KEY ("page_id","component_id") REFERENCES "public"."components"("page_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "components" ADD CONSTRAINT "components_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_modules" ADD CONSTRAINT "deck_modules_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "component_attempts_session_state" ON "component_attempts" USING btree ("installation_id","session_id","state");--> statement-breakpoint
CREATE INDEX "component_attempts_page_state" ON "component_attempts" USING btree ("page_id","state");--> statement-breakpoint
CREATE INDEX "component_attempts_run" ON "component_attempts" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "components_attempt" ON "components" USING btree ("attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "components_module_instance" ON "components" USING btree ("page_id","module_instance_id") WHERE "components"."module_instance_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "components_single_main_key" ON "components" USING btree ("page_id") WHERE "components"."kind" = 'main_key';--> statement-breakpoint
CREATE UNIQUE INDEX "components_single_context" ON "components" USING btree ("page_id") WHERE "components"."kind" = 'context';--> statement-breakpoint
CREATE INDEX "generation_runs_page" ON "generation_runs" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "pages_deck_created_desc_id" ON "pages" USING btree ("deck_id","created_at" COLLATE "C" DESC,"id" COLLATE "C" ASC);--> statement-breakpoint
CREATE INDEX "pages_deck_created_asc_id" ON "pages" USING btree ("deck_id","created_at" COLLATE "C" ASC,"id" COLLATE "C" ASC);--> statement-breakpoint
CREATE INDEX "pages_deck_main_key_asc_id" ON "pages" USING btree ("deck_id","main_key_sort_key","id" COLLATE "C" ASC);--> statement-breakpoint
CREATE INDEX "pages_deck_main_key_desc_id" ON "pages" USING btree ("deck_id","main_key_sort_key" DESC,"id" COLLATE "C" ASC);--> statement-breakpoint
CREATE INDEX "pages_recent_captures" ON "pages" USING btree ("created_at" COLLATE "C" DESC,"id" COLLATE "C" ASC) WHERE "pages"."selected_text" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "deck_view" CHECK ("decks"."view" in ('default'));