---
status: pending
priority: p3
issue_id: "074"
tags: [code-review, dx, maintainability]
dependencies: []
---

# 074 · PLAN_NAMES object duplicated as third copy in browser JS

## Problem Statement

apply.html:593: `var PLAN_NAMES = { noob:'Noob Plan', pro:'Pro Plan', hacker:'Hacker Plan' };` is a third copy of plan name data alongside lib/plans.js PLAN_NAMES and the .plan-tier text in HTML cards. When a plan is renamed again, this JS object is the easiest to miss. The browser JS uses PLAN_NAMES in refreshSum(), handlePay() description, and showSuccess().

## Findings

- Plan names exist in three places: lib/plans.js, the .plan-tier text in HTML card markup, and the PLAN_NAMES JS object in apply.html:593
- The previous rebrand (Astra Forge → CertifyBridge) required updating all three locations
- apply.html:593 is the most easily missed location as it is buried inside a script block
- PLAN_NAMES is consumed in at least three browser JS functions: refreshSum(), handlePay(), and showSuccess()

## Proposed Solutions

Option A: Read the display name from the selected card's DOM — the .plan-tier text is already rendered correctly. No separate JS object needed.

Option B: Add a data-name attribute to each .pcard and read it in pickPlan() to populate a single runtime variable.

Option C: Expose plan names via GET /api/config (already planned in todo-064) and populate PLAN_NAMES from the config response on page load.

## Acceptance Criteria

- Plan name is defined in exactly one place in the codebase
- Renaming a plan requires editing one file only
