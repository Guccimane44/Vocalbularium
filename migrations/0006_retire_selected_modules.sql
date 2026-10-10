-- The owner retired <The selected> and <The selected + original language tag> (D03).
-- Their components only repeated the main key and are deleted, including those of
-- instances already removed from a deck; their attempts cascade. Other content stays.
DELETE FROM "components" WHERE "kind" = 'module' AND (
	"module_instance_id" IN (SELECT "id" FROM "deck_modules" WHERE "type" IN ('selected', 'selected-language'))
	OR EXISTS (
		SELECT 1 FROM "component_attempts" WHERE "component_attempts"."page_id" = "components"."page_id"
			AND "component_attempts"."component_id" = "components"."id"
			AND ("component_attempts"."module"::jsonb ->> 'type') IN ('selected', 'selected-language')
	)
);--> statement-breakpoint
DELETE FROM "deck_modules" WHERE "type" IN ('selected', 'selected-language');
