import type {
  FastifyBaseLogger, FastifyInstance, FastifyTypeProvider, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault
} from 'fastify';
import type { Static, TSchema } from 'typebox';

// The API's request types come from the TypeBox schemas its routes are
// validated with. Types only: the routes run on a plain Fastify instance.
type SchemaType<S> = [Exclude<S, undefined>] extends [never] ? unknown
  : Exclude<S, undefined> extends TSchema ? Static<Exclude<S, undefined>> : unknown;
export interface TypeBoxTypeProvider extends FastifyTypeProvider {
  validator: SchemaType<this['schema']>;
  serializer: SchemaType<this['schema']>;
}
export type ApiInstance = FastifyInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression,
  FastifyBaseLogger, TypeBoxTypeProvider>;

// What app.mjs decorates each request with.
declare module 'fastify' {
  interface FastifyRequest {
    // The bearer token of a signed-in request.
    authToken: string | null;
    diagnosticStarted: number | null;
    diagnosticResult: Record<string, unknown> | null;
  }
}
