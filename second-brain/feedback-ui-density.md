---
name: feedback-ui-density
description: amusemonk UI must be compact like corona — no page titles or descriptions, data first
metadata:
  type: feedback
---

No page header and no description on app pages — the top nav already says where you are; pages open straight on their data. Density like corona: 32px controls, 36/40px table header/rows, 48px top bar, 18px max heading where a heading is genuinely content (e.g. a file's name on its detail page), section labels as 11px uppercase eyebrows only. Put actions next to the data they act on (Upload beside Recent files, Replace key inside the balance tile), not in a title row.

**Why:** 2026-10-29 the user objected twice in one step: first "why large header and description?? … compact as corona", then, after I shrank them, "why … do we need header and description??". Shrinking wasn't the fix; removing was.
**How to apply:** for any new amusemonk screen, start without a title/description; keep a visually hidden h1 for screen readers. Relates to [[amusemonk-project]].

Tables follow corona's design (user, 2026-10-29): quick status chips with counts, "Search by [field]", removable filter chips, a Filters side panel, pinnable + movable columns remembered per table. Built in our own tokens, never copied visuals. "Row moving" was read as column moving (corona has no row dragging) — confirm if the user meant rows.
