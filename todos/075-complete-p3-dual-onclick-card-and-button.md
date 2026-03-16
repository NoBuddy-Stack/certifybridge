---
status: pending
priority: p3
issue_id: "075"
tags: [code-review, html, dx, maintainability]
dependencies: []
---

# 075 · Plan cards have dual onclick on wrapper and button requiring stopPropagation

## Problem Statement

apply.html:467-507: each plan card has `onclick="pickPlan('noob',499)"` on the .pcard wrapper AND `onclick="pickPlan('noob',499);event.stopPropagation()"` on the inner .plan-btn. The stopPropagation is needed only because both elements fire. This is a self-inflicted complexity: if only the button fires pickPlan, the wrapper onclick, stopPropagation calls, and the dual-handler pattern are all eliminated.

## Findings

- Each of the 3 plan cards in apply.html:467-507 has onclick on both the .pcard wrapper div and the inner .plan-btn button
- The .plan-btn onclick includes event.stopPropagation() to prevent the wrapper onclick from also firing
- This dual-handler pattern adds 6 onclick attributes and 3 stopPropagation calls across the three cards
- The pattern must be replicated correctly for any future plan card additions
- If stopPropagation is accidentally omitted from a new card's button, pickPlan fires twice

## Proposed Solutions

Remove onclick from all .pcard wrapper divs. Keep only the .plan-btn onclick handlers without stopPropagation:

```html
<button class="plan-btn" onclick="pickPlan('noob',499)">Select Plan</button>
```

The card visual selection is handled inside pickPlan() regardless of which element triggers it — clicking the button is sufficient. This removes 6 onclick attributes and 3 stopPropagation calls.

## Acceptance Criteria

- Clicking anywhere on a plan card still triggers pickPlan (via the button's click handler, no wrapper onclick needed)
- No stopPropagation calls remain on plan card elements
- Total onclick attributes on plan card elements reduced from 6 to 3 (one per button)
