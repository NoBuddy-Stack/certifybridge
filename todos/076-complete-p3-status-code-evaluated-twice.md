---
status: pending
priority: p3
issue_id: "076"
tags: [code-review, dx, dead-code]
dependencies: []
---

# 076 · statusCode || 500 evaluated twice in create-order.js error handler

## Problem Statement

api/create-order.js:70: `const statusCode = err.statusCode || 500;` then line 73: `res.status(statusCode || 500)`. The second `|| 500` is dead code — statusCode is already guaranteed non-falsy after line 70. This signals to future readers that the variable might be falsy, causing unnecessary defensive concern.

## Findings

- create-order.js:70 assigns `const statusCode = err.statusCode || 500` — result is always a truthy number
- create-order.js:73 uses `res.status(statusCode || 500)` — the `|| 500` branch can never be reached
- Dead code in error handling paths creates false doubt about the invariants of the surrounding code
- Future maintainers may cargo-cult the pattern, spreading the redundancy further

## Proposed Solutions

Remove the redundant `|| 500` from line 73:

```js
return res.status(statusCode).json({ error: message });
```

## Acceptance Criteria

- Line 73 of create-order.js uses `statusCode` directly without the `|| 500` fallback
- No functional behaviour change
