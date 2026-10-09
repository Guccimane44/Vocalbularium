-- Rename identifiers only. Receipt JSON/fingerprints stay intact for replay
-- through the explicit compatibility adapter; user content is never rewritten.
ALTER TABLE "cards" RENAME TO "kartes";
--> statement-breakpoint
ALTER TABLE "layout_pages" RENAME TO "layout_seites";
--> statement-breakpoint
ALTER TABLE "pages" RENAME TO "seites";
--> statement-breakpoint
ALTER TABLE "attempts" RENAME COLUMN "card_id" TO "karte_id";
--> statement-breakpoint
ALTER TABLE "attempts" RENAME COLUMN "page_id" TO "seite_id";
--> statement-breakpoint
ALTER TABLE "attempts" RENAME CONSTRAINT "attempts_card_id_cards_id_fk" TO "attempts_karte_id_kartes_id_fk";
--> statement-breakpoint
ALTER TABLE "attempts" RENAME CONSTRAINT "attempts_page_id_layout_pages_id_fk" TO "attempts_seite_id_layout_seites_id_fk";
--> statement-breakpoint
ALTER INDEX "attempts_card_state" RENAME TO "attempts_karte_state";
--> statement-breakpoint
ALTER INDEX "attempts_page" RENAME TO "attempts_seite";
--> statement-breakpoint
ALTER TABLE "kartes" RENAME CONSTRAINT "cards_deck_id_decks_id_fk" TO "kartes_deck_id_decks_id_fk";
--> statement-breakpoint
ALTER INDEX "cards_deck_created" RENAME TO "kartes_deck_created";
--> statement-breakpoint
ALTER INDEX "cards_deck_created_desc_id" RENAME TO "kartes_deck_created_desc_id";
--> statement-breakpoint
ALTER INDEX "cards_deck_created_asc_id" RENAME TO "kartes_deck_created_asc_id";
--> statement-breakpoint
ALTER INDEX "cards_deck_front_asc_id" RENAME TO "kartes_deck_front_asc_id";
--> statement-breakpoint
ALTER INDEX "cards_deck_front_desc_id" RENAME TO "kartes_deck_front_desc_id";
--> statement-breakpoint
ALTER INDEX "cards_recent_captures" RENAME TO "kartes_recent_captures";
--> statement-breakpoint
ALTER TABLE "layout_seites" RENAME CONSTRAINT "layout_pages_deck_id_decks_id_fk" TO "layout_seites_deck_id_decks_id_fk";
--> statement-breakpoint
ALTER TABLE "layout_seites" RENAME CONSTRAINT "page_position" TO "seite_position";
--> statement-breakpoint
ALTER TABLE "seites" RENAME COLUMN "card_id" TO "karte_id";
--> statement-breakpoint
ALTER TABLE "seites" RENAME COLUMN "page_id" TO "seite_id";
--> statement-breakpoint
ALTER TABLE "seites" RENAME CONSTRAINT "pages_card_id_cards_id_fk" TO "seites_karte_id_kartes_id_fk";
--> statement-breakpoint
ALTER TABLE "seites" RENAME CONSTRAINT "pages_page_id_layout_pages_id_fk" TO "seites_seite_id_layout_seites_id_fk";
--> statement-breakpoint
ALTER TABLE "seites" RENAME CONSTRAINT "pages_card_id_page_id_pk" TO "seites_karte_id_seite_id_pk";
--> statement-breakpoint
ALTER TABLE "seites" RENAME CONSTRAINT "page_status" TO "seite_status";
--> statement-breakpoint
ALTER INDEX "pages_layout" RENAME TO "seites_layout";
--> statement-breakpoint
ALTER INDEX "pages_attempt" RENAME TO "seites_attempt";
--> statement-breakpoint
ALTER TABLE "kartes" RENAME CONSTRAINT "cards_pkey" TO "kartes_pkey";
--> statement-breakpoint
ALTER TABLE "layout_seites" RENAME CONSTRAINT "layout_pages_pkey" TO "layout_seites_pkey";
