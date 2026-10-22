-- The interface language (D14, 0.9.0): English for every existing account. Additive.
ALTER TABLE "account" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_language" CHECK ("account"."language" in ('en', 'ar', 'es', 'fr', 'ru', 'zh-Hans'));
