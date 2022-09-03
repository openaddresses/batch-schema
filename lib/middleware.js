import Err from '@openaddresses/batch-error';
import Param from './param.js';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ValidationError } from 'express-json-validator-middleware';

const ajv = addFormats(new Ajv({
    allErrors: true,
    removeAdditional: true
}));

/**
 * @class
 */
export default class Middleware {
    /**
     * Express middleware to identify express params that should be integers/number/booleans
     * according to the schema and attempt to cast them as such to ensure they pass the schema
     *
     * @param {String} match Express Param
     * @param {String} type Type to coerce it to
     *
     * @returns {Function}
     */
    static param(match, type) {
        return function (req, res, next) {
            try {
                Param[type](req, match.replace(':', ''));
            } catch (err) {
                return Err.respond(err, res);
            }

            return next();
        };
    }

    /**
     * Express middleware to identify query params that should be integers/booleans according to the schema
     * and attempt to cast them as such to ensure they pass the schema
     *
     * @param {Object} schema JSON Schema
     *
     * @returns {Function}
     */
    static query(schema) {
        return function (req, res, next) {
            for (const key in req.query) {
                if (!schema.properties[key] || !schema.properties[key].type) continue;

                // For easier processing use consistent array format IE: `type: ["integer", "boolean"]` vs type: "integer"
                if (!Array.isArray(schema.properties[key].type)) {
                    schema.properties[key].type = [schema.properties[key].type];
                }

                for (const type of schema.properties[key].type) {
                    if (type === 'array') {
                        req.query[key] = req.query[key].split(',');

                        if (schema.properties[key].items && schema.properties[key].items.type === 'number') {
                            req.query[key] = req.query[key].map((k) => {
                                return Number(k);
                            });
                        } else if (schema.properties[key].items && schema.properties[key].items.type === 'integer') {
                            req.query[key] = req.query[key].map((k) => {
                                return parseInt(k);
                            });
                        } else if (schema.properties[key].items && schema.properties[key].items.type === 'boolean') {
                            req.query[key] = req.query[key].map((k) => {
                                if (k === 'true') {
                                    return true;
                                } else if (k === 'false') {
                                    return false;
                                }
                            });
                        }
                    } else if (type === 'integer' && !isNaN(parseInt(req.query[key]))) {
                        req.query[key] = parseInt(req.query[key]);
                    } else if (type === 'number' && !isNaN(Number(req.query[key]))) {
                        req.query[key] = Number(req.query[key]);
                    } else if (type === 'boolean') {
                        if (req.query[key] === 'true') {
                            req.query[key] = true;
                        } else if (req.query[key] === 'false') {
                            req.query[key] = false;
                        }
                    }
                }
            }

            for (const key in schema.properties) {
                if (req.query[key] === undefined && schema.properties[key].default !== undefined) {
                    req.query[key] = schema.properties[key].default;
                }
            }

            return next();
        };
    }

    /**
     * Express middleware to validate the response body
     *
     * @param {Object} schema JSON Schema
     *
     * @returns {Function}
     */
    static res(schema) {
        const validate = ajv.compile(schema);

        return function (req, res, next) {
            const json = res.json;
            res.json = function(obj) {
                if (res.statusCode === null || res.statusCode === 200) {
                    validate(obj);
                }

                json.call(this, obj);
            };
            next();
        };
    }

    /**
     * Convert validation errors into standardized JSON Error Messages
     *
     * @returns {Function}
     */
    static error() {
        return function(err, req, res, next) {
            if (err instanceof ValidationError) {
                let errs = [];
                if (err.validationErrors.body) {
                    errs = errs.concat(err.validationErrors.body);
                }

                if (err.validationErrors.query) {
                    errs = errs.concat(err.validationErrors.query);
                }

                return Err.respond(
                    new Err(400, null, 'validation error'),
                    res,
                    errs
                );
            } else {
                next(err);
            }
        };
    }
}
