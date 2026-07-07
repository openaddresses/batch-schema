import fs from 'node:fs';
import type { Request, Response } from 'express';
import path from 'node:path';
import morgan from 'morgan';
import bodyparser from 'body-parser';
import Err from '@openaddresses/batch-error';
import { Kind } from '@sinclair/typebox';
import type { Static, TSchema } from '@sinclair/typebox';
import { OpenAPIV3 as Doc } from 'openapi-types'
import { Router } from 'express'
import type { RequestHandler } from 'express'
import { Ajv } from 'ajv'
import type { ErrorObject, ValidateFunction } from 'ajv'
import addFormatsModule from 'ajv-formats'
import type { RequestValidation, NormalizedBody } from './types.js';
import { normalizeBody, matchContentType } from './types.js';
import type { OpenAPIDocumentInput } from './openapi.js'
import SchemaAPI from './api.js';
import Docs from './openapi.js';

const ajv = new Ajv({
    strict: false,
    allErrors: true,
    useDefaults: true,
    removeAdditional: 'all',
    coerceTypes: true
});

addFormatsModule.default(ajv);

export type ErrorListItem = { type: 'Body' | 'Query' | 'Params'; errors: ErrorObject[] };

/**
 * Per-route body validation state, compiled once at route registration:
 * ajv validators keyed by content-type, the normalized map used for
 * content-type matching, and the precomputed supported-types string
 * used in error messages.
 */
export type CompiledBodyValidation = {
    validators: Map<string, true | ValidateFunction>;
    matcher: NormalizedBody;
    supported: string;
};

type RouteMethod =
    | Doc.HttpMethods.GET
    | Doc.HttpMethods.DELETE
    | Doc.HttpMethods.POST
    | Doc.HttpMethods.PATCH
    | Doc.HttpMethods.PUT;

const MAX_LOGGED_RESPONSE = 4096;

/**
 * Deep-clone a value following JSON.stringify semantics: toJSON() support
 * (Date => ISO string), undefined/function/symbol omission, NaN/Infinity
 * => null, and circular reference detection. Response validation needs the
 * serialized shape of the payload (Dates must already be strings), and ajv's
 * removeAdditional/useDefaults mutate the object they validate, so the
 * caller's object must be protected. A single-pass clone does both without
 * the cost of JSON.parse(JSON.stringify()) building an intermediate string.
 */
function jsonClone(value: unknown, seen?: Set<object>): unknown {
    if (value !== null && typeof value === 'object' && typeof (value as { toJSON?: unknown }).toJSON === 'function') {
        value = (value as { toJSON: () => unknown }).toJSON();
    }

    if (value === null) return null;

    switch (typeof value) {
        case 'string':
        case 'boolean':
            return value;
        case 'number':
            return Number.isFinite(value) ? value : null;
        case 'bigint':
            throw new TypeError('Do not know how to serialize a BigInt');
        case 'object':
            break;
        default:
            return undefined; // undefined | function | symbol are omitted, as in JSON.stringify
    }

    if (!seen) seen = new Set();
    if (seen.has(value as object)) throw new TypeError('Converting circular structure to JSON');
    seen.add(value as object);

    let out: unknown;
    if (Array.isArray(value)) {
        const arr = new Array(value.length);
        for (let i = 0; i < value.length; i++) {
            const v = jsonClone(value[i], seen);
            arr[i] = v === undefined ? null : v;
        }
        out = arr;
    } else {
        const obj: Record<string, unknown> = {};
        for (const key of Object.keys(value)) {
            const v = jsonClone((value as Record<string, unknown>)[key], seen);
            if (v !== undefined) obj[key] = v;
        }
        out = obj;
    }

    seen.delete(value as object);
    return out;
}

/**
 * @class
 *
 * @param {Object} router Express Router Object
 * @param {Object}          opts Options Object
 * @param {object}          [opts.logging] disable logging with false
 * @param {number}          [opts.limit=50] body size limit in mb
 * @param {object}          [opts.openapi] OpenAPI Base Document
 * @param {object}          [opts.prefix] API string Prefix
 * @param {object}          [opts.error] Error Schemas
 *
 * @param {URL} [opts.apidoc] apidoc file location
 */
export default class Schemas {
    router: Router;
    docs: Docs;
    prefix: string;
    error: Record<number, TSchema>;
    schemas: Map<string, RequestValidation<TSchema, TSchema, TSchema, TSchema>>

    validationError(method: Doc.HttpMethods, path: string) {
        return new Err(400, null, `Validation Error ${String(method).toUpperCase()} ${path}`);
    }

    /**
     * Compile body validators keyed by content-type. Returns null when no
     * body validation is configured. Each validator entry is either `true`
     * (any body accepted for this content-type) or a compiled ajv validator.
     * The content-type matcher and supported-types error string are
     * precomputed here so no per-request allocation is needed.
     */
    compileBodyValidators(
        body: RequestValidation<TSchema, TSchema, TSchema, TSchema>['body']
    ): CompiledBodyValidation | null {
        const normalized = normalizeBody(body);
        if (!normalized) return null;

        const validators = new Map<string, true | ValidateFunction>();
        for (const ct of Object.keys(normalized)) {
            const schema = normalized[ct].schema;
            if (schema === true || schema === undefined) {
                validators.set(ct, true);
            } else {
                validators.set(ct, ajv.compile(schema));
            }
        }

        return {
            validators,
            matcher: normalized,
            supported: Object.keys(normalized).join(', ')
        };
    }

    /**
     * Validate the incoming request body against the compiled validation
     * state for the route. Pushes a Body error onto `errors` if validation
     * fails; returns an Err to respond with for an unsupported content-type.
     *
     * If `opts.required` is false and the request has no body / no
     * content-type, validation is skipped.
     */
    validateBody(
        req: Request,
        compiled: CompiledBodyValidation,
        errors: Array<ErrorListItem>,
        opts: { required?: boolean } = {}
    ): Err | null {
        const raw = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const required = opts.required !== false;

        if (!raw && !required) return null;

        const matched = matchContentType(raw, compiled.matcher);
        const validator = matched ? compiled.validators.get(matched) : undefined;

        if (!validator) {
            return new Err(400, null, `Content-Type ${raw || '(none)'} not supported. Supported: ${compiled.supported}`);
        }

        if (validator !== true) {
            if (!validator(req.body)) {
                errors.push({ type: 'Body', errors: validator.errors as ErrorObject[] });
            }
        }

        return null;
    }

    constructor(
        router: Router,
        opts: {
            prefix?: string;
            logging?: boolean | morgan.Options<Request, Response>;
            limit?: number;
            error?: Record<number, TSchema>;
            openapi?: OpenAPIDocumentInput;
        } = {}
    ) {
        if (!router) throw new Error('Router Param Required');

        this.router = router;

        this.prefix = opts.prefix || '';

        if (opts.logging !== false) {
            const morganOptions: morgan.Options<Request, Response> = opts.logging && typeof opts.logging === 'object' ? opts.logging : {};
            this.router.use(morgan('combined', morganOptions));
        }

        this.router.use(bodyparser.urlencoded({ extended: true, limit: `${opts.limit || 50}mb` }));
        this.router.use(bodyparser.json({ limit: `${opts.limit || 50}mb` }));
        this.router.use(bodyparser.text({
            limit: `${opts.limit || 50}mb`,
            type: ['text/*', 'application/xml', 'application/*+xml']
        }));
        this.router.use(bodyparser.raw({
            limit: `${opts.limit || 50}mb`,
            type: ['application/octet-stream']
        }));

        if (opts.error) {
            this.error = opts.error;
        } else {
            this.error = {};
        }

        this.docs = new Docs(opts.openapi, {
            prefix: this.prefix,
            error: this.error
        });

        this.schemas = new Map();
    }

    normalizeValidation<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {}
    ): RequestValidation<TParams, TQuery, TBody, TResponse> {
        return {
            deprecated: false,
            ...opts
        };
    }

    async api() {
        await SchemaAPI(this);
    }

    /**
     * Load routes directory. All .js files in the given directory will be loaded (ES Module)
     * and the default method run
     *
     * @param {String}  dirpath     Directory to load
     * @param {object}  config      Config Object
     * @param {Object}  opts        Options Object
     * @param {boolean} opts.silent     Squelch StdOut
     */
    async load<T>(dirpath: string | URL, config: T, opts: {
        silent: boolean;
    } = {
        silent: false
    }) {
        if (dirpath instanceof URL) dirpath = dirpath.pathname;
        else dirpath = String(dirpath);

        const routes: Array<Promise<(schema: Schemas, config: T) => void>> = [];

        // Load dynamic routes directory
        for (const r of fs.readdirSync(dirpath)) {
            if (!opts.silent) console.log(`ok - loaded routes/${r}`);
            if (!['.ts', '.js'].includes(path.parse(r).ext)) continue;
            routes.push((await import(path.resolve(dirpath, r))).default(this, config));
        }

        await Promise.all(routes);

        this.not_found();
    }

    /**
     * Load a blueprint into the router
     *
     * @param {Object}  bp_funcion  Blueprint Function to init instances
     * @param {object}  config      Config Object
     * @param {Object}  opts        Options Object
     * @param {boolean} opts.silent     Squelch StdOut
     */
    async blueprint<T>(bp_fn: (schema: Schemas, config?: T) => Promise<void>, config?: T, opts: {
        silent: boolean;
    } = { silent: false }) {
        if (!opts.silent) console.log(`ok - loaded blueprint`);
        await bp_fn(this, config);
    }

    /**
     * Compile the response validator for a route. Type.Any and Type.Unknown
     * impose no constraints, so they are skipped entirely — routes with an
     * open response schema (or none) bypass response validation and its
     * clone at request time.
     */
    private compileResponseValidation(res?: TSchema): ValidateFunction | null {
        if (!res) return null;
        if (res[Kind] === 'Any' || res[Kind] === 'Unknown') return null;
        return ajv.compile(res);
    }

    /**
     * Shared route registration: compiles all validators once, then installs
     * a request handler that validates params/query/body and — only when a
     * response schema requires it — wraps res.json with response validation.
     */
    private route<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        method: RouteMethod,
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse>,
        handler: RequestHandler<Static<TParams>, Static<TResponse>, Static<TBody>, Static<TQuery>>,
        allowBody: boolean
    ): void {
        const methodUpper = String(method).toUpperCase();

        try {
            const validation = this.normalizeValidation(opts);

            this.docs.push({ method, path }, validation);
            this.schemas.set(`${methodUpper} ${path}`, validation);

            const resValidation = this.compileResponseValidation(validation.res);
            const paramsValidation = validation.params && ajv.compile(validation.params);
            const queryValidation = validation.query && ajv.compile(validation.query);

            let bodyValidation: CompiledBodyValidation | null = null;
            if (allowBody) {
                bodyValidation = this.compileBodyValidators(validation.body);
            } else if (validation.body) {
                throw new Error(`Body not allowed`);
            }

            const _handler: RequestHandler = (req, res, next) => {
                if (req.query) { // Ref: https://github.com/cdimascio/express-openapi-validator/issues/969
                    Object.defineProperty(req, 'query', {
                        writable: true,
                        value: { ...req.query },
                    })
                }

                const errors: Array<ErrorListItem> = [];
                if (paramsValidation && !paramsValidation(req.params)) errors.push({ type: 'Params', errors: paramsValidation.errors as ErrorObject[] });
                if (queryValidation && !queryValidation(req.query)) errors.push({ type: 'Query', errors: queryValidation.errors as ErrorObject[] });
                if (bodyValidation) {
                    const ctErr = this.validateBody(req, bodyValidation, errors, { required: validation.bodyRequired });
                    if (ctErr) return Err.respond(ctErr, res);
                }
                if (errors.length) return Err.respond(this.validationError(method, path), res, errors);

                if (resValidation) {
                    const json = res.json;
                    res.json = function(obj) {
                        if (res.statusCode === null || res.statusCode === 200) {
                            obj = jsonClone(obj); // Date => String needs to happen before validation
                            if (!resValidation(obj)) {
                                res.status(400);
                                const logged = JSON.stringify(obj);
                                console.error(`Response Validation Error: ${methodUpper} ${path}: ${logged && logged.length > MAX_LOGGED_RESPONSE ? logged.slice(0, MAX_LOGGED_RESPONSE) + '... (truncated)' : logged}`);
                                return json.call(this, { type: 'Response', errors: resValidation.errors as ErrorObject[] });
                            }
                        }
                        return json.call(this, obj);
                    };
                }

                return handler(req, res, next);
            };

            this.router[method as 'get' | 'delete' | 'post' | 'patch' | 'put'](path, _handler);
        } catch (err) {
            const label = methodUpper.charAt(0) + methodUpper.slice(1).toLowerCase();
            throw new Error(`${label}: ${path}: ` + String(err), { cause: err })
        }
    }

    async get<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, Static<TResponse>, Static<TBody>, Static<TQuery>>
    ) {
        this.route(Doc.HttpMethods.GET, path, opts, handler, false);
    }

    async delete<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, Static<TResponse>, Static<TBody>, Static<TQuery>>
    ) {
        this.route(Doc.HttpMethods.DELETE, path, opts, handler, false);
    }

    async post<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, Static<TResponse>, Static<TBody>, Static<TQuery>>
    ) {
        this.route(Doc.HttpMethods.POST, path, opts, handler, true);
    }

    async patch<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, Static<TResponse>, Static<TBody>, Static<TQuery>>
    ) {
        this.route(Doc.HttpMethods.PATCH, path, opts, handler, true);
    }

    async put<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, Static<TResponse>, Static<TBody>, Static<TQuery>>
    ) {
        this.route(Doc.HttpMethods.PUT, path, opts, handler, true);
    }

    not_found() {
        this.router.all('*path', (req, res) => {
            res.status(404).json({
                status: 404,
                message: 'API endpoint does not exist!',
                messages: []
            });
        });
    }


    query(method: Doc.HttpMethods, url: string): {
        deprecated?: boolean;
        query?: object;
        body?: object;
        res?: object;
    } {
        if (!this.schemas.has(`${method} ${url}`)) {
            return {};
        }

        const schema = JSON.parse(JSON.stringify(this.schemas.get(`${method} ${url}`)));

        return {
            deprecated: schema.deprecated,
            query: schema.query,
            body: schema.body,
            res: schema.res
        };
    }

    list(): {
        [k: string]: {
            body: boolean;
            query: boolean;
            res: boolean;
        }
    } {
        const lite: {
            [k: string]: {
                body: boolean;
                query: boolean;
                res: boolean;
            }
        } = {};

        for (const key of this.schemas.keys()) {
            const schema = this.schemas.get(key);
            if (!schema) continue;

            lite[key] = {
                body: !!schema.body,
                query: !!schema.query,
                res: !!schema.res
            };
        }

        return lite;
    }
}
