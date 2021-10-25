<h1 align=center>Batch-Schema</h1>

<p align=center>Express Plugin for JSON Schema based routes</p>

## Installation

```sh
npm add @openaddresses/batch-schema
```

## Usage

```js
const path = require('path');
const express = require('express');
const Schema = require('@openaddresses/batch-schema');

const schema = new Schema({
    router: express.Router(),
    schemas: path.resolve(__dirname, 'schemas')
});

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
}
```

| Config Option | Notes |
| ------------- | ----- |
| `router`      | Express router to bind to |
| `schemas`     | Directory of named schemas |
