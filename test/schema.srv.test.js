'use strict';
const test = require('tape');
const express = require('express');
const { Schema } = require('../');
const got = require('got');

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
        const res = await got('http://localhost:2000/api/schema', {
            validateStatus: false
        }).json();

        t.deepEquals(res, {
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
        await got('http://localhost:2000/api/schema?method=fake');
        t.fail('4xx status code should throw');
    } catch (err) {
        t.deepEquals(JSON.parse(err.response.body), {
            status: 400,
            message: 'validation error',
            messages: [{
                message: 'should be equal to one of the allowed values'
            }]
        });
    }

    t.end();
});

test('GET: api/schema?method=GET', async (t) => {
    try {
        await got('http://localhost:2000/api/schema?method=GET');
        t.fail('4xx status code should throw');
    } catch (err) {
        t.deepEquals(JSON.parse(err.response.body), {
            status: 400,
            message: 'url & method params must be used together',
            messages: []
        });
    }

    t.end();
});
test('GET: api/schema?url=123', async (t) => {
    try {
        await got('http://localhost:2000/api/schema?url=123');
        t.fail('4xx status code should throw');
    } catch (err) {
        t.deepEquals(JSON.parse(err.response.body), {
            status: 400,
            message: 'url & method params must be used together',
            messages: []
        });
    }

    t.end();
});

test('GET: api/schema?method=GET&url=/schema', async (t) => {
    try {
        const res = await got('http://localhost:2000/api/schema?method=GET&url=/schema');

        t.equals(res.statusCode, 200, 'http: 200');
        t.deepEquals(Object.keys(JSON.parse(res.body)).sort(), ['query', 'body', 'res'].sort());

    } catch (err) {
        t.error(err, 'no error');
    }

    t.end();
});

test('End', async (t) => {
    await server.close();
    t.end();
});
