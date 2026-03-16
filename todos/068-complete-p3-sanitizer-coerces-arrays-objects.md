---
status: pending
priority: p3
issue_id: "068"
tags: [code-review, validation, security]
dependencies: []
---

# 068 · s() sanitizer silently coerces arrays and objects to unexpected strings

## Problem Statement

verify-payment.js:104: `const s = (v, max = 200) => String(v || '').replace(...)`. String([1,2,3]) produces "1,2,3". String({}) produces "[object Object]". A client sending `firstName: ["Alice","Bob"]` stores "Alice,Bob" with no error. This masks malformed payloads, produces confusing records, and could indicate an injection attempt.

## Findings

- The s() sanitizer uses String(v) which coerces any type to a string
- Arrays become comma-joined strings: `["Alice","Bob"]` → `"Alice,Bob"`
- Objects become the literal string `"[object Object]"`
- No error is thrown; malformed payloads are silently accepted and stored
- Downstream required-field checks cannot distinguish a real value from a coerced non-string

## Proposed Solutions

Add a type guard at the start of s():

```js
const s = (v, max = 200) => {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
};
```

## Acceptance Criteria

- Array or object values for string fields return '' after sanitization
- Malformed payloads produce empty fields that fail required-field checks downstream
