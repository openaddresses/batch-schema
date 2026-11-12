import { Kind } from '@sinclair/typebox';
import type { TSchema } from '@sinclair/typebox';
import type { Request } from 'express';

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

/**
 * An OpenAPI Security Requirement Object - every scheme named must be
 * satisfied, each with all of its listed scopes
 */
export type SecurityRequirement = { [scheme: string]: Array<string> | undefined };

export type SecurityRoute = {
    method: string;
    path: string;
};

/**
 * Decides whether a request satisfies one security scheme with the given
 * scopes. Return the authenticated principal to satisfy the scheme - return
 * null/undefined/false, or throw a 401/403 error, when it is not satisfied.
 * Any other thrown error fails the request
 */
export type SecurityHandler<TPrincipal = unknown> = (
    req: Request,
    scopes: Array<string>,
    route: SecurityRoute
) => TPrincipal | null | undefined | false | Promise<TPrincipal | null | undefined | false>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SecurityHandlers = Record<string, SecurityHandler<any>>;

export type SecurityPrincipal<THandler> = THandler extends (...args: never[]) => infer R ? Exclude<NonNullable<Awaited<R>>, false> : never;

type AnyAuth<THandlers> = { [K in keyof THandlers]?: SecurityPrincipal<THandlers[K]> };
type NoAuth<THandlers> = { [K in keyof THandlers]?: undefined };
type PresentKeys<TAlt> = { [K in keyof TAlt]-?: undefined extends TAlt[K] ? never : K }[keyof TAlt];
type AltAuth<THandlers, TAlt> =
    & { [K in PresentKeys<TAlt> & keyof THandlers]: SecurityPrincipal<THandlers[K]> }
    & { [K in Exclude<keyof THandlers, PresentKeys<TAlt>>]?: undefined };

/**
 * The type of `res.locals.auth` for a route: the principals of the
 * alternative that was satisfied, keyed by scheme. A route whose `security`
 * is written inline gets a union of its alternatives - a route that inherits
 * the document level security, or passes a widened array, gets every scheme
 * as optional
 */
export type SecurityAuth<THandlers, TSecurity> =
    TSecurity extends ReadonlyArray<infer TAlt>
        ? [TAlt] extends [never]
            ? NoAuth<THandlers>
            : string extends keyof TAlt
                ? AnyAuth<THandlers>
                : TAlt extends unknown ? AltAuth<THandlers, TAlt> : never
        : AnyAuth<THandlers>;

/**
 * `res.locals` for a route - left as the Express default when no handlers are
 * configured so handlers annotated with plain Express types keep compiling
 */
export type SecurityLocals<THandlers, TSecurity> = [keyof THandlers] extends [never]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? Record<string, any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : Record<string, any> & { auth: SecurityAuth<THandlers, TSecurity> };

export type RouteSecurity = ReadonlyArray<SecurityRequirement> | undefined;

export type RequestValidation<
    TParams extends TSchema,
    TQuery extends TSchema,
    TBody extends TSchema,
    TResponse extends TSchema,
    TSecurity extends RouteSecurity = RouteSecurity
> = {
  private?: boolean;
  deprecated?: boolean;
  /**
   * OpenAPI Security Requirement Objects for this operation. Overrides the
   * document level `security` array - entries are alternatives (OR) and the
   * keys must reference `components.securitySchemes`. Enforced when the
   * Schema is given `securityHandlers`
   */
  security?: TSecurity;
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
