# CHANGELOG

## Emoji Cheatsheet
- :pencil2: doc updates
- :bug: when fixing a bug
- :rocket: when making general improvements
- :white_check_mark: when adding tests
- :arrow_up: when upgrading dependencies
- :tada: when adding new features

## Version History

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

