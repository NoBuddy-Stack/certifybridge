---
status: pending
priority: p3
issue_id: "073"
tags: [code-review, config, dx]
dependencies: []
---

# 073 · server.js rolls a custom 12-line .env parser that mishandles quoted values

## Problem Statement

server.js:16-27 manually parses .env line by line. The custom parser does not handle quoted values (KEY="value with spaces"), multi-line values, or inline comments. These are edge cases that dotenv handles correctly. If a MongoDB URI or email address contains special characters requiring quoting, the custom parser silently produces a wrong value with no error.

## Findings

- server.js:16-27 contains a bespoke line-by-line .env parser
- The parser does not handle quoted values: `KEY="value with spaces"` would include the quote characters
- Inline comments (`KEY=value # comment`) are not stripped
- Multi-line values (e.g. PEM keys) are not supported
- Silent incorrect parsing — no error is thrown when a value is malformed
- dotenv (npm) or Node 20.6+ native --env-file flag both handle all these cases correctly

## Proposed Solutions

Option A (Node 20.6+): Update the start script in package.json:
```
"start": "node --env-file=.env server.js"
```
Remove the 12-line manual parser block from server.js.

Option B (Node 18 compatible): Add dotenv as a dependency and replace the block with:
```js
import 'dotenv/config';
```
as line 1 of server.js (1 line replaces 12).

## Acceptance Criteria

- .env values with spaces, equals signs, and inline quotes are parsed correctly
- The 12-line manual parser block is removed from server.js
