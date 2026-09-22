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
export const DeckPageSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  modules: Type.Array(ModuleInstanceSchema)
});
export const DeckSnapshotSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  pages: Type.Array(DeckPageSchema, { minItems: 1, maxItems: 4 })
});
export const DeckLayoutSchema = Type.Object({
  id: Type.Optional(Type.String({ minLength: 1 })),
  name: Type.String({ minLength: 1 }),
  pages: Type.Array(DeckPageSchema, { minItems: 1, maxItems: 4 })
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
  basePageIds: Type.Optional(Type.Array(Type.String())),
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
export const ManualCardPageSchema = Type.Object({ pageId: Type.String(), text: Type.String() }, OpenRequest);
export const ManualCardCreatePayloadSchema = Type.Object({
  deckId: Type.String(),
  pages: Type.Array(ManualCardPageSchema)
}, OpenRequest);
export const ManualCardCreateRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: ManualCardCreatePayloadSchema
}, OpenRequest);
export const CardSaveChangeSchema = Type.Object({ pageId: Type.String(), text: Type.String() }, OpenRequest);
export const CardSavePayloadSchema = Type.Object({
  cardId: Type.String(),
  changes: Type.Array(CardSaveChangeSchema)
}, OpenRequest);
export const CardSaveRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: CardSavePayloadSchema
}, OpenRequest);
export const CardDeletePayloadSchema = Type.Object({ cardId: Type.String() }, OpenRequest);
export const CardDeleteRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: CardDeletePayloadSchema
}, OpenRequest);
export const CardRetryPayloadSchema = Type.Object({
  cardId: Type.String(),
  pageId: Type.String(),
  session: BrowserSessionSchema
}, OpenRequest);
export const CardRetryRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: CardRetryPayloadSchema
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
export type DeckPage = Type.Static<typeof DeckPageSchema>;
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
export type ManualCardCreateRequest = Type.Static<typeof ManualCardCreateRequestSchema>;
export type CardSaveRequest = Type.Static<typeof CardSaveRequestSchema>;
export type CardDeleteRequest = Type.Static<typeof CardDeleteRequestSchema>;
export type CardRetryRequest = Type.Static<typeof CardRetryRequestSchema>;
export type PollRequest = Type.Static<typeof PollRequestSchema>;
export type PublishRequest = Type.Static<typeof PublishRequestSchema>;
