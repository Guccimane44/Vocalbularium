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
export type MutationOutcome = Type.Static<typeof MutationOutcomeSchema>;
export type PendingMutation = Type.Static<typeof PendingMutationSchema>;
