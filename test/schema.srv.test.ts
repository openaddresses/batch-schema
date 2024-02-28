import test from 'tape';
import express from 'express';
import Schema from '../index.js';

const app = express();
const schema = new Schema(express.Router());

app.use('/api', schema.router);

let server;

test('start', (t) => {
    server = app.listen(2000, async () => {
        await schema.api();
        t.end();
    });
});

test('GET: api/schema', async (t) => {
    try {
        const res = await fetch('http://localhost:2000/api/schema');
        const body = await res.json();

        t.deepEquals(body, {
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
    } catch (err) {
        t.error(err, 'no error');
    }

    t.end();
});

test('GET: api/schema?method=FAKE', async (t) => {
    try {
        const res = await fetch('http://localhost:2000/api/schema?method=fake');

        t.notOk(res.ok);

        t.deepEquals(await res.json(), {
            status: 400,
            message: 'Validation Error',
            messages: [
                {"type":"Query","errors":[{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/0/const","keyword":"const","params":{"allowedValue":"GET"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/1/const","keyword":"const","params":{"allowedValue":"PUT"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/2/const","keyword":"const","params":{"allowedValue":"POST"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/3/const","keyword":"const","params":{"allowedValue":"DELETE"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/4/const","keyword":"const","params":{"allowedValue":"OPTIONS"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/5/const","keyword":"const","params":{"allowedValue":"HEAD"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/6/const","keyword":"const","params":{"allowedValue":"PATCH"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf/7/const","keyword":"const","params":{"allowedValue":"TRACE"},"message":"must be equal to constant"},{"instancePath":"/method","schemaPath":"#/properties/method/anyOf","keyword":"anyOf","params":{},"message":"must match a schema in anyOf"}]}
            ]
        });
    } catch (err) {
        t.error(err);
    }

    t.end();
});

test('GET: api/schema?method=GET', async (t) => {
    try {
        const res = await fetch('http://localhost:2000/api/schema?method=GET');
        t.notOk(res.ok);
        t.deepEquals(await res.json(), {
            status: 400,
            message: 'url & method params must be used together',
            messages: []
        });
    } catch (err) {
        t.error(err);
    }

    t.end();
});
test('GET: api/schema?url=123', async (t) => {
    try {
        const res = await fetch('http://localhost:2000/api/schema?url=123');
        t.notOk(res.ok);
        t.deepEquals(await res.json(), {
            status: 400,
            message: 'url & method params must be used together',
            messages: []
        });
    } catch (err) {
        t.error(err);
    }

    t.end();
});

test('GET: api/schema?method=GET&url=/schema', async (t) => {
    try {
        const res = await fetch('http://localhost:2000/api/schema?method=GET&url=/schema');

        t.equals(res.status, 200, 'http: 200');
        t.deepEquals(Object.keys(await res.json()).sort(), ['query', 'res'].sort());

    } catch (err) {
        t.error(err, 'no error');
    }

    t.end();
});

test('End', async (t) => {
    await server.close();
    t.end();
});
