import { OpenAPIV3 as Doc } from 'openapi-types'
import { RequestValidation } from './types.js';

/**
 * @class
 */
export default class Docs {
    base: Doc.Document;

    constructor(info?: {
        title: string;
        version: string;
        [k: string]: string;
    }) {
        this.base = {
            openapi: '3.0.3',
            info: info || {
                title: 'OpenAPI Schema',
                version: '1.0.0'
            },
            paths: {}
        };
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

        const pathstr = path.join('/');

        if (this.base.paths[pathstr] && this.base.paths[pathstr][parsed.method]) throw new Error(`Duplicate Path: ${parsed.method}: ${parsed.path}`);

        if (!schemas.private) {
            if (!this.base.paths[pathstr]) this.base.paths[pathstr] = {};

            const document: Doc.OperationObject = {
                summary: schemas.description || 'No Description',
                parameters: [],
                tags: [schemas.group || 'Default'],
                responses: {}
            };

            for (const key in schemas) {
                if (key[0] === ':') {
                    if (!document.parameters) document.parameters = [];
                    document.parameters.push({
                        in: 'path',
                        name: key,
                        schema: {
                            type: schemas.params[key]
                        },
                        required: true
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
