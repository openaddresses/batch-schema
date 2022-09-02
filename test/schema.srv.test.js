import test from 'tape';
import express from 'express';
import Schema from '../index.js';

const app = express();
const schema = new Schema(express.Router(), {
    api: true
});

app.use('/api', schema.router);

let server = false;

test('start', (t) => {
    server = app.listen(2000, async (err) => {
        await schema.api();
        schema.error();

        t.error(err, 'no errors');
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
            message: 'validation error',
            messages: [{
                keyword: 'enum',
                instancePath: '/method',
                schemaPath: '#/properties/method/enum',
                params: {
                    allowedValues: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH']
                },
                message: 'must be equal to one of the allowed values'
            }]
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
        t.deepEquals(Object.keys(await res.json()).sort(), ['query', 'body', 'res'].sort());

    } catch (err) {
        t.error(err, 'no error');
    }

    t.end();
});

test('End', async (t) => {
    await server.close();
    t.end();
});
