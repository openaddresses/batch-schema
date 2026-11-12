import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import Err from '@openaddresses/batch-error';
import { Type } from '@sinclair/typebox';
import Schema from '../index.js';

const PORT = 2041;

describe('Error Handler', () => {
    let server: ReturnType<express.Application['listen']>;
    const logged: Array<unknown> = [];
    const error = console.error;

    before(async () => {
        console.error = (...args: unknown[]) => { logged.push(args[0]); };

        const app = express();
        const schema = new Schema(express.Router(), { logging: false, limit: 0.001 });
        app.use('/api', schema.router);

        await schema.get('/sync', {}, () => {
            throw new Error('secret connection string');
        });

        await schema.get('/async', {}, async () => {
            throw new Error('secret connection string');
        });

        await schema.get('/public', {}, async () => {
            throw new Err(409, null, 'Already Exists');
        });

        await schema.get('/status', {}, async () => {
            throw Object.assign(new Error('upstream secret'), { status: 404 });
        });

        await schema.get('/string', {}, async () => {
            throw 'secret string';
        });

        await schema.post('/body', {
            body: Type.Object({ name: Type.String() })
        }, async (req, res) => {
            res.json({ name: req.body.name });
        });

        await new Promise<void>((resolve) => { server = app.listen(PORT, () => resolve()); });
    });

    after(() => {
        console.error = error;
        server.close();
    });

    async function request(path: string, init: RequestInit = {}) {
        logged.length = 0;

        const res = await fetch(`http://localhost:${PORT}/api${path}`, init);
        const text = await res.text();

        assert.match(res.headers.get('content-type') || '', /^application\/json/);

        return { status: res.status, body: JSON.parse(text), text };
    }

    for (const path of ['/sync', '/async', '/string']) {
        it(`returns a 500 without the error for ${path}`, async () => {
            const res = await request(path);

            assert.equal(res.status, 500);
            assert.deepEqual(res.body, { status: 500, message: 'Internal Server Error', messages: [] });
            assert.ok(!res.text.includes('secret'));
            assert.equal(logged.length, 1);
        });
    }

    it('keeps the status and message of a thrown batch-error', async () => {
        const res = await request('/public');

        assert.equal(res.status, 409);
        assert.deepEqual(res.body, { status: 409, message: 'Already Exists', messages: [] });
    });

    it('does not trust the status of an error that is not marked as exposable', async () => {
        const res = await request('/status');

        assert.equal(res.status, 500);
        assert.ok(!res.text.includes('secret'));
    });

    it('returns a 400 for a malformed JSON body', async () => {
        const res = await request('/body', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{"name": '
        });

        assert.equal(res.status, 400);
        assert.equal(res.body.status, 400);
        assert.match(res.body.message, /JSON/);
        assert.deepEqual(res.body.messages, []);
        assert.equal(logged.length, 0);
    });

    it('returns a 413 for a body over the limit', async () => {
        const res = await request('/body', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'x'.repeat(5000) })
        });

        assert.equal(res.status, 413);
        assert.deepEqual(res.body, { status: 413, message: 'request entity too large', messages: [] });
    });

    it('still handles a valid request', async () => {
        const res = await request('/body', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'ok' })
        });

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { name: 'ok' });
    });
});
