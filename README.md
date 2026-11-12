<h1 align=center>Batch-Schema</h1>

<p align=center>Express Plugin for <a href='https://github.com/sinclairzx81/typebox'>TypeBox</a> Request and Response Validation</p>

## Installation

```sh
npm i @openaddresses/batch-schema
```

## Example Usage

```js
import express from 'express';
import Schema from '@openaddresses/batch-schema';
import { Type } from '@sinclair/typebox';

const app = express();
const schema = new Schema(express.Router(), {
    logging: true,  // Enable Morgan Logging - or pass morgan options, including a custom `format`
    limit: 50       // Body size for parsing JSON
});

app.use('/api', schema.router);

server();

async function server() {
    await schema.post('/api/:param1/:param2', {
        query: Type.Object({
            example: Type.Optional(Type.Uppercase(Type.String()))
        }),
        params: Type.Object({
            param1: Type.String(),
            param2: Type.Number(),
        }),
        body: Type.Object({
            username: Type.String(),
            password: Type.String(),
        }),
        res: Type.Object({
            token: Type.String()
        }),
        deprecated: false,
    }, (req, res) => {
        return res.json({
            token: 'I only return if the request meets the query & body schemas'
        });
    });
}
```

Set `deprecated: true` on a route schema to mark the generated OpenAPI operation as deprecated.

Set `security` on a route schema to emit an operation level OpenAPI Security Requirement
array, overriding any document level `security` passed via `new Schema(router, { openapi })`.
Keys must reference `components.securitySchemes` and each entry is an alternative:

```js
await schema.get('/search', {
    security: [
        { bearerAuth: [] },
        { layerAuth: ['search:read'] },
    ],
    res: Type.Any(),
}, (req, res) => res.json({}));
```

### Enforcing `security`

By default `security` is documentation only. Pass `securityHandlers` - one per scheme in
`components.securitySchemes` - to enforce it. Before a request is validated, the route's
Security Requirements (its own `security`, or else the document level one) are evaluated
in order: a requirement is satisfied when every scheme it names is satisfied, and the first
satisfied requirement wins.

A handler receives the request and the scopes the requirement lists for its scheme. It
returns the authenticated principal to satisfy the scheme, or returns `null` / `false` /
throws a 401 or 403 [batch-error](https://github.com/openaddresses/batch-error) when it is not
satisfied. Any other thrown error fails the request. Handlers run before the request body
is parsed and before `req.params` & `req.query` are validated or coerced, so `req.body` is
not available to them.

```js
const schema = new Schema(express.Router(), {
    openapi: {
        components: {
            securitySchemes: {
                userAuth: { type: 'http', scheme: 'bearer' },
                machineAuth: { type: 'apiKey', in: 'header', name: 'x-machine' },
            }
        },
        security: [{ userAuth: [] }]
    },
    securityHandlers: {
        userAuth: async (req, scopes) => {
            const user = await authenticate(req.headers.authorization);
            if (!user) return null;

            if (!scopes.every(scope => user.scopes.includes(scope))) {
                throw new Err(403, null, 'Insufficient Scope');
            }

            return user;
        },
        machineAuth: async (req) => {
            return await machine(req.headers['x-machine']);
        },
    }
});

// Inherits the document level security
await schema.get('/profile', {}, (req, res) => {
    res.json(res.locals.auth.userAuth);
});

// Either a user holding the scope or a machine
await schema.get('/item', {
    security: [{ userAuth: ['item:read'] }, { machineAuth: [] }]
}, (req, res) => {
    if (res.locals.auth.userAuth) {
        res.json({ user: res.locals.auth.userAuth.name });
    } else {
        res.json({ machine: res.locals.auth.machineAuth.id });
    }
});

// Public
await schema.get('/status', { security: [] }, (req, res) => res.json({}));
```

The principals of the satisfied requirement are set on `res.locals.auth`, keyed by scheme
and typed from the handlers' return types. A route whose `security` is written inline gets
a union of its alternatives, so checking one scheme narrows the others. A route that
inherits the document level security, or is passed an array typed as
`Array<SecurityRequirement>`, gets every scheme as optional.

When nothing is satisfied the response is the first 403 raised, or else the first 401 - a
401 carries a `WWW-Authenticate` header naming the route's `http` schemes.

With `securityHandlers` set, routes are checked as they are registered and the following
throw:

- a `security` naming a scheme missing from `components.securitySchemes`
- a `security` naming a scheme that has no handler
- an empty Security Requirement (`[{}]`) - use `[]` for a public route
- a route with no `security` when there is no document level `security`

## Errors

Anything a route handler throws - or rejects with - and any body parser failure is returned
in the [batch-error](https://github.com/openaddresses/batch-error) JSON shape:

```json
{ "status": 400, "message": "Unexpected end of JSON input", "messages": [] }
```

A thrown batch-error keeps its status and message, as does a 4xx error a body parser marks
as safe to expose (malformed JSON, a body over `limit`). Everything else is logged and
returned as a 500 `Internal Server Error` without its message or stack.

## Request Body Validation

The `body` option accepts two forms.

### Single TypeBox schema (legacy / shorthand)

A bare schema is treated as `application/json`:

```js
await schema.post('/login', {
    body: Type.Object({
        username: Type.String(),
        password: Type.String()
    }),
    res: Type.Object({ token: Type.String() })
}, handler);
```

### Map keyed by content-type

Provide a record where each key is a Content-Type. The value can be:

- a `TSchema` — body is validated against the schema
- `true` — body is accepted but not validated (useful for XML / CSV / binary)
- a `{ schema, example, examples }` object — `example` and `examples` are
  forwarded to the OpenAPI media type for documentation

Wildcards are supported in keys: `text/*`, `application/*`, `*/*`. An exact
content-type match always wins over a wildcard.

```js
await schema.post('/ingest', {
    body: {
        // Strict JSON validation
        'application/json': Type.Object({ name: Type.String() }),

        // Any XML accepted
        'text/xml': true,

        // Wildcard family — matches text/csv, text/plain, etc.
        'text/*': true,

        // Schema + Swagger UI examples
        'application/vnd.api+json': {
            schema: Type.Object({ data: Type.Any() }),
            example: { data: { id: '1' } },
            examples: {
                primary:   { summary: 'Primary',   value: { data: { id: '1' } } },
                secondary: { summary: 'Secondary', value: { data: { id: '2' } } }
            }
        }
    },
    res: Type.Any()
}, handler);
```

If a request arrives with a Content-Type that is not listed (and is not
covered by a wildcard), the route responds with HTTP 400 and a
`Content-Type ... not supported` message — the handler is not invoked.

For non-JSON content-types the body parser exposes the raw payload on
`req.body` as a string (`text/*`, `application/xml`, `application/*+xml`)
or a `Buffer` (`application/octet-stream`).

### Optional bodies

Set `bodyRequired: false` to allow requests with no body / no Content-Type.
When a body *is* sent it is still validated against the matching schema,
and the OpenAPI document marks `requestBody.required` as `false`.

```js
await schema.post('/maybe', {
    body: Type.Object({ note: Type.String() }),
    bodyRequired: false,
    res: Type.Object({ ok: Type.Boolean() })
}, handler);
```

## API

```js
const schema = new Schema(<router>, <opts>);

```

| Config Option     | Notes |
| ----------------- | ----- |
| `router`          | Instantiated Express router to bind to |
| `opts`            | Optional Opts Object |
| `opts.schemas`    | Directory of named schemas |


### schema.api

```
await schema.api()
```

Adds a route called `GET /schema` which allows the caller to get a list of endpoints that the router manages
as well as full schema details for every route. If your API is public we recommend enabling this feature, however
if you do not wish for API routes to be published, this feature is disabled unless called.

Adds a route called `GET /openapi` which returns an OpenAPI / Swagger JSON Object

### schema.not_found

Adds a middlware which will catch all routes that have not been defined and return
a standard error object.

```
schema.not_found()
```

### schema.error

Adds a middlware which will convert validation errors into a standard JSON error format.
This method should be called after all routes are defined. If this method is not called,
you must provide your own middleware for converting JSON Schema Validation Errors into
express compatible responses.

```
schema.error()
```

### schema.load

Loads and runs all routes files in a directory

```
schema.load(directory, config, opts)
```

| Config Option     | Notes |
| ----------------- | ----- |
| `directory`       | Directory to load .js files from |
| `config`          | Config option to pass to each route |
| `opts`            | Optional Opts Object |
| `opts.silent`     | Squelch output |
