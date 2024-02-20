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

import SchemaAPI from './api.js';
import Docs from './openapi.js';

export type ErrorListItem = { type: 'Body' | 'Query' | 'Params'; errors: ValueError[] };

/**
 * @class
 *
 * @param {Object} router Express Router Object
 * @param {Object} opts Options Object
 * @param {boolean|string} [opts.morgan=true] disable logging with false
 * @param {number} [opts.limit=50] body size limit in mb
 *
 * @param {URL} [opts.apidoc] apidoc file location
 */
export default class Schemas {
    router: Router;
    docs: Docs;
    schemas: Map<string, RequestValidation<any, any, any, any>>

    constructor(router: Router, opts: {
        logging?: boolean;
        limit?: number;
    } = {}) {
        if (!router) throw new Error('Router Param Required');

        this.router = router;

        if (opts.logging !== false) this.router.use(morgan('combined'));
        this.router.use(bodyparser.urlencoded({ extended: true }));
        this.router.use(bodyparser.json({ limit: `${opts.limit || 50}mb` }));

        this.docs = new Docs();
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
     * @param {Object}  bp_class    Blueprint Class with blueprint() fn
     * @param {object}  config      Config Object
     * @param {Object}  opts        Options Object
     * @param {boolean} opts.silent     Squelch StdOut
     */
    async blueprint<T>(bp_class, config?: T, opts: {
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
        try {
            this.docs.push({ method: Doc.HttpMethods.GET, path: path }, opts);
            this.schemas.set(`GET ${path}`, opts);

            const paramsValidation = opts.params && TypeCompiler.Compile(opts.params);
            const queryValidation = opts.query && TypeCompiler.Compile(opts.query);
            if (opts.body) throw new Error(`Body not allowed`);

            const _handler: RequestHandler = (req, res, next) => {
                const errors: Array<ErrorListItem> = [];
                if (paramsValidation && !paramsValidation.Check(req.params)) errors.push({ type: 'Params', errors: Array.from(paramsValidation.Errors(req.params)) });
                if (queryValidation && !queryValidation.Check(req.query)) errors.push({ type: 'Query', errors: Array.from(queryValidation.Errors(req.query)) });
                if (errors.length) return Err.respond(new Err(400, null, 'Validation Error'), res, errors);

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
        handler: RequestHandler<Static<TParams>, any, Static<TBody>, Static<TQuery>>
    ) {
        try {
            this.docs.push({ method: Doc.HttpMethods.DELETE, path: path }, opts);
            this.schemas.set(`DELETE ${path}`, opts);

            const paramsValidation = opts.params && TypeCompiler.Compile(opts.params);
            const queryValidation = opts.query && TypeCompiler.Compile(opts.query);
            if (opts.body) throw new Error(`Body not allowed`);

            const _handler: RequestHandler = (req, res, next) => {
                const errors: Array<ErrorListItem> = [];
                if (paramsValidation && !paramsValidation.Check(req.params)) errors.push({ type: 'Params', errors: Array.from(paramsValidation.Errors(req.params)) });
                if (queryValidation && !queryValidation.Check(req.query)) errors.push({ type: 'Query', errors: Array.from(queryValidation.Errors(req.query)) });
                if (errors.length) return Err.respond(new Err(400, null, 'Validation Error'), res, errors);

                return handler(req, res, next);
            };

            this.router.get(path, _handler);
        } catch (err) {
            throw new Error(`Delete: ${path}: ` + String(err))
        }
    }

    async post<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, any, Static<TBody>, Static<TQuery>>
    ) {
        try {
            this.docs.push({ method: Doc.HttpMethods.POST, path: path }, opts);
            this.schemas.set(`POST ${path}`, opts);

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
        } catch (err) {
            throw new Error(`Post: ${path}: ` + String(err))
        }
    }

    async patch<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, any, Static<TBody>, Static<TQuery>>
    ) {
        try {
            this.docs.push({ method: Doc.HttpMethods.PATCH, path: path }, opts);
            this.schemas.set(`PATCH ${path}`, opts);

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
        } catch (err) {
            throw new Error(`Patch: ${path}: ` + String(err))
        }
    }

    async put<TParams extends TSchema, TQuery extends TSchema, TBody extends TSchema, TResponse extends TSchema>(
        path: string,
        opts: RequestValidation<TParams, TQuery, TBody, TResponse> = {},
        handler: RequestHandler<Static<TParams>, any, Static<TBody>, Static<TQuery>>
    ) {
        try {
            this.docs.push({ method: Doc.HttpMethods.PUT, path: path }, opts);
            this.schemas.set(`PUT ${path}`, opts);

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
        } catch (err) {
            throw new Error(`Put: ${path}: ` + String(err))
        }
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
        const lite = {};

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
