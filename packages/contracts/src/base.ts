import Type from 'typebox';

export const OperationIdSchema = Type.String({ minLength: 1 });

export const BrowserSessionSchema = Type.Object({
  installationId: Type.String({ minLength: 1 }),
  sessionId: Type.String({ minLength: 1 }),
  epoch: Type.Integer({ minimum: 1 })
});
