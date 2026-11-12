import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import type { Request } from 'express';
import Err from '@openaddresses/batch-error';
import { Type } from '@sinclair/typebox';
import Schema from '../index.js';
import type { SecurityRequirement } from '../index.js';

const PORT = 2021;
const PORT_UNSET = 2022;

type User = { kind: 'user'; name: string; scopes: Array<string> };
type Machine = { kind: 'machine'; id: number };

const calls: Array<{ scheme: string; scopes: Array<string>; method: string; path: string }> = [];

const securitySchemes = {
    userAuth: { type: 'http', scheme: 'bearer' },
    machineAuth: { type: 'apiKey', in: 'header', name: 'x-machine' },
    orphanAuth: { type: 'http', scheme: 'basic' },
    flagAuth: { type: 'apiKey', in: 'header', name: 'x-flag' },
};

const securityHandlers = {
    userAuth: async (req: Request, scopes: Array<string>, route: { method: string; path: string }): Promise<User | null> => {
        calls.push({ scheme: 'userAuth', scopes, ...route });

        const token = req.headers.authorization;
        if (!token) return null;
        if (token === 'explode') throw new Error('Boom');

        const user: User = { kind: 'user', name: 'user', scopes: token.split(',') };
        if (!scopes.every(scope => user.scopes.includes(scope))) throw new Err(403, null, 'Insufficient Scope');

        return user;
    },
    machineAuth: (req: Request, scopes: Array<string>, route: { method: string; path: string }): Machine => {
        calls.push({ scheme: 'machineAuth', scopes, ...route });

        const id = Number(req.headers['x-machine']);
        if (!id) throw new Err(401, null, 'Machine Token Required');

        return { kind: 'machine', id };
    },
    flagAuth: (req: Request): true | false => req.headers['x-flag'] === 'yes',
};

function build() {
    return new Schema(express.Router(), {
        logging: false,
        openapi: {
            components: { securitySchemes },
            security: [{ userAuth: [] }]
        },
        securityHandlers
    });
}

describe('Security Handlers', () => {
    const servers: Array<ReturnType<express.Application['listen']>> = [];
    let handled = 0;

    before(async () => {
        const app = express();
        const schema = build();
        app.use('/api', schema.router);

        await schema.get('/default', {}, async (_req, res) => {
            handled++;

            // Inherited security: every scheme is optional
            const user: User | undefined = res.locals.auth.userAuth;
            const machine: Machine | undefined = res.locals.auth.machineAuth;

            res.json({ user, machine: machine || null });
        });

        await schema.get('/scoped/:id', {
            security: [{ userAuth: ['item:read'] }, { machineAuth: [] }],
            params: Type.Object({ id: Type.Integer() })
        }, async (req, res) => {
            handled++;

            const auth = res.locals.auth;

            // Inline security: a union of the alternatives, narrowed by scheme
            if (auth.userAuth) {
                const name: string = auth.userAuth.name;
                // @ts-expect-error machineAuth is not part of the userAuth alternative
                const machine: Machine = auth.machineAuth;
                res.json({ id: req.params.id, name, machine });
            } else {
                const id: number = auth.machineAuth.id;
                res.json({ id: req.params.id, machine: id });
            }
        });

        await schema.get('/both', {
            security: [{ userAuth: [], machineAuth: [] }]
        }, async (_req, res) => {
            handled++;

            // A single alternative: every scheme is present
            const name: string = res.locals.auth.userAuth.name;
            const id: number = res.locals.auth.machineAuth.id;

            res.json({ name, id });
        });

        await schema.post('/body', {
            body: Type.Object({ name: Type.String() })
        }, async (req, res) => {
            handled++;
            res.json({ name: req.body.name });
        });

        await schema.get('/flag', { security: [{ flagAuth: [] }] }, async (_req, res) => {
            handled++;

            const flag: true = res.locals.auth.flagAuth;

            res.json({ flag });
        });

        await schema.get('/public', { security: [] }, async (_req, res) => {
            handled++;

            // @ts-expect-error a public route has no principals
            const name: string = res.locals.auth.userAuth?.name;

            res.json({ auth: res.locals.auth, name: name || null });
        });

        const widened: Array<SecurityRequirement> = [{ machineAuth: [] }];
        await schema.get('/widened', { security: widened }, async (_req, res) => {
            handled++;

            // A widened array falls back to every scheme as optional
            const machine: Machine | undefined = res.locals.auth.machineAuth;

            res.json({ machine });
        });

        const appUnset = express();
        const schemaUnset = new Schema(express.Router(), { logging: false });
        appUnset.use('/api', schemaUnset.router);

        await schemaUnset.post('/body', {
            body: Type.Object({ name: Type.String() })
        }, async (req, res) => {
            res.json({ name: req.body.name });
        });

        await schemaUnset.get('/scoped', {
            security: [{ undocumentedAuth: ['item:read'] }]
        }, async (_req, res) => {
            res.locals.anything = true;
            res.json({ auth: res.locals.auth === undefined });
        });
        schemaUnset.not_found();

        await new Promise<void>((resolve) => { servers.push(app.listen(PORT, () => resolve())); });
        await new Promise<void>((resolve) => { servers.push(appUnset.listen(PORT_UNSET, () => resolve())); });
    });

    after(() => {
        for (const server of servers) server.close();
    });

    async function get(path: string, headers: Record<string, string> = {}, port = PORT) {
        handled = 0;
        calls.length = 0;

        const res = await fetch(`http://localhost:${port}/api${path}`, { headers });

        return { status: res.status, body: await res.json(), challenge: res.headers.get('www-authenticate') };
    }

    it('applies the document level security to routes without their own', async () => {
        const res = await get('/default');

        assert.equal(res.status, 401);
        assert.equal(res.body.message, 'Authentication Required');
        assert.equal(res.challenge, 'Bearer');
        assert.equal(handled, 0);
        assert.deepEqual(calls, [{ scheme: 'userAuth', scopes: [], method: 'GET', path: '/default' }]);
    });

    it('exposes the principal on res.locals.auth keyed by scheme', async () => {
        const res = await get('/default', { authorization: 'a,b' });

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { user: { kind: 'user', name: 'user', scopes: ['a', 'b'] }, machine: null });
    });

    it('passes the scopes of the route level security to the handler', async () => {
        const res = await get('/scoped/1', { authorization: 'item:read' });

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { id: 1, name: 'user' });
        assert.deepEqual(calls, [{ scheme: 'userAuth', scopes: ['item:read'], method: 'GET', path: '/scoped/:id' }]);
    });

    it('falls through to the next alternative', async () => {
        const res = await get('/scoped/1', { 'x-machine': '7' });

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { id: 1, machine: 7 });
        assert.deepEqual(calls.map(c => c.scheme), ['userAuth', 'machineAuth']);
    });

    it('prefers a 403 over a 401 when no alternative is satisfied', async () => {
        const res = await get('/scoped/1', { authorization: 'other' });

        assert.equal(res.status, 403);
        assert.equal(res.body.message, 'Insufficient Scope');
        assert.equal(res.challenge, null);
        assert.equal(handled, 0);
    });

    it('returns the first 401 when nothing identified the caller', async () => {
        const res = await get('/scoped/1');

        assert.equal(res.status, 401);
        assert.equal(res.body.message, 'Authentication Required');
        assert.equal(res.challenge, 'Bearer');
    });

    it('requires every scheme of a requirement', async () => {
        const partial = await get('/both', { authorization: 'a' });
        assert.equal(partial.status, 401);
        assert.equal(partial.body.message, 'Machine Token Required');
        assert.equal(handled, 0);

        const both = await get('/both', { authorization: 'a', 'x-machine': '3' });
        assert.equal(both.status, 200);
        assert.deepEqual(both.body, { name: 'user', id: 3 });
    });

    it('rejects before validation', async () => {
        const unauthorized = await get('/scoped/not-a-number');
        assert.equal(unauthorized.status, 401);

        const invalid = await get('/scoped/not-a-number', { authorization: 'item:read' });
        assert.equal(invalid.status, 400);
    });

    it('treats a handler returning false as not satisfied', async () => {
        const denied = await get('/flag', { 'x-flag': 'no' });
        assert.equal(denied.status, 401);
        assert.equal(handled, 0);

        const allowed = await get('/flag', { 'x-flag': 'yes' });
        assert.equal(allowed.status, 200);
        assert.deepEqual(allowed.body, { flag: true });
    });

    async function post(path: string, body: string, headers: Record<string, string> = {}, port = PORT) {
        handled = 0;

        const res = await fetch(`http://localhost:${port}/api${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...headers },
            body
        });

        return { status: res.status, text: await res.text() };
    }

    it('does not parse the body of an unauthorized request', async () => {
        const res = await post('/body', '{"name": ');

        assert.equal(res.status, 401);
        assert.equal(JSON.parse(res.text).message, 'Authentication Required');
    });

    it('parses the body once the request is authorized', async () => {
        const malformed = await post('/body', '{"name": ', { authorization: 'a' });
        assert.equal(malformed.status, 400);
        assert.equal(handled, 0);

        const res = await post('/body', '{"name": "parsed"}', { authorization: 'a' });
        assert.equal(res.status, 200);
        assert.deepEqual(JSON.parse(res.text), { name: 'parsed' });
    });

    it('still parses bodies when no handlers are set', async () => {
        const res = await post('/body', '{"name": "parsed"}', {}, PORT_UNSET);

        assert.equal(res.status, 200);
        assert.deepEqual(JSON.parse(res.text), { name: 'parsed' });
    });

    it('does not parse the body of a request to an unknown path', async () => {
        const res = await post('/unknown', '{"name": ', {}, PORT_UNSET);

        assert.equal(res.status, 404);
    });

    it('does not call handlers for public routes', async () => {
        const res = await get('/public');

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { auth: {}, name: null });
        assert.equal(calls.length, 0);
    });

    it('enforces a widened security array', async () => {
        assert.equal((await get('/widened')).status, 401);

        const res = await get('/widened', { 'x-machine': '9' });
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { machine: { kind: 'machine', id: 9 } });
    });

    it('fails the request when a handler throws an unknown error', async () => {
        const res = await get('/scoped/1', { authorization: 'explode', 'x-machine': '7' });

        assert.equal(res.status, 500);
        assert.equal(res.body.message, 'Internal Server Error');
        assert.equal(handled, 0);
        assert.deepEqual(calls.map(c => c.scheme), ['userAuth']);
    });

    it('leaves security as documentation when no handlers are set', async () => {
        const res = await get('/scoped', {}, PORT_UNSET);

        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { auth: true });
    });
});

describe('Security Handlers - registration', () => {
    it('rejects a route naming an undocumented scheme', async () => {
        await assert.rejects(build().get('/typo', {
            security: [{ userAuht: [] }]
        }, async (_req, res) => { res.json({}); }), /Get: \/typo: Error: GET \/typo references unknown security scheme: userAuht/);
    });

    it('rejects a route naming a scheme without a handler', async () => {
        await assert.rejects(build().get('/orphan', {
            security: [{ orphanAuth: [] }]
        }, async (_req, res) => { res.json({}); }), /references security scheme without a handler: orphanAuth/);
    });

    it('rejects an empty Security Requirement', async () => {
        await assert.rejects(build().get('/empty', {
            security: [{}]
        }, async (_req, res) => { res.json({}); }), /has an empty Security Requirement/);
    });

    it('rejects a route with no security when there is no document level default', async () => {
        const schema = new Schema(express.Router(), {
            logging: false,
            openapi: { components: { securitySchemes } },
            securityHandlers
        });

        await assert.rejects(schema.get('/undeclared', {}, async (_req, res) => {
            res.json({});
        }), /must declare security when securityHandlers are set/);

        await schema.get('/declared', { security: [] }, async (_req, res) => { res.json({}); });
    });

    it('rejects a document level security naming an unknown scheme', () => {
        assert.throws(() => new Schema(express.Router(), {
            logging: false,
            openapi: {
                components: { securitySchemes },
                security: [{ missingAuth: [] }]
            },
            securityHandlers
        }), /Document level security references unknown security scheme: missingAuth/);
    });
});
