# Admin Dashboard — Brainstorm

**Date:** 2026-03-16
**Status:** Draft
**Feature:** Operator dashboard for viewing, managing, and exporting internship applications

---

## What We're Building

A password-protected web dashboard at `/admin` that lets the CertifyBridge team (2–5 people) view all paid internship applications, update their status through a defined workflow, export data as CSV, and trigger transactional emails automatically when statuses change.

The dashboard is an internal operator tool — not user-facing. It does not require a separate framework or deployment; it lives as a static HTML page served by Vercel alongside the existing `apply.html`.

---

## Why This Approach

The existing stack is vanilla HTML/CSS/JS + Vercel serverless API routes + MongoDB. Introducing a framework (Next.js, React admin, Retool) would create a two-tier deployment problem and violate the project's no-framework principle.

The right approach is consistent with how `apply.html` is built:

- **`public/admin.html`** — vanilla JS single-page dashboard, consistent with existing design system (Inter + Space Mono, `#080808`, corner brackets)
- **`api/admin/`** — protected Vercel serverless routes, all sharing a single `requireAdmin` middleware that checks `Authorization: Bearer <ADMIN_TOKEN>`
- **MongoDB** — add an `adminStatus` field to `applications` documents; no new collection needed

---

## Key Decisions

### 1. Authentication
**Chosen:** Single shared `ADMIN_TOKEN` env var, checked via `Authorization: Bearer` header on every `api/admin/*` request.

- No login UI needed — dashboard page itself is public HTML, but all data APIs require the token
- Practical for a team of 2–5 sharing one credential
- Zero DB overhead — no admin user collection

**Trade-off accepted:** If the token leaks, everyone's access is revoked by rotating one env var. For this team size this is acceptable.

### 2. Application Status Workflow
**Chosen:** Linear workflow with one branch:

```
paid → under_review → approved → certificate_issued
                   ↘ rejected
```

Status values stored in MongoDB as snake_case strings. Displayed in the UI with readable labels and colour-coded badges.

### 3. Email Automation
**Chosen:** Status-change emails via Resend (already configured) triggered server-side on status update.

| Transition | Email sent |
|---|---|
| → `approved` | Welcome / onboarding email with resources link |
| → `rejected` | Rejection email with optional admin-provided reason |
| → `certificate_issued` | Certificate notification email |
| → `under_review` | No email (internal state) |

Templates stored in `lib/admin-emails.js` alongside existing `sendConfirmationEmail`.

### 4. Export
**Chosen:** `GET /api/admin/export?format=csv` — server-side CSV generation, downloaded directly by the browser. No client-side CSV library needed.

Fields exported: all application fields in deterministic column order. UTF-8 BOM included for Excel compatibility.

### 5. New API Surface

| Route | Method | Purpose |
|---|---|---|
| `/api/admin/applications` | GET | Paginated list with filter params (plan, status, date range, search) |
| `/api/admin/applications/[id]` | PATCH | Update status (+ optional reason for rejection) |
| `/api/admin/export` | GET | Stream CSV of all matching applications |

All routes share a `lib/adminAuth.js` middleware (single function, ~10 lines).

---

## UI Layout (Sketch)

```
┌──────────────────────────────────────────────────┐
│  // certifyBridge  [admin]              [Export ↓]│
├──────────────────────────────────────────────────┤
│  Filters: [All plans ▼] [All statuses ▼] [Search]│
├──────────────────────────────────────────────────┤
│  NAME          PLAN    STATUS         DATE    [→] │
│  Arjun Sharma  Hacker  ● approved     03/14       │
│  Priya Nair    Pro     ○ under_review 03/15       │
│  ...                                              │
├──────────────────────────────────────────────────┤
│  [< Prev]  Page 1 of 12  [Next >]                │
└──────────────────────────────────────────────────┘
```

Clicking a row opens a slide-out detail panel with full application data and a status dropdown + optional reason textarea + "Update" button.

---

## Approaches Considered

### Option A: Vanilla HTML page + new `api/admin/` routes (Recommended ✓)
Consistent with existing architecture. No new dependencies. Design system reuse. Ships fast.

### Option B: Separate React admin app (e.g. react-admin, AdminJS)
Full-featured out of the box but requires a separate build pipeline, adds ~500 KB to bundle, breaks the no-framework principle. Overkill for 2–5 operators.

### Option C: External tool (Retool, Appsmith, Metabase)
No code, fast to set up, but requires a third-party service with access to your MongoDB. Introduces an external dependency for internal operations.

**Recommendation:** Option A. Matches the stack, ships quickly, fully self-contained.

---

## Open Questions

None — all resolved through dialogue.

---

## Resolved Questions

| Question | Decision |
|---|---|
| Who uses it? | Small team, 2–5 people |
| Auth method | Single shared `ADMIN_TOKEN` env var |
| Core actions | View + search + status management + CSV export |
| Status states | `paid → under_review → approved → certificate_issued` (+ `rejected`) |
| Email automation | Yes — approval, rejection (with reason), certificate issuance |

---

## Scope (What's NOT Included)

- Role-based access control (all team members have full access)
- Inline email editing (templates are code-defined)
- Analytics charts / revenue graphs (plain table is sufficient for v1)
- Bulk status updates (single-record updates only for v1)
- Application deletion (data is kept; soft-delete can come later)
