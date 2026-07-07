import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { Type } from '@sinclair/typebox';
import Schema from '../index.js';

const app = express();
const schema = new Schema(express.Router(), { logging: false });

app.use('/api', schema.router);

let server: ReturnType<typeof app.listen>;

const stripped = { ok: true, secret: 'do-not-send' };

describe('Response Validation', () => {
    before((_, done) => {
        server = app.listen(2001, async () => {
            await schema.get('/date-res', {
                res: Type.Object({
                    when: Type.String()
                })
            }, async (_req, res) => {
                res.json({ when: new Date(0) as unknown as string });
            });

            await schema.get('/strip-res', {
                res: Type.Object({
                    ok: Type.Boolean()
                })
            }, async (_req, res) => {
                res.json(stripped);
            });

            await schema.get('/bad-res', {
                res: Type.Object({
                    ok: Type.Boolean()
                })
            }, async (_req, res) => {
                res.json({ wrong: 1 } as unknown as { ok: boolean });
            });

            await schema.get('/created-res', {
                res: Type.Object({
                    ok: Type.Boolean()
                })
            }, async (_req, res) => {
                res.status(201).json({ anything: 'goes', when: new Date(0) } as unknown as { ok: boolean });
            });

            await schema.get('/any-res', {
                res: Type.Any()
            }, async (_req, res) => {
                res.json({ when: new Date(0), extra: 'kept' });
            });

            done();
        });
    });

    after(() => {
        server.close();
    });

    it('GET: /date-res serializes Dates before validation', async () => {
        const res = await fetch('http://localhost:2001/api/date-res');
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { when: '1970-01-01T00:00:00.000Z' });
    });

    it('GET: /strip-res removes additional properties without mutating the handler object', async () => {
        const res = await fetch('http://localhost:2001/api/strip-res');
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), { ok: true });
        assert.deepStrictEqual(stripped, { ok: true, secret: 'do-not-send' });
    });

    it('GET: /bad-res returns a Response validation error', async () => {
        const res = await fetch('http://localhost:2001/api/bad-res');
        assert.strictEqual(res.status, 400);
        const body = await res.json();
        assert.strictEqual(body.type, 'Response');
        assert.ok(Array.isArray(body.errors));
    });

    it('GET: /created-res skips response validation on non-200 status', async () => {
        const res = await fetch('http://localhost:2001/api/created-res');
        assert.strictEqual(res.status, 201);
        assert.deepStrictEqual(await res.json(), {
            anything: 'goes',
            when: '1970-01-01T00:00:00.000Z'
        });
    });

    it('GET: /any-res passes Type.Any responses through untouched', async () => {
        const res = await fetch('http://localhost:2001/api/any-res');
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), {
            when: '1970-01-01T00:00:00.000Z',
            extra: 'kept'
        });
    });

    it('GET: rejects body validation at registration', async () => {
        await assert.rejects(
            schema.get('/no-body-allowed', {
                body: Type.Object({ nope: Type.Boolean() })
            }, async (_req, res) => {
                res.json({});
            }),
            /Get: \/no-body-allowed: Error: Body not allowed/
        );
    });
});
