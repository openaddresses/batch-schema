/**
 * @class
 */
export default class Docs {
    constructor(info) {
        this.base = {
            openapi: '3.0.3',
            info: info || {
                title: 'OpenAPI Schema',
                version: '1.0.0'
            },
            paths: {}
        };
    }

    push(parsed, schemas) {
        let path = [];
        const method = parsed[0].toLowerCase();

        for (let sec of parsed[1].split('/')) {
            for (const lit of ['.', '-']) { // These chars are used literally and can't be part of a param name
                const mini = [];
                for (const s of sec.split(lit)) {
                    if (s[0] === ':') mini.push(`{${s}}`);
                    else mini.push(s);
                }
                sec = mini.join(lit);
            }
            path.push(sec);
        }
        path = path.join('/');


        if (!schemas.private) {
            if (!this.base.paths[path]) this.base.paths[path] = {};

            if (this.base.paths[path][method]) throw new Error(`Duplicate Path: ${parsed.join(' ')}`);

            const document = {
                summary: schemas.description || 'No Description',
                tags: [schemas.group || 'Default'],
                parameters: [],
                responses: {
                    200: {
                        description: 'Successful Response'
                    }
                }
            };

            for (const key in schemas) {
                if (key[0] === ':') {
                    document.parameters.push({
                        in: 'path',
                        name: key,
                        schema: {
                            type: schemas[key]
                        },
                        required: true
                    });
                }
            }

            if (schemas.query && schemas.query.type === 'object') {
                for (const name in (schemas.query.properties || {})) {
                    const query = schemas.query.properties[name];
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
                document.responses['200'].content = {
                    'application/json': {
                        schema: schemas.res
                    }
                };
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

            this.base.paths[path][method] = document;
        }
    }
}
