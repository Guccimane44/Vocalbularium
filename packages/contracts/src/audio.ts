import Type from 'typebox';

// Spoken parts' audio (D24, 0.14.0): one clip per spoken line of a component's
// part, the core or a facet, with its own state. A ready clip has its duration
// and is read from its URL; a failed one names its error.
export const ClipStateSchema = Type.Union([
  Type.Literal('waiting'), Type.Literal('generating'), Type.Literal('ready'), Type.Literal('failed')
]);
export const ClipSchema = Type.Object({
  componentId: Type.String({ minLength: 1 }),
  part: Type.String({ minLength: 1 }),
  line: Type.Integer({ minimum: 0 }),
  state: ClipStateSchema,
  errorCode: Type.Optional(Type.String({ minLength: 1 })),
  durationMs: Type.Optional(Type.Integer({ minimum: 0 })),
  url: Type.Optional(Type.String({ minLength: 1 }))
}, { additionalProperties: false });
export const ClipListSchema = Type.Object({ clips: Type.Array(ClipSchema) }, { additionalProperties: false });
export const ClipParamsSchema = Type.Object({
  pageId: Type.String({ minLength: 1 }),
  componentId: Type.String({ minLength: 1 }),
  part: Type.String({ minLength: 1 }),
  line: Type.Integer({ minimum: 0 })
});
export const ClipRetryResponseSchema = Type.Object({ restarted: Type.Boolean() }, { additionalProperties: false });

export type ClipState = Type.Static<typeof ClipStateSchema>;
export type Clip = Type.Static<typeof ClipSchema>;
export type ClipList = Type.Static<typeof ClipListSchema>;
