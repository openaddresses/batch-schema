import Err from '@openaddresses/batch-error';
import Schema from './schema.js'
import { OpenAPIV3 as Doc } from 'openapi-types'
import { Type } from '@sinclair/typebox'

export default async function router(schema: Schema) {
    await schema.get('/schema', {
        query: Type.Object({
            method: Type.Optional(Type.Uppercase(Type.Enum(Doc.HttpMethods))),
            url: Type.Optional(Type.String())
        }),
        res: Type.Object({}),
        description: `
            List all JSON Schemas in use
            With no parameters this API will return a list of all the endpoints that have a form of schema validation
            If the url/method params are used, the schemas themselves are returned

            Note: If url or method params are used, they must be used together
        `
    }, async (req, res) => {
        try {
            if (req.query.url && req.query.method) {
                res.json(schema.query(req.query.method, req.query.url));
            } else if (req.query.url || req.query.method) {
                throw new Err(400, null, 'url & method params must be used together');
            } else {
                return res.json(schema.list());
            }
        } catch (err) {
            return Err.respond(err, res);
        }
    });

    await schema.get('/openapi', {
        description: 'Return a OpenAPI Schema for the API',
        res: Type.Object({})
    }, async (req, res) => {
        try {
            return res.json(schema.docs.base);
        } catch (err) {
            return Err.respond(err, res);
        }
    });
}
