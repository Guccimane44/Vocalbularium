-- The generation record (D11, 0.8.0): per generated part of a parent component,
-- the model and prompt version that produced it. Empty for earlier components. Additive.
ALTER TABLE "components" ADD COLUMN "generation" text;
