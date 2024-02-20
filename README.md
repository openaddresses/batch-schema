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
    logging: true,  // Enable Morgan Logging
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
    }, (req, res) => {
        return res.json({
            token: 'I only return if the request meets the query & body schemas'
        });
    });
}
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
