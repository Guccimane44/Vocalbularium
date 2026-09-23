CREATE TABLE "account" (
	"id" integer PRIMARY KEY NOT NULL,
	"default_deck_id" text NOT NULL,
	CONSTRAINT "singleton_account" CHECK ("account"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"page_id" text NOT NULL,
	"installation_id" text NOT NULL,
	"session_id" text NOT NULL,
	"epoch" bigint NOT NULL,
	"modules" text NOT NULL,
	"state" text DEFAULT 'loading' NOT NULL,
	"result" text,
	CONSTRAINT "attempt_state" CHECK ("attempts"."state" in ('loading', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_id" text NOT NULL,
	"selected_text" text,
	"created_at" text NOT NULL,
	"interpretation" text
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"username" text PRIMARY KEY NOT NULL,
	"salt" text NOT NULL,
	"password_hash" text NOT NULL,
	"account_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ordinal" bigserial NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"id" text PRIMARY KEY NOT NULL,
	"epoch" bigint NOT NULL,
	"session_id" text NOT NULL,
	CONSTRAINT "session_epoch" CHECK ("installations"."epoch" > 0)
);
--> statement-breakpoint
CREATE TABLE "layout_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_id" text NOT NULL,
	"position" integer NOT NULL,
	"modules" text NOT NULL,
	CONSTRAINT "page_position" CHECK ("layout_pages"."position" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"hash" text PRIMARY KEY NOT NULL,
	"expires_at" bigint NOT NULL,
	"account_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"card_id" text NOT NULL,
	"page_id" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"status" text,
	"attempt_id" text,
	CONSTRAINT "pages_card_id_page_id_pk" PRIMARY KEY("card_id","page_id"),
	CONSTRAINT "page_status" CHECK ("pages"."status" in ('loading', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"result" text NOT NULL,
	CONSTRAINT "receipt_operation" UNIQUE("operation_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_default_deck_id_decks_id_fk" FOREIGN KEY ("default_deck_id") REFERENCES "public"."decks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_page_id_layout_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."layout_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_installation_id_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layout_pages" ADD CONSTRAINT "layout_pages_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_page_id_layout_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."layout_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_session_state" ON "attempts" USING btree ("installation_id","session_id","state");--> statement-breakpoint
CREATE INDEX "attempts_card_state" ON "attempts" USING btree ("card_id","state");--> statement-breakpoint
CREATE INDEX "attempts_page" ON "attempts" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "cards_deck_created" ON "cards" USING btree ("deck_id","created_at","id");--> statement-breakpoint
CREATE INDEX "layout_deck_position" ON "layout_pages" USING btree ("deck_id","position");--> statement-breakpoint
CREATE INDEX "tokens_expiry" ON "login_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "pages_layout" ON "pages" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "pages_attempt" ON "pages" USING btree ("attempt_id");