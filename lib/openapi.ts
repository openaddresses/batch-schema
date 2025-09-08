import { OpenAPIV3 as Doc } from 'openapi-types'
import { RequestValidation } from './types.js';
import { TSchema } from '@sinclair/typebox';

export type OpenAPIDocumentInput = {
    openapi?: string,
    info?: {
        title: string;
        version: string;
        [k: string]: string;
    },
    paths?: Record<string, Record<string, unknown>>;
    components?: {
        schemas?: Record<string, object>
        securitySchemes?: Record<string, object>
    },
    security?: Array<unknown>
}

export type OpenAPIDocument = {
    openapi: string,
    info: {
        title: string;
        version: string;
        [k: string]: string;
    },
    paths: Record<string, Record<string, unknown>>,
    components: {
        schemas?: Record<string, object>
        securitySchemes?: Record<string, object>
    },
    security?: Array<unknown>
}

/**
 * @class
 */
export default class Docs {
    base: OpenAPIDocument;
    prefix: string;
    error: Record<string, TSchema>;

    constructor(
        base: OpenAPIDocumentInput = {},
        opts: {
            prefix?: string;
            error?: Record<string, TSchema>;
        } = {}
    ) {
        base.openapi = '3.1.0'

        if (!base.paths) {
            base.paths = {};
        }

        if (opts.error) {
            this.error = opts.error;
        } else {
            this.error = {};
        }

        if (!base.components) {
            base.components = {};
        }

        if (!base.info) {
            base.info = { title: 'OpenAPI', version: '1.0.0' };
        }

        this.base = base as OpenAPIDocument;
        this.prefix = opts.prefix || '';
    }

    push(
        parsed: {
            method: Doc.HttpMethods
            path: string;
        },
        schemas: RequestValidation<any, any, any, any>
    ): void {
        const path: Array<string> = [];

        for (let sec of parsed.path.split('/')) {
            for (const lit of ['.', '-']) { // These chars are used literally and can't be part of a param name
                const mini: Array<string> = [];
                for (const s of sec.split(lit)) {
                    if (s[0] === ':') mini.push(`{${s}}`);
                    else mini.push(s);
                }
                sec = mini.join(lit);
            }

            path.push(sec);
        }

        const pathstr = this.prefix + path.join('/');

        if (this.base.paths[pathstr] && this.base.paths[pathstr][parsed.method]) throw new Error(`Duplicate Path: ${parsed.method}: ${parsed.path}`);

        if (!schemas.private) {
            if (!this.base.paths[pathstr]) this.base.paths[pathstr] = {};

            const document: Doc.OperationObject = {
                summary: schemas.description || 'No Description',
                parameters: [],
                tags: [schemas.group || 'Default'],
                responses: {}
            };

            if (schemas.params && schemas.params.type === 'object') {
                for (const name in (schemas.params.properties || {})) {
                    const param = schemas.params.properties[name];
                    if (!document.parameters) document.parameters = [];
                    document.parameters.push({
                        in: 'path',
                        name: `:${name}`,
                        schema: param,
                        required: true,
                        description: param.description || 'No Description'
                    });
                }
            }

            if (schemas.query && schemas.query.type === 'object') {
                for (const name in (schemas.query.properties || {})) {
                    const query = schemas.query.properties[name];
                    if (!document.parameters) document.parameters = [];
                    document.parameters.push({
                        in: 'query',
                        name,
                        schema: query,
                        required: query.required || (schemas.query.required || []).includes(name),
                        description: query.description || 'No Description'
                    });
                }
            }

            if (schemas.res) {
                const response: Doc.ResponseObject =  {
                    description: 'Successful Response',
                    content: {
                        'application/json': {
                            schema: schemas.res
                        }
                    }
                }
                document.responses['200'] = response;
            } else {
                const response: Doc.ResponseObject =  {
                    description: 'Successful Response'
                }
                document.responses['200'] = response;
            }

            for (const code of Object.keys(this.error)) {
                document.responses[code] = {
                    description: 'Error Response',
                    content: {
                        'application/json': {
                            schema: this.error[code]
                        }
                    }
                }
            }

            if (schemas.body) {
                document.requestBody = {
                    required: true,
                    content: {
                        'application/json': {
                            schema: schemas.body
                        }
                    }
                };
            }

            this.base.paths[pathstr][parsed.method] = document;
        }
    }
}
