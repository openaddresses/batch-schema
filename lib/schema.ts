import fs from 'node:fs';
import path from 'node:path';
import morgan from 'morgan';
import bodyparser from 'body-parser';
import Err from '@openaddresses/batch-error';
import { Static, Type, TSchema } from '@sinclair/typebox';
import { OpenAPIV3 as Doc } from 'openapi-types'
import { Router, RequestHandler } from 'express'
import { Ajv, ErrorObject } from 'ajv'
import addFormatsModule from 'ajv-formats'
import { RequestValidation } from './types.js';
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
 * @class
 *
 * @param {Object} router Express Router Object
 * @param {Object}          opts Options Object
 * @param {boolean|string}  [opts.morgan=true] disable logging with false
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
    schemas: Map<string, RequestValidation<any, any, any, any>>

    constructor(
        router: Router,
        opts: {
            prefix?: string;
            logging?: boolean;
            limit?: number;
            error?: Record<number, TSchema>;
            openapi?: OpenAPIDocumentInput;
        } = {}
    ) {
        if (!router) throw new Error('Router Param Required');

        this.router = router;

        this.prefix = opts.prefix || '';

        if (opts.logging !== false) this.router.use(morgan('combined'));
        this.router.use(bodyparser.urlencoded({ extended: true }));
        this.router.use(bodyparser.json({ limit: `${opts.limit || 50}mb` }));

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

    async get<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, Static<TResponse>, Static<TBody>, Static<TQuery>>
    ) {
        try {
            this.docs.push({ method: Doc.HttpMethods.GET, path: path }, opts);
            this.schemas.set(`GET ${path}`, opts);

            const resValidation = opts.res && !(opts.res instanceof Type.Any) && !(opts.res instanceof Type.Unknown) && ajv.compile(opts.res);
            const paramsValidation = opts.params && ajv.compile(opts.params);
            const queryValidation = opts.query && ajv.compile(opts.query);
            if (opts.body) throw new Error(`Body not allowed`);

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
                if (errors.length) return Err.respond(new Err(400, null, 'Validation Error'), res, errors);

                const json = res.json;
                res.json = function(obj) {
                    obj = JSON.parse(JSON.stringify(obj)) // Here as Date => String needs to happen
                    if ((res.statusCode === null || res.statusCode === 200) && resValidation && !resValidation(obj)) {
                        res.status(400);
                        return json.call(this, { type: 'Response', errors: resValidation.errors as ErrorObject[] });
                    } else {
                        return json.call(this, obj);
                    }
                };

                return handler(req, res, next);
            };

            this.router.get(path, _handler);
        } catch (err) {
            throw new Error(`Get: ${path}: ` + err)
        }
    }

    async delete<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, Static<TResponse>, Static<TBody>, Static<TQuery>>
    ) {
        try {
            this.docs.push({ method: Doc.HttpMethods.DELETE, path: path }, opts);
            this.schemas.set(`DELETE ${path}`, opts);

            const resValidation = opts.res && !(opts.res instanceof Type.Any) && !(opts.res instanceof Type.Unknown) && ajv.compile(opts.res);
            const paramsValidation = opts.params && ajv.compile(opts.params);
            const queryValidation = opts.query && ajv.compile(opts.query);
            if (opts.body) throw new Error(`Body not allowed`);

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
                if (errors.length) return Err.respond(new Err(400, null, 'Validation Error'), res, errors);

                const json = res.json;
                res.json = function(obj) {
                    obj = JSON.parse(JSON.stringify(obj)) // Here as Date => String needs to happen
                    if ((res.statusCode === null || res.statusCode === 200) && resValidation && !resValidation(obj)) {
                        res.status(400);
                        return json.call(this, { type: 'Response', errors: resValidation.errors as ErrorObject[] });
                    } else {
                        return json.call(this, obj);
                    }
                };

                return handler(req, res, next);
            };

            this.router.delete(path, _handler);
        } catch (err) {
            throw new Error(`Delete: ${path}: ` + String(err))
        }
    }

    async post<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, Static<TResponse>, Static<TBody>, Static<TQuery>>
    ) {
        try {
            this.docs.push({ method: Doc.HttpMethods.POST, path: path }, opts);
            this.schemas.set(`POST ${path}`, opts);

            const resValidation = opts.res && !(opts.res instanceof Type.Any) && !(opts.res instanceof Type.Unknown) && ajv.compile(opts.res);
            const paramsValidation = opts.params && ajv.compile(opts.params);
            const queryValidation = opts.query && ajv.compile(opts.query);
            const bodyValidation = opts.body && ajv.compile(opts.body);

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
                if (bodyValidation && !bodyValidation(req.body)) errors.push({ type: 'Body', errors: bodyValidation.errors as ErrorObject[] });
                if (errors.length) return Err.respond(new Err(400, null, 'Validation Error'), res, errors);

                const json = res.json;
                res.json = function(obj) {
                    obj = JSON.parse(JSON.stringify(obj)) // Here as Date => String needs to happen
                    if ((res.statusCode === null || res.statusCode === 200) && resValidation && !resValidation(obj)) {
                        res.status(400);
                        return json.call(this, { type: 'Response', errors: resValidation.errors as ErrorObject[] });
                    } else {
                        return json.call(this, obj);
                    }
                };

                return handler(req, res, next);
            };

            this.router.post(path, _handler);
        } catch (err) {
            throw new Error(`Post: ${path}: ` + String(err))
        }
    }

    async patch<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, Static<TResponse>, Static<TBody>, Static<TQuery>>
    ) {
        try {
            this.docs.push({ method: Doc.HttpMethods.PATCH, path: path }, opts);
            this.schemas.set(`PATCH ${path}`, opts);

            const resValidation = opts.res && !(opts.res instanceof Type.Any) && !(opts.res instanceof Type.Unknown) && ajv.compile(opts.res);
            const paramsValidation = opts.params && ajv.compile(opts.params);
            const queryValidation = opts.query && ajv.compile(opts.query);
            const bodyValidation = opts.body && ajv.compile(opts.body);

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
                if (bodyValidation && !bodyValidation(req.body)) errors.push({ type: 'Body', errors: bodyValidation.errors as ErrorObject[] });
                if (errors.length) return Err.respond(new Err(400, null, 'Validation Error'), res, errors);

                const json = res.json;
                res.json = function(obj) {
                    obj = JSON.parse(JSON.stringify(obj)) // Here as Date => String needs to happen
                    if ((res.statusCode === null || res.statusCode === 200) && resValidation && !resValidation(obj)) {
                        res.status(400);
                        return json.call(this, { type: 'Response', errors: resValidation.errors as ErrorObject[] });
                    } else {
                        return json.call(this, obj);
                    }
                };

                return handler(req, res, next);
            };

            this.router.patch(path, _handler);
        } catch (err) {
            throw new Error(`Patch: ${path}: ` + String(err))
        }
    }

    async put<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, Static<TResponse>, Static<TBody>, Static<TQuery>>
    ) {
        try {
            this.docs.push({ method: Doc.HttpMethods.PUT, path: path }, opts);
            this.schemas.set(`PUT ${path}`, opts);

            const resValidation = opts.res && !(opts.res instanceof Type.Any) && !(opts.res instanceof Type.Unknown) && ajv.compile(opts.res);
            const paramsValidation = opts.params && ajv.compile(opts.params);
            const queryValidation = opts.query && ajv.compile(opts.query);
            const bodyValidation = opts.body && ajv.compile(opts.body);

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
                if (bodyValidation && !bodyValidation(req.body)) errors.push({ type: 'Body', errors: bodyValidation.errors as ErrorObject[] });
                if (errors.length) return Err.respond(new Err(400, null, 'Validation Error'), res, errors);

                const json = res.json;
                res.json = function(obj) {
                    obj = JSON.parse(JSON.stringify(obj)) // Here as Date => String needs to happen
                    if ((res.statusCode === null || res.statusCode === 200) && resValidation && !resValidation(obj)) {
                        res.status(400);
                        return json.call(this, { type: 'Response', errors: resValidation.errors as ErrorObject[] });
                    } else {
                        return json.call(this, obj);
                    }
                };

                return handler(req, res, next);
            };

            this.router.put(path, _handler);
        } catch (err) {
            throw new Error(`Put: ${path}: ` + String(err))
        }
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
        query?: object;
        body?: object;
        res?: object;
    } {
        if (!this.schemas.has(`${method} ${url}`)) {
            return {};
        }

        const schema = JSON.parse(JSON.stringify(this.schemas.get(`${method} ${url}`)));

        return {
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
