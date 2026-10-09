import Type from 'typebox';
import { BrowserSessionSchema, OperationIdSchema } from './base.js';

// Deck → page → component dialect (Q72). It replaces the card/page and
// karte/seite dialects (D1).

export const MAX_CONTENT_MODULES = 12;

export const ContentModuleInstanceSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  type: Type.String({ minLength: 1 })
}, { additionalProperties: false });
export const ViewDefinitionSchema = Type.Object({
  module: Type.Literal('default')
}, { additionalProperties: false });
export const DeckConfigurationSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1 })),
  name: Type.String({ minLength: 1 }),
  modules: Type.Array(ContentModuleInstanceSchema, { maxItems: MAX_CONTENT_MODULES }),
  view: ViewDefinitionSchema
}, { additionalProperties: false });
export const DeckConfigurationSnapshotSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  modules: Type.Array(ContentModuleInstanceSchema, { maxItems: MAX_CONTENT_MODULES })
}, { additionalProperties: false });

// Q13 block document. The current modules emit plain text, stored as one
// paragraph block so the text round-trips byte for byte.
export const ParagraphBlockSchema = Type.Object({
  type: Type.Literal('paragraph'),
  text: Type.String()
}, { additionalProperties: false });
export const BlockDocumentSchema = Type.Object({
  version: Type.Literal(1),
  blocks: Type.Array(ParagraphBlockSchema)
}, { additionalProperties: false });

export const ComponentKindSchema = Type.Union([
  Type.Literal('main_key'), Type.Literal('context'), Type.Literal('module'), Type.Literal('manual')
]);
export const ComponentStatusSchema = Type.Union([
  Type.Literal('loading'), Type.Literal('completed'), Type.Literal('failed')
]);
export const ComponentSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  kind: ComponentKindSchema,
  moduleInstanceId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  content: BlockDocumentSchema,
  // Null when the component has never had a generation attempt.
  status: Type.Union([ComponentStatusSchema, Type.Null()]),
  attemptId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  // False for a module component whose instance was removed from the deck.
  configured: Type.Boolean()
}, { additionalProperties: false });
export const PageSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  deckId: Type.String({ minLength: 1 }),
  // Capture origin; null for manually created pages.
  selectedText: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String({ minLength: 1 }),
  components: Type.Array(ComponentSchema),
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
export const PageCreatePayloadSchema = Type.Object({
  deckId: Type.String({ minLength: 1 }),
  mainKey: Type.String({ minLength: 1 }),
  context: Type.Optional(Type.String()),
  manual: Type.Optional(Type.Array(BlockDocumentSchema))
}, OpenRequest);
export const PageCreateRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: PageCreatePayloadSchema
}, OpenRequest);
export const ComponentChangeSchema = Type.Object({
  componentId: Type.String({ minLength: 1 }),
  content: BlockDocumentSchema
}, OpenRequest);
export const PageSavePayloadSchema = Type.Object({
  pageId: Type.String({ minLength: 1 }),
  changes: Type.Array(ComponentChangeSchema),
  added: Type.Optional(Type.Array(BlockDocumentSchema)),
  // Sets the Context on a page that has none; an empty change clears it.
  context: Type.Optional(BlockDocumentSchema)
}, OpenRequest);
export const PageSaveRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: PageSavePayloadSchema
}, OpenRequest);
export const PageDeleteRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: Type.Object({ pageId: Type.String({ minLength: 1 }) }, OpenRequest)
}, OpenRequest);
export const GenerationTargetSchema = Type.Union([
  Type.Object({ scope: Type.Literal('missing') }, OpenRequest),
  Type.Object({ scope: Type.Literal('page') }, OpenRequest),
  Type.Object({ scope: Type.Literal('component'), componentId: Type.String({ minLength: 1 }) }, OpenRequest)
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

export type ContentModuleInstance = Type.Static<typeof ContentModuleInstanceSchema>;
export type ViewDefinition = Type.Static<typeof ViewDefinitionSchema>;
export type DeckConfiguration = Type.Static<typeof DeckConfigurationSchema>;
export type DeckConfigurationSnapshot = Type.Static<typeof DeckConfigurationSnapshotSchema>;
export type BlockDocument = Type.Static<typeof BlockDocumentSchema>;
export type ComponentKind = Type.Static<typeof ComponentKindSchema>;
export type ComponentStatus = Type.Static<typeof ComponentStatusSchema>;
export type Component = Type.Static<typeof ComponentSchema>;
export type Page = Type.Static<typeof PageSchema>;
export type GenerationTarget = Type.Static<typeof GenerationTargetSchema>;
export type PageCaptureRequest = Type.Static<typeof PageCaptureRequestSchema>;
export type DeckConfigurationSaveRequest = Type.Static<typeof DeckConfigurationSaveRequestSchema>;
export type PageCreateRequest = Type.Static<typeof PageCreateRequestSchema>;
export type PageSaveRequest = Type.Static<typeof PageSaveRequestSchema>;
export type PageDeleteRequest = Type.Static<typeof PageDeleteRequestSchema>;
export type PageGenerateRequest = Type.Static<typeof PageGenerateRequestSchema>;
