# CHANGELOG

## Emoji Cheatsheet
- :pencil2: doc updates
- :bug: when fixing a bug
- :rocket: when making general improvements
- :white_check_mark: when adding tests
- :arrow_up: when upgrading dependencies
- :tada: when adding new features

## Version History

### v10.8.1

- :rocket: Add back Type.Any() for api.js

### v10.8.0

- :rocket: Ignore `Type.Any` or `Type.Unknown`

### v10.7.1

- :data: Don't validate API response body

### v10.7.0

- :data: Enfoce `res.json` with AJV

### v10.6.0

- :bug: Properties that are not defined in the Schema are always removed

### v10.5.0

- :bug: Switch to AJV for ability to cast

### v10.4.0

- :bug: Fix router verbs

### v10.3.0

- :rocket: Add Response Body Type

### v10.2.0

- :rocket: Remove skipLibCheck for further TS checking
- :rocket: Add a couple internal types that threw from calling lib

### v10.1.0

- :rocket: Add types to blueprint and take direct function

### v10.0.2

- :bug: Differentiate `main` and `types` in package.json

### v10.0.1

- :bug: Include dist files in npm bundle

### v10.0.0

- :rocket: Very rough support for Typescript based routes

### v9.4.0

- :rocket: Add support for `private` key which will hide endpoint in swagger

### v9.3.0

- :rocket: Coerce types on output

### v9.2.0

- :rocket: Use Defaults in response middleware

### v9.1.0

- :rocket: Only attempt to load js and ts files

### v9.0.0

- :rocket: Only JSON parse body if `body` of JSON Schema is set. If body is not set it is up to the caller to parse the body

### v8.1.1

- :bug: Fix loads call & add `Promise` to ESLint

### v8.1.0

- :rocket: Load imports faster by using an async call

### v8.0.0

- :data: Remove APIDoc support in favour of OpenAPI Route

### v7.6.1

- :bug: Explicit AJV strict: false

### v7.6.0

- :tada: Update Core Deps

### v7.5.0

- :tada: Add support for inline JSON Schemas

### v7.4.0

- :tada: Add experimental `blueprint()` function

### v7.3.0

- :arrow_up: `res.json` will automatically serialize Generic objects

### v7.2.0

- :tada: Preliminary support for automatically generated an APIDoc definitions file

### v7.1.0

- :bug: Only validate response on 200 status

### v7.0.0

- :rocket: Remove PublicError class to it's own package
- :rocket: `Schema` is now exposed as the default

### v6.0.0

- :rocket: Remove additional properties if they are not present in `res` and `additionalProperties: false` is set

### v5.1.0

- :rocket: Support `URL` in `Schema.load`

### v5.0.0

- :tada: Logging and body parsing enabled by default

### v4.4.0

- :rocket: Add ability to take a `URL` as a schemas directory

### v4.3.0

- :arrow_up: Update base deps
- :tada: Support casting query param arrays into `integer`, `number`, or `boolean`

### v4.2.0

- :arrow_up: Update base deps
- :tada: Add `load()` function for loading routes dir

### v4.1.0

- :bug: Ensure `default: false` is still applied
- :arrow_up: Update base deps

### v4.0.0

- :white_check_mark: Update schema validator to latest version (AJV 8)
- :rocket: Remove `got` in favour of `fetch`

### v3.1.3

- :rocket: Add automated releases

### v3.1.2

- :bug: Internal schema path

### v3.1.1

- :bug: Internal schema path

### v3.0.1

- :rocket: Add `.main` property to package.json

### v3.0.0

- :rocket: Update to ES Module System

### v2.4.0

- :tada: Add `schema.not_found()`

### v2.3.4

- :arrow_up: Update base deps

### v2.3.3

- :rocket: Name exports explicitly instead of returning object for ES module compat.

### v2.3.2

- :bug: Fix a status code error handling bug which would crash express
- :arrow_Up: Update Base Deps

### v2.3.1

- :arrow_up: Update Base Deps

### v2.3.0

- :rocket: Remove babel in favour of ESLint's new ECMA13 support

### v2.2.0

- :tada: Add support for errors with `status` set from external libraries (IE OpenAddresses/tilebase)

### v2.1.0

- :tada: Add more detailed schema error messages

### v2.0.0

- :tada: Add support for populating `default` keys in schema
- :arrow_up: General Dep Update

### v1.0.1

- :bug: Check for schema in library before looking for schema in calling project

### v1.0.0

- :rocket: Intial Release

