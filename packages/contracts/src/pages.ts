import Type from 'typebox';
import { BrowserSessionSchema, OperationIdSchema } from './base.js';

// Deck → page → component (Q72) with page-owned modules (D02, 0.5.0). Pages own
// their module instances; the deck configuration is only the template for page creation.

export const ViewDefinitionSchema = Type.Object({
  module: Type.Literal('default')
}, { additionalProperties: false });
// Q13 block document. The main key, Context and Text hold plain text, stored
// as one paragraph block so the text round-trips byte for byte.
export const ParagraphBlockSchema = Type.Object({
  type: Type.Literal('paragraph'),
  text: Type.String()
}, { additionalProperties: false });

// The provider's result for a parent module is checked against the shapes its
// module defines in the catalog (D11); only what is stored is a contract.
const Filled = Type.String({ minLength: 1, maxLength: 2000 });

// A parent module's stored content (D09, amended): the core's top line, kept
// structured and never edited, then the core and each facet with content as
// one markdown text. A facet without content has no entry.
const Markdown = Type.String({ maxLength: 8000 });
// Since D17 a Languages card's top line carries its own reading: word or
// sentence, the key's language and, for a German word, its grammatical role;
// an Expertise card's carries the key and its case, which is not shown.
export const ParentHeaderSchema = Type.Union([
  // The language is blank on a card written by hand until a Retry fills it (D10, amended a fourth time).
  Type.Object({ kind: Type.Literal('word'), language: Type.String(), key: Filled, romanization: Type.Optional(Filled), gramRole: Type.Optional(Filled) }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal('sentence'), language: Type.String(), key: Filled, romanization: Type.Optional(Filled) }, { additionalProperties: false }),
  Type.Object({ kind: Type.Literal('expertise'), key: Filled, relevance: Type.Union([Type.Literal('subject'), Type.Literal('neighbouring'), Type.Literal('unrelated')]) }, { additionalProperties: false })
]);
export const ParentBlockSchema = Type.Object({
  type: Type.Literal('parent'),
  header: ParentHeaderSchema,
  core: Markdown,
  facets: Type.Object({
    article: Type.Optional(Markdown), examples: Type.Optional(Markdown), synonyms: Type.Optional(Markdown),
    antonyms: Type.Optional(Markdown), pinyin: Type.Optional(Markdown)
  }, { additionalProperties: false })
}, { additionalProperties: false });

export const BlockDocumentSchema = Type.Object({
  version: Type.Literal(1),
  blocks: Type.Array(Type.Union([ParagraphBlockSchema, ParentBlockSchema]))
}, { additionalProperties: false });

export const ComponentStatusSchema = Type.Union([
  Type.Literal('loading'), Type.Literal('completed'), Type.Literal('failed')
]);
// Every module counts: main key, Context, Text, and content modules.
export const MAX_MODULES = 12;

// A parent module's facets (D08), in the parent's order. Other modules have none.
export const FacetListSchema = Type.Array(Type.String({ minLength: 1 }), { maxItems: 8 });
export const ModuleInstanceSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  type: Type.String({ minLength: 1 }),
  facets: Type.Optional(FacetListSchema)
}, { additionalProperties: false });
// A deck's colour is one of the six module family colours (D06). A deck the
// user has not coloured has none and shows the colour derived from its ID.
export const DeckColourSchema = Type.Union([
  Type.Literal('meaning'), Type.Literal('usage'), Type.Literal('roots'),
  Type.Literal('connections'), Type.Literal('sound'), Type.Literal('notes')
]);
export const DeckConfigurationSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1 })),
  name: Type.String({ minLength: 1 }),
  colour: Type.Optional(Type.Union([DeckColourSchema, Type.Null()])),
  // The main key module first; Context replaces the earlier captureContext setting.
  modules: Type.Array(ModuleInstanceSchema, { minItems: 1, maxItems: MAX_MODULES }),
  view: ViewDefinitionSchema
}, { additionalProperties: false });
export const DeckConfigurationSnapshotSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  modules: Type.Array(ModuleInstanceSchema, { minItems: 1, maxItems: MAX_MODULES })
}, { additionalProperties: false });

// Each component belongs to one of its page's module instances. Instance IDs
// are the page's own, never the deck's.
export const ComponentSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  moduleInstanceId: Type.String({ minLength: 1 }),
  moduleType: Type.String({ minLength: 1 }),
  facets: Type.Optional(FacetListSchema),
  // Facets added since the parent's last attempt; they wait for the next Retry.
  waitingFacets: Type.Optional(FacetListSchema),
  // The facet the current attempt regenerates on its own (0.7.3), and the
  // facet whose own Retry last failed; the rest of the content stays meanwhile.
  retryingFacet: Type.Optional(Type.String({ minLength: 1 })),
  failedFacet: Type.Optional(Type.String({ minLength: 1 })),
  content: BlockDocumentSchema,
  // Null when the component has never had a generation attempt.
  status: Type.Union([ComponentStatusSchema, Type.Null()]),
  attemptId: Type.Union([Type.String({ minLength: 1 }), Type.Null()])
}, { additionalProperties: false });
export const PageSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  deckId: Type.String({ minLength: 1 }),
  // Capture origin; null for manually created pages.
  selectedText: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String({ minLength: 1 }),
  // In page order; the main key is always first.
  components: Type.Array(ComponentSchema, { minItems: 1, maxItems: MAX_MODULES }),
  status: Type.Union([ComponentStatusSchema, Type.Null()])
}, { additionalProperties: false });

const OpenRequest = { additionalProperties: true } as const;
export const PageCapturePayloadSchema = Type.Object({
  session: BrowserSessionSchema,
  mainKey: Type.String({ minLength: 1 }),
  context: Type.Optional(Type.String()),
  snapshot: DeckConfigurationSnapshotSchema
}, OpenRequest);
export const PageCaptureRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: PageCapturePayloadSchema,
  recoverySession: Type.Optional(BrowserSessionSchema)
}, OpenRequest);
export const DeckConfigurationSaveRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: Type.Object({ deck: DeckConfigurationSchema }, OpenRequest)
}, OpenRequest);
// Manual creation copies the deck's modules; the user's Context and Text values
// are keyed by the deck instance they fill.
export const InitialContentSchema = Type.Object({
  moduleInstanceId: Type.String({ minLength: 1 }),
  content: BlockDocumentSchema
}, OpenRequest);
export const PageCreatePayloadSchema = Type.Object({
  deckId: Type.String({ minLength: 1 }),
  mainKey: Type.String({ minLength: 1 }),
  initial: Type.Optional(Type.Array(InitialContentSchema, { maxItems: MAX_MODULES }))
}, OpenRequest);
export const PageCreateRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: PageCreatePayloadSchema
}, OpenRequest);
export const ComponentChangeSchema = Type.Object({
  componentId: Type.String({ minLength: 1 }),
  content: BlockDocumentSchema,
  // A facet edited on its own (D10, 0.7.5): only that facet's text is taken
  // from `content`, over the component as stored.
  facet: Type.Optional(Type.String({ minLength: 1 }))
}, OpenRequest);
export const PageSavePayloadSchema = Type.Object({
  pageId: Type.String({ minLength: 1 }),
  changes: Type.Array(ComponentChangeSchema)
}, OpenRequest);
export const PageSaveRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: PageSavePayloadSchema
}, OpenRequest);

// Shaping: each step is one ordered operation, saved immediately.
// Positions count from 0, where the main key always stays.
const Position = Type.Integer({ minimum: 1, maximum: MAX_MODULES - 1 });
export const ModuleAddPayloadSchema = Type.Object({
  pageId: Type.String({ minLength: 1 }),
  type: Type.String({ minLength: 1 }),
  position: Type.Optional(Position)
}, OpenRequest);
export const ComponentDeletePayloadSchema = Type.Object({
  pageId: Type.String({ minLength: 1 }),
  componentId: Type.String({ minLength: 1 })
}, OpenRequest);
export const ComponentMovePayloadSchema = Type.Object({
  pageId: Type.String({ minLength: 1 }),
  componentId: Type.String({ minLength: 1 }),
  position: Position
}, OpenRequest);
// Facets (D08) join or leave one parent component; a facet lands only on a
// parent of its own type.
export const FacetChangePayloadSchema = Type.Object({
  pageId: Type.String({ minLength: 1 }),
  componentId: Type.String({ minLength: 1 }),
  // The facet's parent type: German Examples and Chinese Examples are different facets.
  parent: Type.String({ minLength: 1 }),
  facet: Type.String({ minLength: 1 })
}, OpenRequest);
export const FacetAddRequestSchema = Type.Object({ operationId: OperationIdSchema, payload: FacetChangePayloadSchema }, OpenRequest);
export const FacetDeleteRequestSchema = Type.Object({ operationId: OperationIdSchema, payload: FacetChangePayloadSchema }, OpenRequest);
export const ModuleAddRequestSchema = Type.Object({ operationId: OperationIdSchema, payload: ModuleAddPayloadSchema }, OpenRequest);
export const ComponentDeleteRequestSchema = Type.Object({ operationId: OperationIdSchema, payload: ComponentDeletePayloadSchema }, OpenRequest);
export const ComponentMoveRequestSchema = Type.Object({ operationId: OperationIdSchema, payload: ComponentMovePayloadSchema }, OpenRequest);

export const PageDeleteRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: Type.Object({ pageId: Type.String({ minLength: 1 }) }, OpenRequest)
}, OpenRequest);
export const GenerationTargetSchema = Type.Union([
  Type.Object({ scope: Type.Literal('missing') }, OpenRequest),
  Type.Object({ scope: Type.Literal('page') }, OpenRequest),
  Type.Object({ scope: Type.Literal('component'), componentId: Type.String({ minLength: 1 }) }, OpenRequest),
  // One facet of a parent component (0.7.3): its section alone, the rest kept.
  Type.Object({ scope: Type.Literal('facet'), componentId: Type.String({ minLength: 1 }), facet: Type.String({ minLength: 1 }) }, OpenRequest)
]);
export const PageGeneratePayloadSchema = Type.Object({
  pageId: Type.String({ minLength: 1 }),
  target: GenerationTargetSchema,
  session: BrowserSessionSchema,
  // Retries replace content, so they carry the digest of what the user confirmed.
  confirmation: Type.Optional(Type.String({ minLength: 1 }))
}, OpenRequest);
export const PageGenerateRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: PageGeneratePayloadSchema
}, OpenRequest);

export type ModuleInstance = Type.Static<typeof ModuleInstanceSchema>;
export type DeckColour = Type.Static<typeof DeckColourSchema>;
export type DeckConfiguration = Type.Static<typeof DeckConfigurationSchema>;
export type DeckConfigurationSnapshot = Type.Static<typeof DeckConfigurationSnapshotSchema>;
export type Component = Type.Static<typeof ComponentSchema>;
export type Page = Type.Static<typeof PageSchema>;
export type GenerationTarget = Type.Static<typeof GenerationTargetSchema>;
export type PageCreateRequest = Type.Static<typeof PageCreateRequestSchema>;
export type PageSaveRequest = Type.Static<typeof PageSaveRequestSchema>;
export type ModuleAddRequest = Type.Static<typeof ModuleAddRequestSchema>;
export type ComponentDeleteRequest = Type.Static<typeof ComponentDeleteRequestSchema>;
export type ComponentMoveRequest = Type.Static<typeof ComponentMoveRequestSchema>;
export type FacetChangePayload = Type.Static<typeof FacetChangePayloadSchema>;
export type FacetAddRequest = Type.Static<typeof FacetAddRequestSchema>;
export type FacetDeleteRequest = Type.Static<typeof FacetDeleteRequestSchema>;
export type BlockDocument = Type.Static<typeof BlockDocumentSchema>;
export type ParagraphBlock = Type.Static<typeof ParagraphBlockSchema>;
export type ParentBlock = Type.Static<typeof ParentBlockSchema>;
export type ParentHeader = Type.Static<typeof ParentHeaderSchema>;
export type ComponentStatus = Type.Static<typeof ComponentStatusSchema>;
export type ViewDefinition = Type.Static<typeof ViewDefinitionSchema>;
export type PageDeleteRequest = Type.Static<typeof PageDeleteRequestSchema>;
export type PageGenerateRequest = Type.Static<typeof PageGenerateRequestSchema>;
export type PageCaptureRequest = Type.Static<typeof PageCaptureRequestSchema>;
export type DeckConfigurationSaveRequest = Type.Static<typeof DeckConfigurationSaveRequestSchema>;
