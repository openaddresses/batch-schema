import { Validator } from 'express-json-validator-middleware';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import fs from 'fs';
import path from 'path';
import morgan from 'morgan';
import bodyparser from 'body-parser';

import SchemaRoute from '../routes/schema.js';
import Param from './param.js';
import Docs from './openapi.js';
import Middleware from './middleware.js';

/**
 * @class
 *
 * @param {Object} router Express Router Object
 * @param {Object} opts Options Object
 * @param {String} opts.schemas Schemas Path
 * @param {boolean|string} [opts.logging=true] disable logging with false
 * @param {number} [opts.limit=50] body size limit in mb
 *
 * @param {URL} [opts.apidoc] apidoc file location
 */
export default class Schemas {
    constructor(router, opts = {}) {
        if (!router) throw new Error('Router Param Required');

        if (!opts.schemas) {
            this.schemas_path = new URL('../schema/', import.meta.url).pathname;
        } else {
            if (opts.schemas instanceof URL) opts.schemas = opts.schemas.pathname;
            else opts.schemas = String(opts.schemas);

            this.schemas_path = opts.schemas;
        }

        this.validator = new Validator({
            removeAdditional: true,
            useDefaults: true,
            allErrors: true
        });

        this.router = router;

        if (opts.morgan !== false) this.router.use(morgan('combined'));
        this.router.use(bodyparser.urlencoded({ extended: true }));
        this.router.use(bodyparser.json({ limit: `${opts.limit}mb` }));

        this.schemas = new Map();
        this.validate = this.validator.validate;

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
    async load(dirpath, config, opts = {}) {
        if (dirpath instanceof URL) dirpath = dirpath.pathname;
        else dirpath = String(dirpath);

        const routes = [];

        // Load dynamic routes directory
        for (const r of fs.readdirSync(dirpath)) {
            if (!opts.silent) console.log(`ok - loaded routes/${r}`);
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
    async blueprint(bp_class, config, opts = {}) {
        if (!opts.silent) console.log(`ok - loaded ${bp_class.name}`);
        await bp_class.blueprint(this, config);
    }

    check(url, schemas, fns) {
        if (typeof url !== 'string') throw new Error('URL should be string');

        if (schemas === null) schemas = {};
        if (typeof schemas !== 'object') throw new Error('Schemas should be object');

        // Make sure express params are validated/coerced into proper type
        const matches = url.match(/(:.+?)(?=\/|\.|$)/g);
        if (matches) for (const match of matches) {
            if (!schemas[match]) throw new Error(`${match} type is not defined in schema`);
            if (!Param[schemas[match]]) throw new Error(`${schemas[match]} is not a supported type for ${match}`);
        }

        if (!fns.length) throw new Error('At least 1 route function should be defined');
    }

    async get(url, schemas, ...fns) {
        this.check(url, schemas, fns);
        this.router.get(...await this.generic(`GET ${url}`, schemas), ...fns);
    }

    async delete(url, schemas, ...fns) {
        this.check(url, schemas, fns);
        this.router.delete(...await this.generic(`DELETE ${url}`, schemas), ...fns);
    }

    async post(url, schemas, ...fns) {
        this.check(url, schemas, fns);
        this.router.post(...await this.generic(`POST ${url}`, schemas), ...fns);
    }

    async patch(url, schemas, ...fns) {
        this.check(url, schemas, fns);
        this.router.patch(...await this.generic(`PATCH ${url}`, schemas), ...fns);
    }

    async put(url, schemas, ...fns) {
        this.check(url, schemas, fns);
        this.router.put(...await this.generic(`PUT ${url}`, schemas), ...fns);
    }

    async generic(url, schemas = {}) {
        if (!schemas) schemas = {};

        const parsed = url.split(' ');
        if (parsed.length !== 2) throw new Error('schema.generic() must be of format "<VERB> <URL>"');

        for (const type of ['body', 'query', 'res']) {
            if (!schemas[type]) continue;

            // TODO: Write schemas to a tmp directory so blueprints & main schemas are in the same place
            if (typeof schemas[type] === 'object') {
                schemas[`${type}_url`] = null;
            } else if (typeof schemas[type] === 'string') {
                schemas[`${type}_url`] = '../schema/' + schemas[type];
                try {
                    schemas[type] = await $RefParser.dereference((new URL(`../schema/${schemas[type]}`, import.meta.url)).pathname);
                } catch (err) {
                    schemas[type] = await $RefParser.dereference(`${this.schemas_path}/${schemas[type]}`);
                }
            } else {
                throw new Error(`Unsupported Value in ${type} value for ${url}`);
            }
        }

        this.docs.push(parsed, schemas);

        this.schemas.set(parsed.join(' '), schemas);

        const opts = {};
        if (schemas.query) opts.query = schemas.query;
        if (schemas.body) opts.body = schemas.body;

        const flow = [parsed[1], []];

        if (schemas.query) flow[1].push(Middleware.query(schemas.query));

        // Make sure express params are validated/coerced into proper type
        const matches = url.match(/(:.+?)(?=\/|\.|$)/g);
        if (matches) for (const match of matches) {
            if (!schemas[match]) throw new Error(`${match} type is not defined in schema`);

            flow[1].push(Middleware.param(match, schemas[match]));
        }

        flow[1].push(this.validate(opts));

        if (schemas.res) flow[1].push(Middleware.res(schemas.res));

        return flow;
    }

    /**
     * Convert validation errors into standardized JSON Error Messages
     */
    error() {
        this.router.use(Middleware.error());
    }

    /**
     * Return all schemas (body, query, etc) for a given method + url
     *
     * @param {String} method HTTP Method
     * @param {String} url URL
     *
     * @returns {Object}
     */
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

    /**
     * Catch all for unmatched routes
     */
    not_found() {
        this.router.all('*', (req, res) => {
            return res.status(404).json({
                status: 404,
                message: 'API endpoint does not exist!',
                messages: []
            });
        });
    }

    /**
     * Return a list of endpoints with schemas
     *
     * @returns {Object}
     */
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
}
