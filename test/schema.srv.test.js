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

        t.error(err, 'no errors');
        t.end();
    });
});

test('GET: api/schema', async (t) => {
    try {
        const res = await got('http://localhost:2000/api/schema').json();

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
        const res = await got('http://localhost:2000/api/schema?method=fake').json();

        t.deepEquals(res, {
            status: 400,
            message: 'validation error',
            messages: [{
                message: 'should be equal to one of the allowed values'
            }]
        });
    } catch (err) {
        t.error(err, 'no error');
    }

    t.end();
});

test.skip('GET: api/schema?method=GET', async (t) => {
    try {
        const res = await flight.request({
            url: '/api/schema?method=GET',
            method: 'GET',
            json: true
        }, false);

        t.equals(res.statusCode, 400, 'http: 400');
        t.deepEquals(res.body, {
            status: 400,
            message: 'url & method params must be used together',
            messages: []
        });

    } catch (err) {
        t.error(err, 'no error');
    }

    t.end();
});

test.skip('GET: api/schema?url=123', async (t) => {
    try {
        const res = await flight.request({
            url: '/api/schema?url=123',
            method: 'GET',
            json: true
        }, false);

        t.equals(res.statusCode, 400, 'http: 400');
        t.deepEquals(res.body, {
            status: 400,
            message: 'url & method params must be used together',
            messages: []
        });
    } catch (err) {
        t.error(err, 'no error');
    }

    t.end();
});

test.skip('GET: api/schema?method=POST&url=/login', async (t) => {
    try {
        const res = await flight.request({
            url: '/api/schema?method=POST&url=/login',
            method: 'GET',
            json: true
        }, t);

        t.equals(res.statusCode, 200, 'http: 200');
        t.deepEquals(res.body, {
        });

    } catch (err) {
        t.error(err, 'no error');
    }

    t.end();
});

test('End', async (t) => {
    await server.close();
    t.end();
});
