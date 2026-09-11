# Working in Vocabularium

Before product planning or implementation, read:

1. [Product description](vocabularium-product-description.md) — the general product vision.
2. [MVP scope](docs/MVP-Product-scope.md) — the first iteration's scope and shared interactions.
3. [MVP modules](docs/MVP-Product-spec-modules.md) — the supported modules and rendering rules.
4. [Select and Add](docs/MVP-Product-spec-select-and-add.md) — capture and generation behavior.

The MVP specifications narrow the general vision to the first iteration. Select and Add is the authoritative source for detailed page-completion, failure, interruption, and retry rules; link to those rules instead of repeating them elsewhere.

Keep work within the first-iteration scope. Features explicitly deferred in the specifications stay deferred unless the owner changes that scope. Prefer the simplest implementation that satisfies the agreed behavior.

The project has been restarted. Use the current documents as the starting point; do not restore the previous implementation or infrastructure from Git history unless requested.

When behavior intentionally changes, update the relevant specification. Add setup and verification commands once they actually exist, and report the checks performed and any limitations when finishing a change.
