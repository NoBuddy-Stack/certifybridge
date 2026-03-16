---
status: pending
priority: p1
issue_id: "021"
tags: [code-review, security]
dependencies: []
---

# 021 · Credentials potentially exposed in git history

## Problem Statement

The security review flagged a live `.env` file containing Razorpay, MongoDB, and Resend credentials. If these were ever committed to the repository (even once), they exist permanently in git history. The credentials should be treated as compromised and rotated immediately.

**Why it matters:** Git history is public on any public repo. Even on private repos, anyone with historical read access retains the credentials. Rotating without scrubbing history still leaves the old keys embedded.

## Findings

- `.env` file present in the working directory with live production credentials
- No evidence of `.gitignore` entry that definitively excludes it (needs verification)
- Even if currently ignored, a single past `git add .` without proper ignore rules would have captured it
- Affected keys: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `MONGODB_URI`, `RESEND_API_KEY`

**Location:** `.env` (root), `api/*.js` (env var consumers)

## Proposed Solutions

### Option A: Audit + Rotate (Minimum required — Low effort)
1. Run `git log --all --full-history -- .env` to check if `.env` was ever tracked
2. Run `git grep -i "key_secret\|mongodb+srv\|re_" $(git log --all --format="%H")` to scan all commits
3. Rotate ALL credentials immediately regardless of findings (assume compromised)
4. Verify `.env` is in `.gitignore`

**Pros:** Fast, resolves immediate risk
**Cons:** Doesn't scrub history

### Option B: Audit + Rotate + History Scrub (Recommended)
1. All steps in Option A
2. Use `git filter-repo --path .env --invert-paths` to scrub history
3. Force-push all branches (coordinate with team)
4. Revoke old credentials after new ones are live

**Pros:** Complete remediation
**Cons:** Rewrites history, requires team coordination

**Effort:** Small (Option A) / Medium (Option B)
**Risk:** CRITICAL if deferred

## Recommended Action

_(leave blank — fill during triage)_

## Technical Details

- **Affected files:** `.env`, `.gitignore`
- **Credentials at risk:** Razorpay key/secret, MongoDB connection string, Resend API key

## Acceptance Criteria

- [ ] `git log --all -- .env` returns no commits with credentials
- [ ] All affected credentials rotated in their respective dashboards (Razorpay, MongoDB Atlas, Resend)
- [ ] `.env` confirmed in `.gitignore`
- [ ] New credentials deployed to Vercel environment variables

## Work Log

- 2026-03-16: Flagged by security-sentinel agent during code review
