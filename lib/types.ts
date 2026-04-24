import { Kind } from '@sinclair/typebox';
import type { TSchema } from '@sinclair/typebox';

/**
 * Per-content-type body entry. May be:
 *   - a TypeBox schema (validated, no example)
 *   - `true` (any body accepted, no validation)
 *   - an object with optional `schema` (TSchema | true), `example`, `examples`
 *     (forwarded to the OpenAPI media type object)
 */
export type BodyEntryConfig = {
    schema?: TSchema | true;
    example?: unknown;
    examples?: Record<string, { summary?: string; description?: string; value: unknown }>;
};

export type BodyEntry = TSchema | true | BodyEntryConfig;

/**
 * Body validation can either be:
 *   - a TypeBox schema (treated as `application/json` for backwards compatibility)
 *   - a record mapping content-type strings to a `BodyEntry`. Content-type
 *     keys may include wildcards: `text/*`, `application/*`, or `* / *`.
 */
export type BodyValidation<TBody extends TSchema> =
    | TBody
    | Record<string, BodyEntry>;

/**
 * Normalized internal representation: every entry has the expanded
 * `BodyEntryConfig` shape with `schema` always set (defaulting to `true`).
 */
export type NormalizedBody = Record<string, Required<Pick<BodyEntryConfig, 'schema'>> & BodyEntryConfig>;

/**
 * Detect whether a given value is a TypeBox schema. TypeBox attaches a
 * `[Kind]` symbol to every schema instance which is what we use to
 * distinguish a schema from a content-type-keyed body record.
 */
export function isTSchema(value: unknown): value is TSchema {
    return !!value && typeof value === 'object' && Kind in (value as object);
}

function normalizeEntry(entry: BodyEntry): NormalizedBody[string] {
    if (entry === true) return { schema: true };
    if (isTSchema(entry)) return { schema: entry };
    return { schema: true, ...entry };
}

/**
 * Normalize the body option into a `NormalizedBody` map. A bare TypeBox
 * schema is mapped to `application/json` for backwards compatibility.
 */
export function normalizeBody(
    body: TSchema | Record<string, BodyEntry> | undefined
): NormalizedBody | undefined {
    if (!body) return undefined;
    if (isTSchema(body)) return { 'application/json': { schema: body } };

    const out: NormalizedBody = {};
    for (const ct of Object.keys(body)) {
        out[ct.toLowerCase()] = normalizeEntry(body[ct]);
    }
    return out;
}

/**
 * Match an incoming content-type against a normalized body map, honoring
 * wildcard entries like `text/*` or `*\/*`. Exact matches always win.
 */
export function matchContentType(
    incoming: string,
    normalized: NormalizedBody
): string | undefined {
    if (!incoming) {
        return normalized['*/*'] ? '*/*' : undefined;
    }
    if (normalized[incoming]) return incoming;

    const [type] = incoming.split('/');
    if (type && normalized[`${type}/*`]) return `${type}/*`;
    if (normalized['*/*']) return '*/*';
    return undefined;
}

export type RequestValidation<
    TParams extends TSchema,
    TQuery extends TSchema,
    TBody extends TSchema,
    TResponse extends TSchema
> = {
  private?: boolean;
  deprecated?: boolean;
  name?: string;
  group?: string;
  description?: string;
  params?: TParams;
  query?: TQuery;
  body?: BodyValidation<TBody>;
  /** Whether the request body is required. Defaults to true when `body` is set. */
  bodyRequired?: boolean;
  res?: TResponse
};
