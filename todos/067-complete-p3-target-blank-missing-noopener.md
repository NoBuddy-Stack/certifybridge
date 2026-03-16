---
status: pending
priority: p3
issue_id: "067"
tags: [code-review, security, html]
dependencies: []
---

# 067 · target="_blank" WhatsApp link missing rel="noopener noreferrer" — reverse tabnapping

## Problem Statement

apply.html:578: `<a id="waLink" href="#" target="_blank" class="s-link">` has no rel attribute. Links with target="_blank" without rel="noopener" allow the opened tab to access window.opener of the originating payment confirmation page. On older browsers this is a full reverse tabnapping vector. Modern Chrome mitigates implicitly, but it is not universally safe.

## Findings

- apply.html:578 contains a target="_blank" anchor with no rel attribute
- Without rel="noopener", the newly opened tab can access and manipulate window.opener
- Reverse tabnapping allows the opened page to redirect the originating page to a phishing URL
- Modern Chromium mitigates this implicitly, but Firefox and Safari behaviour varies by version

## Proposed Solutions

Add rel="noopener noreferrer" to the anchor element:

```html
<a id="waLink" href="#" target="_blank" rel="noopener noreferrer" class="s-link">
```

Audit all other target="_blank" links in apply.html for the same issue.

## Acceptance Criteria

- All target="_blank" links in apply.html have rel="noopener noreferrer"
