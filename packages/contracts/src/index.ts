import Type from 'typebox';
import { BrowserSessionSchema, OperationIdSchema } from './base.js';

export { BrowserSessionSchema, OperationIdSchema };

export const InputTypeSchema = Type.Union([Type.Literal('word_phrase'), Type.Literal('sentence')]);
// The run's reading of the main key (D08); no source language is chosen.
export const InputInterpretationSchema = Type.Object({
  inputType: InputTypeSchema
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
  mainKey: Type.String({ minLength: 1 })
}, OpenRequest);
export const CapturePreparationRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: CapturePreparationPayloadSchema
}, OpenRequest);
export const DeckDeletePayloadSchema = Type.Object({
  deckId: Type.String(),
  replacementId: Type.Optional(Type.String())
}, OpenRequest);
export const DeckDeleteRequestSchema = Type.Object({
  operationId: OperationIdSchema,
  payload: DeckDeletePayloadSchema
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
export type ApiFailure = Type.Static<typeof ApiFailureSchema>;
export type HealthResponse = Type.Static<typeof HealthResponseSchema>;
export type LoginResponse = Type.Static<typeof LoginResponseSchema>;
export type MutationOutcome = Type.Static<typeof MutationOutcomeSchema>;
export type PendingMutation = Type.Static<typeof PendingMutationSchema>;
export type LoginRequest = Type.Static<typeof LoginRequestSchema>;
export type SessionRequest = Type.Static<typeof SessionRequestSchema>;
export type DeckDeleteRequest = Type.Static<typeof DeckDeleteRequestSchema>;
export type PollRequest = Type.Static<typeof PollRequestSchema>;
export type PublishRequest = Type.Static<typeof PublishRequestSchema>;

export * from './pages.js';
