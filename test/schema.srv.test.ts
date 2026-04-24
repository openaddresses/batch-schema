import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { Type } from '@sinclair/typebox';
import Schema from '../index.js';

const app = express();
const schema = new Schema(express.Router());

app.use('/api', schema.router);

let server: ReturnType<typeof app.listen>;

describe('Schema Server', () => {
    before((_, done) => {
        server = app.listen(2000, async () => {
            await schema.get('/legacy', {
                deprecated: true,
                description: 'Legacy route',
                res: Type.Object({
                    ok: Type.Boolean()
                })
            }, async (_, res) => {
                res.json({ ok: true });
            });

            await schema.post('/json-only', {
                description: 'Backwards compatible JSON body',
                body: Type.Object({
                    name: Type.String()
                }),
                res: Type.Object({ ok: Type.Boolean() })
            }, async (req, res) => {
                res.json({ ok: typeof req.body.name === 'string' });
            });

            await schema.post('/multi-body', {
                description: 'Multi content-type body',
                body: {
                    'application/json': Type.Object({ name: Type.String() }),
                    'text/xml': true
                },
                res: Type.Object({
                    contentType: Type.String(),
                    body: Type.Any()
                })
            }, async (req, res) => {
                res.json({
                    contentType: (req.headers['content-type'] || '').split(';')[0],
                    body: req.body
                });
            });

            await schema.post('/wildcard-body', {
                description: 'Wildcard content-type body',
                body: {
                    'application/json': Type.Object({ name: Type.String() }),
                    'text/*': true
                },
                res: Type.Object({
                    contentType: Type.String(),
                    body: Type.Any()
                })
            }, async (req, res) => {
                res.json({
                    contentType: (req.headers['content-type'] || '').split(';')[0],
                    body: req.body
                });
            });

            await schema.post('/optional-body', {
                description: 'Optional body',
                body: Type.Object({ name: Type.String() }),
                bodyRequired: false,
                res: Type.Object({ ok: Type.Boolean() })
            }, async (_req, res) => {
                res.json({ ok: true });
            });

            await schema.post('/with-examples', {
                description: 'Body with examples in OpenAPI',
                body: {
                    'application/json': {
                        schema: Type.Object({ name: Type.String() }),
                        example: { name: 'sample' },
                        examples: {
                            primary: { summary: 'Primary', value: { name: 'alice' } },
                            secondary: { summary: 'Secondary', value: { name: 'bob' } }
                        }
                    }
                },
                res: Type.Object({ ok: Type.Boolean() })
            }, async (_req, res) => {
                res.json({ ok: true });
            });

            await schema.api();
            done();
        });
    });

    after(() => {
        server.close();
    });

    it('GET: api/schema', async () => {
        const res = await fetch('http://localhost:2000/api/schema');
        const body = await res.json();

        assert.deepStrictEqual(body, {
            'GET /legacy': {
                body: false,
                query: false,
                res: true
            },
            'POST /json-only': {
                body: true,
                query: false,
                res: true
            },
            'POST /multi-body': {
                body: true,
                query: false,
                res: true
            },
            'POST /wildcard-body': {
                body: true,
                query: false,
                res: true
            },
            'POST /optional-body': {
                body: true,
                query: false,
                res: true
            },
            'POST /with-examples': {
                body: true,
                query: false,
                res: true
            },
            'GET /schema':{
                body: false,
                query: true,
                res: true
            },
            'GET /openapi': {
                body: false,
                query: false,
                res: true
            }
        });
    });

    it('GET: api/schema?method=FAKE', async () => {
        const res = await fetch('http://localhost:2000/api/schema?method=fake');

        assert.strictEqual(res.ok, false);

        assert.deepStrictEqual(await res.json(), {
            status: 400,
            message: 'Validation Error GET /schema',
            messages: [
                {"type":"Query","errors":[{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/0/const","keyword":"const","params":{"allowedValue":"GET"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/1/const","keyword":"const","params":{"allowedValue":"PUT"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/2/const","keyword":"const","params":{"allowedValue":"POST"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/3/const","keyword":"const","params":{"allowedValue":"DELETE"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/4/const","keyword":"const","params":{"allowedValue":"OPTIONS"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/5/const","keyword":"const","params":{"allowedValue":"HEAD"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/6/const","keyword":"const","params":{"allowedValue":"PATCH"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/7/const","keyword":"const","params":{"allowedValue":"TRACE"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf","keyword":"anyOf","params":{},"message":"must match a schema in anyOf"}]}
            ]
        });
    });

    it('GET: api/schema?method=GET', async () => {
        const res = await fetch('http://localhost:2000/api/schema?method=GET');
        assert.strictEqual(res.ok, false);
        assert.deepStrictEqual(await res.json(), {
            status: 400,
            message: 'url & method params must be used together',
            messages: []
        });
    });

    it('GET: api/schema?url=123', async () => {
        const res = await fetch('http://localhost:2000/api/schema?url=123');
        assert.strictEqual(res.ok, false);
        assert.deepStrictEqual(await res.json(), {
            status: 400,
            message: 'url & method params must be used together',
            messages: []
        });
    });

    it('GET: api/schema?method=GET&url=/schema', async () => {
        const res = await fetch('http://localhost:2000/api/schema?method=GET&url=/schema');

        assert.strictEqual(res.status, 200, 'http: 200');
        assert.deepStrictEqual(Object.keys(await res.json()).sort(), ['deprecated', 'query', 'res'].sort());
    });

    it('GET: api/schema?method=GET&url=/legacy', async () => {
        const res = await fetch('http://localhost:2000/api/schema?method=GET&url=/legacy');

        assert.strictEqual(res.status, 200, 'http: 200');
        assert.deepStrictEqual(await res.json(), {
            deprecated: true,
            res: {
                type: 'object',
                properties: {
                    ok: {
                        type: 'boolean'
                    }
                },
                required: ['ok']
            }
        });
    });

    it('GET: api/openapi marks deprecated operations', async () => {
        const res = await fetch('http://localhost:2000/api/openapi');
        const body = await res.json();

        assert.strictEqual(res.status, 200, 'http: 200');
        assert.strictEqual(body.paths['/legacy'].get.deprecated, true);
        assert.strictEqual(body.paths['/schema'].get.deprecated, false);
    });

    it('POST: /json-only with valid JSON body (backwards compat)', async () => {
        const res = await fetch('http://localhost:2000/api/json-only', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'foo' })
        });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { ok: true });
    });

    it('POST: /multi-body with application/json', async () => {
        const res = await fetch('http://localhost:2000/api/multi-body', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'foo' })
        });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), {
            contentType: 'application/json',
            body: { name: 'foo' }
        });
    });

    it('POST: /multi-body with text/xml (true => no validation)', async () => {
        const res = await fetch('http://localhost:2000/api/multi-body', {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml' },
            body: '<root><a>1</a></root>'
        });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), {
            contentType: 'text/xml',
            body: '<root><a>1</a></root>'
        });
    });

    it('POST: /multi-body with unsupported content-type returns 400', async () => {
        const res = await fetch('http://localhost:2000/api/multi-body', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: 'hello'
        });
        assert.strictEqual(res.status, 400);
        const body = await res.json();
        assert.strictEqual(body.status, 400);
        assert.match(body.message, /Content-Type text\/plain not supported/);
    });

    it('POST: /multi-body with invalid JSON body fails validation', async () => {
        const res = await fetch('http://localhost:2000/api/multi-body', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        assert.strictEqual(res.status, 400);
        const body = await res.json();
        assert.strictEqual(body.message, 'Validation Error POST /multi-body');
    });

    it('GET: api/openapi documents multiple content types', async () => {
        const res = await fetch('http://localhost:2000/api/openapi');
        const body = await res.json();

        assert.deepStrictEqual(
            Object.keys(body.paths['/multi-body'].post.requestBody.content).sort(),
            ['application/json', 'text/xml']
        );
        assert.deepStrictEqual(
            body.paths['/multi-body'].post.requestBody.content['text/xml'],
            { schema: {} }
        );
        assert.strictEqual(
            body.paths['/json-only'].post.requestBody.content['application/json'].schema.type,
            'object'
        );
    });

    it('POST: /wildcard-body matches text/* with text/csv', async () => {
        const res = await fetch('http://localhost:2000/api/wildcard-body', {
            method: 'POST',
            headers: { 'Content-Type': 'text/csv' },
            body: 'a,b,c\n1,2,3'
        });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), {
            contentType: 'text/csv',
            body: 'a,b,c\n1,2,3'
        });
    });

    it('POST: /wildcard-body still validates application/json strictly', async () => {
        const res = await fetch('http://localhost:2000/api/wildcard-body', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'foo' })
        });
        assert.strictEqual(res.status, 200);
    });

    it('POST: /wildcard-body rejects unsupported family', async () => {
        const res = await fetch('http://localhost:2000/api/wildcard-body', {
            method: 'POST',
            headers: { 'Content-Type': 'image/png' },
            body: 'binary'
        });
        assert.strictEqual(res.status, 400);
        const body = await res.json();
        assert.match(body.message, /Content-Type image\/png not supported/);
    });

    it('POST: /optional-body accepts no body when bodyRequired=false', async () => {
        const res = await fetch('http://localhost:2000/api/optional-body', {
            method: 'POST'
        });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { ok: true });
    });

    it('POST: /optional-body still validates when a body is sent', async () => {
        const res = await fetch('http://localhost:2000/api/optional-body', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        assert.strictEqual(res.status, 400);
    });

    it('GET: api/openapi marks optional body required=false', async () => {
        const res = await fetch('http://localhost:2000/api/openapi');
        const body = await res.json();
        assert.strictEqual(body.paths['/optional-body'].post.requestBody.required, false);
        assert.strictEqual(body.paths['/json-only'].post.requestBody.required, true);
    });

    it('GET: api/openapi includes example and examples on media type', async () => {
        const res = await fetch('http://localhost:2000/api/openapi');
        const body = await res.json();
        const media = body.paths['/with-examples'].post.requestBody.content['application/json'];
        assert.deepStrictEqual(media.example, { name: 'sample' });
        assert.deepStrictEqual(media.examples.primary, {
            summary: 'Primary',
            value: { name: 'alice' }
        });
        assert.deepStrictEqual(media.examples.secondary, {
            summary: 'Secondary',
            value: { name: 'bob' }
        });
    });
});
