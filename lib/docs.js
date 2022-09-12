/**
 * @class Docs
 */
export default class Docs extends Array {
    push(parsed, schemas) {
        const apiParams = [];
        for (const key in schemas) {
            if (key[0] === ':') {
                apiParams.push(`* @apiParam {${schemas[key]}} ${key.slice(1)} param`);
            }
        }

        super.push(
            `
                /**
                 * @api {${parsed[0].toLowerCase()}} ${parsed[1]} ${schemas.name || parsed.join(' ')}
                 * @apiVersion ${schemas.version || '1.0.0'}
                 * @apiName ${parsed.join('-')}
                 * @apiGroup ${schemas.group || 'Default'}
                 * @apiPermission ${schemas.auth || 'Unknown'}
                 *
                 * @apidescription
                 *   ${schemas.description || 'No Description'}
                 *
                 ${apiParams.join('\n')}
                 *
                 * ${schemas.query_url ? `@apiSchema (Query) {jsonschema=${schemas.query_url}} apiParam` : ''}
                 * ${schemas.body_url ? `@apiSchema (Body) {jsonschema=${schemas.body_url}} apiParam` : ''}
                 * ${schemas.res_url ? `@apiSchema {jsonschema=${schemas.res_url}} apiSuccess` : ''}
                 */
            `.split('\n')
                .map((l) => l.trim())
                .join('\n')
        );
    }
}
