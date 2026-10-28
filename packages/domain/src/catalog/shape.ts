// Building blocks for a facet's shape (D11): each gives both the check a
// provider's result must pass and the JSON schema the provider is asked to
// match, so the two never drift. The schema's key order is part of the prompt.

export type JsonSchema = Readonly<Record<string, unknown>>;
export type Shape<T> = Readonly<{
  schema: JsonSchema;
  // Checks a value and returns it trimmed; `what` names it in an error.
  check: (value: unknown, what: string) => T;
  // How a field is named inside an object, such as "the singular".
  name?: string;
  optional?: boolean;
}>;

const MAX_TEXT = 2000;
const MAX_ITEMS = 20;

// Thrown when a result does not have its module's shape.
export class GeneratedError extends Error {}
export const fail = (message: string): never => { throw new GeneratedError(message); };

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function only(value: Record<string, unknown>, keys: readonly string[], what: string) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${what} has an unexpected field "${key}".`);
}
export const blank = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && !value.trim());

// A text, trimmed and at most MAX_TEXT long.
export function text(name?: string): Shape<string> {
  return {
    schema: { type: 'string' }, ...(name ? { name } : {}),
    check: (value, what) => {
      if (blank(value)) return fail(`${what} is missing.`);
      if (typeof value !== 'string') return fail(`${what} is not text.`);
      if (value.length > MAX_TEXT) fail(`${what} is too long.`);
      return value.trim();
    }
  };
}

// One fixed text, such as a core's `kind`.
export function literal<const T extends string>(value: T, name?: string): Shape<T> {
  return {
    schema: { type: 'string', enum: [value] }, ...(name ? { name } : {}),
    check: (given, what) => given === value ? value : fail(`${what} must be "${value}".`)
  };
}

// One of a few fixed texts, such as a core's `kind` or `relevance` (D17).
export function oneOf<const T extends string>(values: readonly T[], name?: string): Shape<T> {
  return {
    schema: { type: 'string', enum: [...values] }, ...(name ? { name } : {}),
    check: (given, what) => values.includes(given as T) ? given as T : fail(`${what} must be one of ${values.map(value => `"${value}"`).join(', ')}.`)
  };
}

// A field that may be left out; blank counts as left out.
export function optional<T>(shape: Shape<T>): Shape<T | undefined> {
  return { ...shape, optional: true, check: (value, what) => blank(value) ? undefined : shape.check(value, what) };
}

// A list of one to MAX_ITEMS items. Items are named "<what> 1", "<what> 2", …,
// or after `each`, such as "Meaning 1".
export function list<T>(item: Shape<T>, { name, each }: { name?: string; each?: string } = {}): Shape<T[]> {
  return {
    schema: { type: 'array', items: item.schema }, ...(name ? { name } : {}),
    check: (value, what) => {
      if (!Array.isArray(value)) return fail(`${what} is not a list.`);
      if (!value.length) fail(`${what} is empty.`);
      if (value.length > MAX_ITEMS) fail(`${what} has too many items.`);
      return value.map((entry, index) => item.check(entry, `${each ?? what} ${index + 1}`));
    }
  };
}

type Fields = Readonly<Record<string, Shape<unknown>>>;
type Value<S> = S extends Shape<infer T> ? T : never;
// Optional fields (their value may be undefined) are optional properties.
type Checked<F extends Fields> =
  { [K in keyof F as undefined extends Value<F[K]> ? never : K]: Value<F[K]> } &
  { [K in keyof F as undefined extends Value<F[K]> ? K : never]?: Exclude<Value<F[K]>, undefined> };

// An object with exactly these fields, in this order. A field's errors name it
// "<what>: <its name>", or by its name alone with `own: true`.
export function object<const F extends Fields>(fields: F, { own = false }: { own?: boolean } = {}): Shape<Checked<F>> {
  const keys = Object.keys(fields);
  return {
    schema: {
      type: 'object', additionalProperties: false,
      properties: Object.fromEntries(keys.map(key => [key, fields[key]!.schema])),
      required: keys.filter(key => !fields[key]!.optional)
    },
    check: (value, what) => {
      if (!isRecord(value)) return fail(`${what} is not structured.`);
      only(value, keys, what);
      const checked: Record<string, unknown> = {};
      for (const key of keys) {
        const field = fields[key]!;
        const name = field.name ?? key;
        const result = field.check(value[key], own ? name : `${what}: ${name}`);
        if (result !== undefined) checked[key] = result;
      }
      return checked as Checked<F>;
    }
  };
}

// An object schema around already-built schemas, every field optional unless
// listed: how the composer combines a core and facets.
export function schemaOf(properties: Readonly<Record<string, JsonSchema>>, required: readonly string[] = Object.keys(properties)): JsonSchema {
  return { type: 'object', additionalProperties: false, properties, required };
}
