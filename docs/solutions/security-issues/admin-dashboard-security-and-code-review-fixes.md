---
title: "Admin Dashboard Code Review — Security, Performance, and Architecture Fixes"
category: security-issues
date: 2026-03-17
tags:
  - timing-side-channel
  - token-authentication
  - csv-injection
  - ip-spoofing
  - field-projection
  - filter-deduplication
  - rate-limiting
  - mongodb-indexes
  - dead-code
  - code-review
modules_affected:
  - lib/adminAuth.js
  - api/admin/applications/[id].js
  - api/admin/applications.js
  - api/admin/export.js
  - lib/admin-filters.js
  - lib/admin-emails.js
  - lib/mongodb.js
  - public/admin.html
  - server.js
severity: critical
problem_type: multi-class-code-review
---

# Admin Dashboard Code Review — Security, Performance, and Architecture Fixes

## Problem Summary

A multi-agent code review of the `feat/admin-dashboard` branch in the CertifyBridge Node.js/Vercel/MongoDB application identified 14 issues spanning security, performance, and architecture quality. The two critical (P1) issues were a timing side-channel in admin token authentication and a missing GET single-application endpoint. Ten of 14 issues were fixed in a single commit; four remain as tracked todos for follow-up.

---

## Fixes Applied

### 1. Security: SHA-256 Pre-Hash Before `timingSafeEqual` (P1)

**Problem:** The original `requireAdmin` passed raw token buffers to `crypto.timingSafeEqual`. If buffer lengths differ, Node.js throws — leaking the token's length to an attacker via timing differences.

**Root cause:** `timingSafeEqual` only neutralises timing within the comparison; the length-mismatch early-exit is a separate side-channel.

**Solution:** Both tokens are SHA-256 hashed first. A SHA-256 digest is always 32 bytes, eliminating the length leak.

```js
// lib/adminAuth.js
const a = crypto.createHash('sha256').update(auth).digest();
const b = crypto.createHash('sha256').update(token).digest();
if (!crypto.timingSafeEqual(a, b)) { ... }
```

### 2. Security: `x-real-ip` Over `x-forwarded-for` (P1)

**Problem:** Rate limiting extracted client IP from `x-forwarded-for[0]`, which is client-controlled. Attackers could bypass rate limiting by prepending arbitrary IPs.

**Root cause:** `x-forwarded-for` is a comma-concatenated chain where the leftmost entry is attacker-supplied.

**Solution:** Use `x-real-ip` (set by Vercel's edge, not spoofable) as primary. Fall back to `x-forwarded-for.pop()` (last/most-trusted entry).

```js
const ip = req.headers['x-real-ip']
  || (req.headers['x-forwarded-for'] || '').split(',').pop().trim()
  || 'unknown';
```

### 3. Security: CSV Formula Injection Defanging (P2)

**Problem:** CSV values starting with `=`, `+`, `-`, `@`, tab, or CR are interpreted as formulas by Excel/LibreOffice Calc. A malicious database value could execute code when the export is opened.

**Root cause:** `csvField()` performed RFC 4180 quoting but did not neutralise formula trigger characters.

**Solution:** Prefix dangerous leading characters with a single quote (string literal marker for spreadsheets).

```js
// api/admin/export.js — csvField()
if (/^[=+\-@\t\r]/.test(str)) {
  str = "'" + str;
}
```

### 4. Architecture: Shared `buildAdminFilter()` Extraction (P2)

**Problem:** Identical ~50-line filter-building logic existed in both `applications.js` and `export.js`. Bug fixes had to be applied twice.

**Solution:** Extracted to `lib/admin-filters.js` exporting `buildAdminFilter(query)`. Both endpoints now import and call it.

```js
// lib/admin-filters.js
export function buildAdminFilter(query) { ... }
```

### 5. API: GET Single Application Endpoint (P1)

**Problem:** `[id].js` only handled PATCH. No way to fetch a single application without listing all.

**Solution:** Added GET branch returning the document (with sensitive field projection) plus `allowedTransitions` from the transition map.

```js
if (req.method === 'GET') {
  const doc = await col.findOne({ _id: new ObjectId(id) }, { projection: PROJECTION });
  const status = doc.adminStatus || 'paid';
  const allowedTransitions = TRANSITIONS[status] || [];
  return res.status(200).json({ application: doc, allowedTransitions });
}
```

### 6. API: PATCH Response Now Returns Updated Fields (P2)

**Problem:** PATCH returned only `{ success: true }`, forcing a follow-up fetch for optimistic UI updates.

**Solution:** Response now includes `application: { _id, adminStatus, statusUpdatedAt }`.

### 7. Bug Fix: `dynQuery` Scoping in `server.js` (P2)

**Problem:** Dynamic route parameters were written to a shared `dynQuery` object during the matching loop. Failed candidates polluted the query used by the winning handler.

**Solution:** Build a fresh `candidateQuery` per iteration; only assign to `dynQuery` on full match.

```js
const candidateQuery = {};
// ...populate per iteration...
if (match) { fn = handlers[handlerName]; dynQuery = candidateQuery; break; }
```

### 8. Performance: Lazy Resend Client Initialization (P2)

**Problem:** `new Resend()` was instantiated on every email send, creating unnecessary HTTP client objects.

**Solution:** Module-level lazy singleton. Also removed unnecessary wrapper lambdas in `EMAIL_SENDERS`.

```js
let _resend;
function getResend() {
  if (!_resend && process.env.RESEND_API_KEY) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}
```

### 9. Database: Sparse Index Fix for MongoDB (P2)

**Problem:** `ensureIndexes` created `razorpayOrderId` unique index without `sparse: true`, conflicting with the production index and causing `IndexOptionsConflict` errors.

**Solution:** Added `sparse: true` to match production.

```js
col.createIndex(
  { razorpayOrderId: 1 },
  { unique: true, sparse: true, name: 'razorpayOrderId_unique' }
),
```

### 10. Code Quality: Dead Code & Legacy Patterns (P3)

- Deleted unused `makeBadge()` function
- Replaced IIFE closure pattern with `let i` in loops
- Extracted `buildFilterParams()` to deduplicate frontend filter logic

---

## Remaining Todos (Not Yet Fixed)

| Todo | Priority | Issue |
|------|----------|-------|
| 082 | P2 | `$regex` search causes full COLLSCAN — needs MongoDB text index |
| 088 | P3 | Schema/config endpoint for agent discoverability |
| 090 | P2 | Rate limiter Map grows unbounded — needs eviction sweep |
| 091 | P3 | No persistent audit log for status changes |

---

## Prevention Strategies

### Timing-Safe Comparisons
- **Rule:** All secret comparisons must use `crypto.timingSafeEqual` with SHA-256 pre-hashing.
- **Automated:** CodeQL query `js/timing-unsafe-comparison`; `eslint-plugin-security` flags direct `===` on secrets.

### IP Header Trust
- **Rule:** Never use `x-forwarded-for` for security decisions on Vercel. Use `x-real-ip`.
- **Automated:** Custom ESLint rule banning raw `req.headers['x-forwarded-for']`; require centralized `getClientIp()` utility.

### DRY Query Logic
- **Rule:** Filter/query logic used in 2+ routes must be extracted to a shared helper.
- **Automated:** `jscpd` duplication detector in CI with `--min-lines 5`.

### CSV Export Safety
- **Rule:** CSV exports must use a field allowlist (never serialize full documents) and sanitize formula triggers.
- **Automated:** Unit test passing `=CMD|'/C calc'!A0` as a field value and asserting sanitization.

### Mutable Shared State
- **Rule:** Never mutate module-level variables inside request handlers. Use local copies.
- **Automated:** ESLint `prefer-const`, `no-param-reassign`, `fp/no-mutation` at error level.

### Client Instantiation
- **Rule:** API clients and DB connections must be lazy singletons, never per-request.
- **Automated:** Performance regression tests measuring p99 latency.

### MongoDB Index Parity
- **Rule:** Index definitions in code must exactly match production. Use migration tools.
- **Automated:** Snapshot test comparing `db.collection.indexes()` against committed fixture.

### Dead Code
- **Rule:** `var` is banned. IIFEs for scope isolation are banned. Unused code must be removed before merge.
- **Automated:** ESLint `no-var`, `no-unused-vars`, `no-unreachable` at error level; Knip for dead exports.

### Tooling Coverage Matrix

| Issue | Static Analysis | Tests | Manual Review |
|-------|----------------|-------|---------------|
| Timing-safe comparison | CodeQL, eslint-plugin-security | Unit test | Low |
| IP header spoofing | Custom ESLint rule | Integration test | Medium |
| Duplicated filter logic | jscpd, SonarQube | Unit test | Low |
| Missing REST endpoints | openapi-validator | Contract test | Medium |
| CSV injection | Custom ESLint rule | Unit test | Medium |
| Mutable shared state | prefer-const, fp/no-mutation | Unit test | Low |
| Per-call instantiation | Custom rule | Load test | Medium |
| Index mismatch | Snapshot test | Schema diff | High |
| Dead code / var | ESLint, Knip | N/A | Low |

**Highest-leverage single action:** Enable ESLint at `error` level with `--max-warnings 0` in CI.

---

## Related Documentation

- **Plan:** `docs/plans/2026-03-16-001-feat-admin-dashboard-plan.md` (completed)
- **Brainstorm:** `docs/brainstorms/2026-03-16-admin-dashboard-brainstorm.md`
- **Parent plan:** `docs/plans/2026-03-15-001-feat-full-project-restructure-backend-plan.md` (active)
- **Commit:** `aea4be2 refactor(admin): code review fixes`
- **Feature commits:** `e8c6aa3` through `d54f86c` (5 commits, feat/admin-dashboard)

---

## Key Takeaway

The highest-impact finding was the timing side-channel in token authentication — a subtle vulnerability where `timingSafeEqual` itself was used correctly, but the length-mismatch guard before it leaked information. The fix (SHA-256 pre-hashing to normalize buffer length) is a pattern worth internalizing for any secret comparison in Node.js.
