<h1 align=center>Batch-Schema</h1>

<p align=center>Express Plugin for JSON Schema based routes</p>

## Installation

```sh
yarn add @openaddresses/batch-schema
```

or

```sh
npm i @openaddresses/batch-schema
```

## Example Usage

```js
const path = require('path');
const express = require('express');
const { Schema } = require('@openaddresses/batch-schema');

const app = express();
const schema = new Schema(express.Router(), {
    schemas: path.resolve(__dirname, 'schemas')
});

app.use('/api', schema.router);

server();

async function server() {
    await schema.post('/api/:param1/:param2', {
        ':param1': 'integer',
        ':param2': 'string',
        query: 'query-json-schema.json',
        body: 'body-json-schema.json',
        res: 'result-body-json-schema.json'
    }, (req, res) => {
        return res.json({
            note: 'I only return if the request meets the query & body schemas'
        });
    });

    // Handle Validation Errors => JSON Middleware
    schema.error();
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

### schema.error

Adds a middlware which will convert validation errors into a standard JSON error format.
This method should be called after all routes are defined. If this method is not called,
you must provide your own middleware for converting JSON Schema Validation Errors into
express compatible responses.

```
schema.error()
```
