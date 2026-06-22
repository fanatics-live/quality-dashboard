# Linear Filter Rules — Quality Dashboard

## Bug Identification

An issue is considered a **bug** if it has any of the following labels:

| Group Label | Child Label(s) | Notes |
|---|---|---|
| Bug type | Regression bug, Progression bug | Any child of this group |
| Severity | Critical Severity, High Severity, Medium Severity, Low Severity | Any child of this group |
| Shake App | bug | Specific child only |
| Bug category | Functional | Specific child only |
| Issue Type | Bug (functional or design) | Specific child only |

## Status Types

All dashboard queries **must** filter to the following Linear state types:

- `triage`
- `backlog`
- `unstarted`
- `started`

Completed and canceled issues are excluded from active counts.

## Bug Classification (Bug Type)

Based on the **group label "Bug type"**:

| Dashboard Value | Linear Label Required |
|---|---|
| Regression | `Regression bug` (child of "Bug type") |
| Progression | `Progression bug` (child of "Bug type") |
| Unclassified | Bug has **no label** under the "Bug type" group |

> Regression and Progression only require their specific label — they do NOT need to also match the general bug identification rules above.

## Bug Severity

Based on the **group label "Severity"**:

| Dashboard Value | Linear Label |
|---|---|
| Critical | `Critical Severity` |
| High | `High Severity` |
| Medium | `Medium Severity` |
| Low | `Low Severity` |
| Unclassified | Bug has **no label** under the "Severity" group |

> Do NOT map severity from Linear's priority field. Use the "Severity" group label exclusively.

## Bug Environment

Based on the **group label "Bug environment"**:

| Dashboard Value | Linear Label |
|---|---|
| Production | `Production bug` |
| Staging | `Staging bug` |
| Development | `Dev bug` |
| Dogfood | `Dogfood bug` |
| Unclassified | Bug has **no label** under the "Bug environment" group |

## Linear Custom Views (URL Generation)

Linear does not support URL-based filtering. The dashboard creates **custom views** via the GraphQL API (`customViewCreate` mutation) to generate clickable links.

- Views are prefixed with `QD:` and set to `shared: false`
- View slug IDs are cached in `data/linear-views.json`
- URL format: `https://linear.app/fanaticscollect/view/{slugId}`
- Views are created lazily on first click

### filterData Format

Linear custom views use a `filterData` JSON structure:

```json
{
  "and": [
    { "labels": { "some": { "name": { "in": ["label1", "label2"] } } } },
    { "state": { "type": { "in": ["triage", "backlog", "unstarted", "started"] } } }
  ]
}
```

**Limitations:**
- Label negation (`none`) is **not supported** — Unclassified segments cannot be precisely filtered via custom views and fall back to the "All Bugs" view
- Label filters use `some` (has at least one matching label) — there is no way to filter by parent/group label directly, you must list the child label names
