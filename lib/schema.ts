import fs from 'node:fs';
import path from 'node:path';
import morgan from 'morgan';
import bodyparser from 'body-parser';
import Err from '@openaddresses/batch-error';
import { Static, TSchema } from '@sinclair/typebox';
import { OpenAPIV3 as Doc } from 'openapi-types'
import { Router, RequestHandler } from 'express'
import { TypeCompiler } from '@sinclair/typebox/compiler';
import type { ValueError } from '@sinclair/typebox/errors';
import { RequestValidation } from './types.js';

import SchemaRoute from '../routes/schema.js';
import Docs from './openapi.js';

export type ErrorListItem = { type: 'Body' | 'Query' | 'Params'; errors: ValueError[] };

/**
 * @class
 *
 * @param {Object} router Express Router Object
 * @param {Object} opts Options Object
 * @param {String} opts.schemas Schemas Path
 * @param {boolean|string} [opts.morgan=true] disable logging with false
 * @param {number} [opts.limit=50] body size limit in mb
 *
 * @param {URL} [opts.apidoc] apidoc file location
 */
export default class Schemas {
    router: Router;
    schemas_path: string;
    docs: Docs;

    constructor(router: Router, opts: {
        logging?: boolean;
        limit?: number;
        schemas?: string | URL;
    } = {}) {
        if (!router) throw new Error('Router Param Required');

        if (!opts.schemas) {
            this.schemas_path = new URL('../schema/', import.meta.url).pathname;
        } else {
            if (opts.schemas instanceof URL) opts.schemas = opts.schemas.pathname;
            else opts.schemas = String(opts.schemas);

            this.schemas_path = opts.schemas;
        }

        this.router = router;

        if (opts.logging !== false) this.router.use(morgan('combined'));
        this.router.use(bodyparser.urlencoded({ extended: true }));
        this.router.use(bodyparser.json({ limit: `${opts.limit}mb` }));

        this.docs = new Docs();
    }

    async api() {
        await SchemaRoute(this);
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
    }

    /**
     * Load a blueprint into the router
     *
     * @param {Object}  bp_class    Blueprint Class with blueprint() fn
     * @param {object}  config      Config Object
     * @param {Object}  opts        Options Object
     * @param {boolean} opts.silent     Squelch StdOut
     */
    async blueprint(bp_class, config, opts: {
        silent: boolean;
    } = { silent: false }) {
        if (!opts.silent) console.log(`ok - loaded ${bp_class.name}`);
        await bp_class.blueprint(this, config);
    }

    async get<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, any, Static<TBody>, Static<TQuery>>
    ) {
        this.docs.push({
            method: Doc.HttpMethods.GET,
            path: path
        }, opts);

        const paramsValidation = opts.params && TypeCompiler.Compile(opts.params);
        const queryValidation = opts.query && TypeCompiler.Compile(opts.query);
        if (opts.body) throw new Error(`Body not allowed on GET ${path}`);

        const _handler: RequestHandler = (req, res, next) => {
            const errors: Array<ErrorListItem> = [];
            if (paramsValidation && !paramsValidation.Check(req.params)) errors.push({ type: 'Params', errors: Array.from(paramsValidation.Errors(req.params)) });
            if (queryValidation && !queryValidation.Check(req.query)) errors.push({ type: 'Query', errors: Array.from(queryValidation.Errors(req.query)) });
            if (errors.length) return Err.respond(new Err(400, null, 'Validation Error'), res, errors);

            return handler(req, res, next);
        };

        this.router.get(path, _handler);
    }

    async delete<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, any, Static<TBody>, Static<TQuery>>
    ) {
        this.docs.push({
            method: Doc.HttpMethods.DELETE,
            path: path
        }, opts);

        const paramsValidation = opts.params && TypeCompiler.Compile(opts.params);
        const queryValidation = opts.query && TypeCompiler.Compile(opts.query);
        if (opts.body) throw new Error(`Body not allowed on GET ${path}`);

        const _handler: RequestHandler = (req, res, next) => {
            const errors: Array<ErrorListItem> = [];
            if (paramsValidation && !paramsValidation.Check(req.params)) errors.push({ type: 'Params', errors: Array.from(paramsValidation.Errors(req.params)) });
            if (queryValidation && !queryValidation.Check(req.query)) errors.push({ type: 'Query', errors: Array.from(queryValidation.Errors(req.query)) });
            if (errors.length) return Err.respond(new Err(400, null, 'Validation Error'), res, errors);

            return handler(req, res, next);
        };

        this.router.get(path, _handler);
    }

    async post<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, any, Static<TBody>, Static<TQuery>>
    ) {
        this.docs.push({
            method: Doc.HttpMethods.POST,
            path: path
        }, opts);

        const paramsValidation = opts.params && TypeCompiler.Compile(opts.params);
        const queryValidation = opts.query && TypeCompiler.Compile(opts.query);
        const bodyValidation = opts.body && TypeCompiler.Compile(opts.body);

        const _handler: RequestHandler = (req, res, next) => {
            const errors: Array<ErrorListItem> = [];
            if (paramsValidation && !paramsValidation.Check(req.params)) errors.push({ type: 'Params', errors: Array.from(paramsValidation.Errors(req.params)) });
            if (queryValidation && !queryValidation.Check(req.query)) errors.push({ type: 'Query', errors: Array.from(queryValidation.Errors(req.query)) });
            if (bodyValidation && !bodyValidation.Check(req.body)) errors.push({ type: 'Body', errors: Array.from(bodyValidation.Errors(req.body)) });
            if (errors.length) return Err.respond(new Err(400, null, 'Validation Error'), res, errors);

            return handler(req, res, next);
        };

        this.router.get(path, _handler);
    }

    async patch<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, any, Static<TBody>, Static<TQuery>>
    ) {
        this.docs.push({
            method: Doc.HttpMethods.PATCH,
            path: path
        }, opts);

        const paramsValidation = opts.params && TypeCompiler.Compile(opts.params);
        const queryValidation = opts.query && TypeCompiler.Compile(opts.query);
        const bodyValidation = opts.body && TypeCompiler.Compile(opts.body);

        const _handler: RequestHandler = (req, res, next) => {
            const errors: Array<ErrorListItem> = [];
            if (paramsValidation && !paramsValidation.Check(req.params)) errors.push({ type: 'Params', errors: Array.from(paramsValidation.Errors(req.params)) });
            if (queryValidation && !queryValidation.Check(req.query)) errors.push({ type: 'Query', errors: Array.from(queryValidation.Errors(req.query)) });
            if (bodyValidation && !bodyValidation.Check(req.body)) errors.push({ type: 'Body', errors: Array.from(bodyValidation.Errors(req.body)) });
            if (errors.length) return Err.respond(new Err(400, null, 'Validation Error'), res, errors);

            return handler(req, res, next);
        };

        this.router.get(path, _handler);
    }

    async put<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, any, Static<TBody>, Static<TQuery>>
    ) {
        this.docs.push({
            method: Doc.HttpMethods.PUT,
            path: path
        }, opts);

        const paramsValidation = opts.params && TypeCompiler.Compile(opts.params);
        const queryValidation = opts.query && TypeCompiler.Compile(opts.query);
        const bodyValidation = opts.body && TypeCompiler.Compile(opts.body);

        const _handler: RequestHandler = (req, res, next) => {
            const errors: Array<ErrorListItem> = [];
            if (paramsValidation && !paramsValidation.Check(req.params)) errors.push({ type: 'Params', errors: Array.from(paramsValidation.Errors(req.params)) });
            if (queryValidation && !queryValidation.Check(req.query)) errors.push({ type: 'Query', errors: Array.from(queryValidation.Errors(req.query)) });
            if (bodyValidation && !bodyValidation.Check(req.body)) errors.push({ type: 'Body', errors: Array.from(bodyValidation.Errors(req.body)) });
            if (errors.length) return Err.respond(new Err(400, null, 'Validation Error'), res, errors);

            return handler(req, res, next);
        };

        this.router.get(path, _handler);
    }

    not_found() {
        this.router.all('*', (req, res) => {
            return res.status(404).json({
                status: 404,
                message: 'API endpoint does not exist!',
                messages: []
            });
        });
    }


    /*


    query(method, url) {
        if (!this.schemas.has(`${method} ${url}`)) {
            return { body: null, schema: null };
        }

        const schema = JSON.parse(JSON.stringify(this.schemas.get(`${method} ${url}`)));
        if (!schema.query) schema.query = null;
        if (!schema.body) schema.body = null;
        if (!schema.res) schema.res = null;

        return {
            query: schema.query,
            body: schema.body,
            res: schema.res
        };
    }

    list() {
        const lite = {};

        for (const key of this.schemas.keys()) {
            lite[key] = {
                body: !!this.schemas.get(key).body,
                query: !!this.schemas.get(key).query,
                res: !!this.schemas.get(key).res
            };
        }

        return lite;
    }
*/
}
