import Type from 'typebox';

export const OperationIdSchema = Type.String({ minLength: 1 });
export const InputTypeSchema = Type.Union([Type.Literal('word_phrase'), Type.Literal('sentence')]);
export const InputInterpretationSchema = Type.Object({
  inputType: InputTypeSchema,
  sourceLanguage: Type.String({ minLength: 1 })
});

export const BrowserSessionSchema = Type.Object({
  installationId: Type.String({ minLength: 1 }),
  sessionId: Type.String({ minLength: 1 }),
  epoch: Type.Integer({ minimum: 1 })
});

export const ModuleInstanceSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  type: Type.String({ minLength: 1 })
});
export const DeckSeiteSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  modules: Type.Array(ModuleInstanceSchema)
});
export const DeckSnapshotSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  seites: Type.Array(DeckSeiteSchema, { minItems: 1, maxItems: 4 })
});
export const DeckLayoutSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1 })),
  name: Type.String({ minLength: 1 }),
  seites: Type.Array(DeckSeiteSchema, { minItems: 1, maxItems: 4 })
});
export const CapturePayloadSchema = Type.Object({
  session: BrowserSessionSchema,
  selectedText: Type.String({ minLength: 1 }),
  snapshot: DeckSnapshotSchema
});

export const ApiFailureSchema = Type.Object({
  error: Type.String(),
  code: Type.String({ minLength: 1 }),
  details: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
}, { additionalProperties: false });
export const HealthResponseSchema = Type.Object({ ok: Type.Boolean() }, { additionalProperties: false });
export const LoginResponseSchema = Type.Object({
  token: Type.String({ minLength: 1 }),
  expiresAt: Type.Integer()
}, { additionalProperties: false });

export const MutationOutcomeSchema = Type.Union([
  Type.Object({ status: Type.Literal('acknowledged'), operationId: OperationIdSchema, result: Type.Unknown() }, { additionalProperties: false }),
  Type.Object({ status: Type.Literal('authentication_required'), operationId: OperationIdSchema }, { additionalProperties: false }),
  Type.Object({ status: Type.Literal('rejected'), operationId: OperationIdSchema, code: Type.String(), message: Type.String() }, { additionalProperties: false }),
  Type.Object({ status: Type.Literal('uncertain'), operationId: OperationIdSchema, message: Type.String() }, { additionalProperties: false })
]);

export const PendingMutationSchema = Type.Object({
  operationId: OperationIdSchema,
  path: Type.String({ minLength: 1 }),
  payload: Type.Unknown(),
  state: Type.Optional(Type.Union([Type.Literal('pending'), Type.Literal('saving')]))
}, { additionalProperties: false });

const OpenRequest = { additionalProperties: true } as const;
export const JsonObjectSchema = Type.Object({}, OpenRequest);
export const LoginRequestSchema = Type.Object({
  username: Type.Optional(Type.Unknown()),
  password: Type.Optional(Type.Unknown())
}, OpenRequest);
export const SessionRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  session: BrowserSessionSchema
}, OpenRequest);
export const DefaultDeckRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  deckId: Type.String()
}, OpenRequest);
export const CapturePreparationPayloadSchema = Type.Object({
  session: BrowserSessionSchema,
  selectedText: Type.String({ minLength: 1 })
}, OpenRequest);
export const CapturePreparationRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: CapturePreparationPayloadSchema
}, OpenRequest);
export const CaptureRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: CapturePayloadSchema,
  recoverySession: Type.Optional(BrowserSessionSchema)
}, OpenRequest);
export const DeckSavePayloadSchema = Type.Object({
  deck: DeckLayoutSchema,
  baseSeiteIds: Type.Optional(Type.Array(Type.String())),
  confirmation: Type.Optional(Type.String())
}, OpenRequest);
export const DeckSaveRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: DeckSavePayloadSchema
}, OpenRequest);
export const DeckDeletePayloadSchema = Type.Object({
  deckId: Type.String(),
  replacementId: Type.Optional(Type.String())
}, OpenRequest);
export const DeckDeleteRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: DeckDeletePayloadSchema
}, OpenRequest);
export const ManualKarteSeiteSchema = Type.Object({ seiteId: Type.String(), text: Type.String() }, OpenRequest);
export const ManualKarteCreatePayloadSchema = Type.Object({
  deckId: Type.String(),
  seites: Type.Array(ManualKarteSeiteSchema)
}, OpenRequest);
export const ManualKarteCreateRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: ManualKarteCreatePayloadSchema
}, OpenRequest);
export const KarteSaveChangeSchema = Type.Object({ seiteId: Type.String(), text: Type.String() }, OpenRequest);
export const KarteSavePayloadSchema = Type.Object({
  karteId: Type.String(),
  changes: Type.Array(KarteSaveChangeSchema)
}, OpenRequest);
export const KarteSaveRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: KarteSavePayloadSchema
}, OpenRequest);
export const KarteDeletePayloadSchema = Type.Object({ karteId: Type.String() }, OpenRequest);
export const KarteDeleteRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: KarteDeletePayloadSchema
}, OpenRequest);
export const KarteRetryPayloadSchema = Type.Object({
  karteId: Type.String(),
  seiteId: Type.String(),
  session: BrowserSessionSchema
}, OpenRequest);
export const KarteRetryRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: KarteRetryPayloadSchema
}, OpenRequest);
export const PollRequestSchema = Type.Object({ session: BrowserSessionSchema }, OpenRequest);
export const PublishPayloadSchema = Type.Object({
  attemptId: Type.String(),
  session: BrowserSessionSchema
}, OpenRequest);
export const PublishRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: PublishPayloadSchema
}, OpenRequest);

export type OperationId = Type.Static<typeof OperationIdSchema>;
export type InputType = Type.Static<typeof InputTypeSchema>;
export type InputInterpretation = Type.Static<typeof InputInterpretationSchema>;
export type BrowserSession = Type.Static<typeof BrowserSessionSchema>;
export type ModuleInstance = Type.Static<typeof ModuleInstanceSchema>;
export type DeckSeite = Type.Static<typeof DeckSeiteSchema>;
export type DeckSnapshot = Type.Static<typeof DeckSnapshotSchema>;
export type DeckLayout = Type.Static<typeof DeckLayoutSchema>;
export type CapturePayload = Type.Static<typeof CapturePayloadSchema>;
export type ApiFailure = Type.Static<typeof ApiFailureSchema>;
export type HealthResponse = Type.Static<typeof HealthResponseSchema>;
export type LoginResponse = Type.Static<typeof LoginResponseSchema>;
export type MutationOutcome = Type.Static<typeof MutationOutcomeSchema>;
export type PendingMutation = Type.Static<typeof PendingMutationSchema>;
export type LoginRequest = Type.Static<typeof LoginRequestSchema>;
export type SessionRequest = Type.Static<typeof SessionRequestSchema>;
export type CaptureRequest = Type.Static<typeof CaptureRequestSchema>;
export type DeckSaveRequest = Type.Static<typeof DeckSaveRequestSchema>;
export type DeckDeleteRequest = Type.Static<typeof DeckDeleteRequestSchema>;
export type ManualKarteCreateRequest = Type.Static<typeof ManualKarteCreateRequestSchema>;
export type KarteSaveRequest = Type.Static<typeof KarteSaveRequestSchema>;
export type KarteDeleteRequest = Type.Static<typeof KarteDeleteRequestSchema>;
export type KarteRetryRequest = Type.Static<typeof KarteRetryRequestSchema>;
export type PollRequest = Type.Static<typeof PollRequestSchema>;
export type PublishRequest = Type.Static<typeof PublishRequestSchema>;

export { currentPath, legacyPath, currentHash, currentValue, legacyValue, legacyOperation, usesCurrentFields } from './terminology.js';
