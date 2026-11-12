import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import Schema from '../index.js';

type Logging = Exclude<NonNullable<ConstructorParameters<typeof Schema>[1]>['logging'], boolean | undefined>;

function build(logging: Logging, lines: string[]) {
    const app = express();
    const stream = { write: (line: string) => { lines.push(line.trim()); } };
    const schema = new Schema(express.Router(), {
        logging: { ...logging, stream }
    });

    app.use('/api', schema.router);

    return { app, schema };
}

describe('Logging', () => {
    const servers: Array<ReturnType<express.Application['listen']>> = [];

    const combined: string[] = [];
    const custom: string[] = [];
    const fn: string[] = [];

    before(async () => {
        const cases = [
            { port: 2011, ...build({}, combined) },
            { port: 2012, ...build({ format: ':method :url :status "custom"' }, custom) },
            { port: 2013, ...build({ format: (tokens, req, res) => `fn ${tokens.method(req, res)} ${tokens.status(req, res)}` }, fn) }
        ];

        for (const c of cases) {
            await c.schema.get('/ping', {}, async (_req, res) => {
                res.json({ ok: true });
            });

            await new Promise<void>((resolve) => {
                servers.push(c.app.listen(c.port, () => resolve()));
            });
        }
    });

    after(() => {
        for (const server of servers) server.close();
    });

    it('defaults to the combined format', async () => {
        await (await fetch('http://localhost:2011/api/ping')).json();
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(combined.length, 1);
        assert.match(combined[0], /^\S+ - - \[.*\] "GET \/api\/ping HTTP\/1\.1" 200 \d+ "-" ".*"$/);
    });

    it('accepts a format string', async () => {
        await (await fetch('http://localhost:2012/api/ping')).json();
        await new Promise((resolve) => setImmediate(resolve));

        assert.deepEqual(custom, ['GET /api/ping 200 "custom"']);
    });

    it('accepts a format function', async () => {
        await (await fetch('http://localhost:2013/api/ping')).json();
        await new Promise((resolve) => setImmediate(resolve));

        assert.deepEqual(fn, ['fn GET 200']);
    });
});
