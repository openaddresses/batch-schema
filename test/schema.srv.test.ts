import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import Schema from '../index.js';

const app = express();
const schema = new Schema(express.Router());

app.use('/api', schema.router);

let server: ReturnType<typeof app.listen>;

describe('Schema Server', () => {
    before((_, done) => {
        server = app.listen(2000, async () => {
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
        assert.deepStrictEqual(Object.keys(await res.json()).sort(), ['query', 'res'].sort());
    });
});
