CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL,
	"text" text NOT NULL,
	"screen" text NOT NULL,
	"page_id" text,
	"component_id" text,
	"module_type" text,
	"builds" text NOT NULL,
	"page" text,
	"logs" text,
	"issue" integer,
	CONSTRAINT "report_text" CHECK (length("reports"."text") between 1 and 2000)
);
--> statement-breakpoint
CREATE INDEX "reports_unfiled" ON "reports" USING btree ("created_at") WHERE "reports"."issue" IS NULL;