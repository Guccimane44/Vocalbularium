# Questionnaire overview — how to decide Vocabularium's mature architecture

This folder is the system-design questionnaire. It replaces the deleted single file `docs/architecture/system-design-questionnaire.md` (Q1–Q52, issue #77). Numbering is restarted as global **Q01–Q71** in reading order; do not map old numbers one-to-one.

## Who this is for

You are a developer who already knows basic web development: HTTP APIs, PostgreSQL basics, and what a Chrome extension is. Architecture terms are defined where they first appear. *Tenancy* means how multiple users' data is separated (separate databases vs shared tables with an `account_id` column). *Statelessness* means the server process can be killed and replaced without losing anything important. *Cold start* is the delay when an idle serverless function or free-tier service wakes up. *PITR* is point-in-time recovery (restoring a database to any second, not just the last backup). *CRDT* is a data structure that merges concurrent edits without a central lock. *RPO/RTO* are how much data loss and downtime you promise at most.

## Baseline you are deciding from

Chrome MV3 extension (WXT + React) + local Fastify API on `127.0.0.1:4318` + PostgreSQL 18 with a single account (`admin`/`admin`), an ordered single-process executor guarded by an advisory lock, a `DATA_DIR/generation-outbox` filesystem journal, five plain-text modules, and generation through an OpenCode Go subscription (`deepseek-v4.1-flash`). There is no multi-user support, no mobile or web client, no rich media, no spaced repetition, and no public hosting. Product language is deck → karte → seite: a deck holds kartes, each karte has ordered seites defined by the deck layout, and the front seite always shows the editable main key.

## Vision this is grounded in

The [product vision](../../product/vision.md) says Vocabularium is a generative knowledge-capture system, not a vocabulary app with flashcards attached: capture → persistent semantic object → curated generative modules. Language learning is one application, not the data model. The [competitor critique](../../product/competitor-critique.md) adds three load-bearing ideas: translation is one representation among many (not the foundation), language pairs must not be the central model, and modules must be constrained productized primitives (Notion blocks, not an open prompt box). The [product model](../../product/model.md) defines the deck/karte/seite/main-key relationships; [current scope](../../product/scope.md) separates what works now from the accepted main-key change and the explicit deferrals. Generation rules live in [Select and Add](../../MVP-Product-spec-select-and-add.md); module rules in [modules](../../specs/modules.md); the operating environment in the [local PostgreSQL guide](../local-postgresql.md); upgrade discipline in [terminology compatibility](../terminology-compatibility.md).

## How to answer

For each question write: **Decision or leaning + why + what would change your mind**. Mark unknowns as `OPEN — need: [experiment or document]`. Link any Notion decision you want treated as authoritative. Suggested research order: 01 + 04 + 05 first (maturity, users, deployment lock ~80% of the architecture), then 06 + 08 + 09 (data, modules, LLM), then 07 + 11 (database, security).

## Index

| File | Questions | Decides |
| --- | --- | --- |
| [01-maturity-and-scope](01-maturity-and-scope.md) | Q01–Q05 | What 1.0 means and what stays out |
| [02-clients-and-capture](02-clients-and-capture.md) | Q06–Q10 | Where capture happens and what travels with it |
| [03-frontend](03-frontend.md) | Q11–Q16 | Extension/web clients, state, rendering, updates |
| [04-identity-sync](04-identity-sync.md) | Q17–Q21 | Accounts, sync topology, conflicts, sharing |
| [05-backend-and-cloud](05-backend-and-cloud.md) | Q22–Q28 | Compute model, Postgres hosting, queues, API stability |
| [06-data-and-semantics](06-data-and-semantics.md) | Q29–Q34 | What is stored, semantic depth, layout evolution |
| [07-database](07-database.md) | Q35–Q39 | Tenancy, migrations, search, backup, retention |
| [08-modules](08-modules.md) | Q40–Q45 | Catalog, config, inputs, multilingual, custom modules |
| [09-generation-and-llm](09-generation-and-llm.md) | Q46–Q51 | Provider, prompts, cost, evals, reliability |
| [10-review-and-scale](10-review-and-scale.md) | Q52–Q56 | Spaced repetition, organization, scale budgets |
| [11-security-privacy](11-security-privacy.md) | Q57–Q61 | Threat model, auth, secrets, compliance |
| [12-operations](12-operations.md) | Q62–Q66 | Observability, support, distribution, cost, SLA |
| [13-ux-and-migration](13-ux-and-migration.md) | Q67–Q71 | Design language, a11y, i18n, compatibility, sequencing |
