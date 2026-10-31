-- Spoken parts' audio (D24, 0.14.0): one clip per spoken line, with its own
-- state, deleted with its component. Additive: earlier components have none.
CREATE TABLE "component_audio" (
	"page_id" text NOT NULL,
	"component_id" text NOT NULL,
	"part" text NOT NULL,
	"line" integer NOT NULL,
	"text" text NOT NULL,
	"language" text NOT NULL,
	"token" text NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"error" text,
	"mime" text,
	"duration_ms" integer,
	"bytes" "bytea",
	"created_at" text NOT NULL,
	CONSTRAINT "component_audio_page_id_component_id_part_line_pk" PRIMARY KEY("page_id","component_id","part","line"),
	CONSTRAINT "component_audio_line" CHECK ("component_audio"."line" >= 0),
	CONSTRAINT "component_audio_state" CHECK ("component_audio"."state" in ('waiting', 'generating', 'ready', 'failed')),
	CONSTRAINT "component_audio_ready" CHECK (("component_audio"."state" = 'ready') = ("component_audio"."bytes" IS NOT NULL AND "component_audio"."mime" IS NOT NULL AND "component_audio"."duration_ms" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "component_audio" ADD CONSTRAINT "component_audio_page_id_component_id_components_page_id_id_fk" FOREIGN KEY ("page_id","component_id") REFERENCES "public"."components"("page_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "component_audio_state" ON "component_audio" USING btree ("state");