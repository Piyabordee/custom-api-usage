---
name: custom-api-usage-analyze
description: Analyze a raw API response and generate a JSONPath mapping for the custom-api-usage VSCode extension. Use when the user wants to add a new provider or fix a broken mapping.
---

# Custom API Usage — Analyze

You generate a `mappings.json` entry for the `custom-api-usage` VSCode extension. The user has just run the extension's **Add Provider** command, which fetched and cached the raw JSON response at `~/.custom-api-usage/raw/<provider-id>.json`. Your job is to inspect that raw response and write a mapping object that tells the extension which fields to extract.

## Fixed Fields

The extension supports exactly **4 fields**:

| Field | Type | Notes |
|---|---|---|
| `used` | number | Tokens/quota consumed |
| `total` | number | Total quota for window |
| `percent` | number | `invert: true` when API returns *remaining* percent |
| `resetTime` | timestamp | `unit: "ms"` or `"s"` |

Any of these can be `null` (just omit the field from mapping). The extension renders as much as it can.

## Workflow

1. **Parse args / ask which provider.**
   - First arg may be the provider id. If not, list providers from `~/.custom-api-usage/mappings.json` and ask.
   - If no providers exist, tell user: "Run the extension's **Add Provider** command first."

2. **Read the raw response.**
   - Path: `~/.custom-api-usage/raw/<id>.json`
   - If missing: "Raw file not found. Use the extension's **Refresh** command on this provider to populate the cache."

3. **Analyze the structure.**
   - Walk the JSON. Collect all numeric values + their JSONPath.
   - Heuristics:
     - Value in `0-100` → percent-candidate
     - Large integer → used/total-candidate
     - `> 1e12` → timestamp-ms-candidate
     - `1e9 - 1e12` → timestamp-s-candidate
     - ISO 8601 string → timestamp-string-candidate (note in output)
   - Score by name: 'used', 'total', 'limit', 'remaining', 'percent', 'quota', 'reset', 'expires', etc.

4. **Propose candidates for each fixed field.**
   - For each field, show 1-3 candidate paths with their actual values from the raw.
   - Use AskUserQuestion to confirm. Allow "None of these / I'll specify" option.

5. **Apply transformations.**
   - If user picked a `remaining_percent` field for `percent`, set `invert: true`.
   - For `resetTime`: ask "is this ms or seconds?" if value is in ambiguous range (1e9-1e12).

6. **Validate.**
   - Load `templates/mapping.schema.json` (in this skill's dir).
   - Validate the proposed mapping against the schema.
   - If fail: show error, go back to step 4.

7. **Write to `~/.custom-api-usage/mappings.json`.**
   - Read existing file (or create fresh `{version: 1, providers: []}`).
   - If provider id exists → update only its `mapping` (preserve label/url/order/interval).
   - If new → append to `providers[]`.
   - Atomic write: `mappings.json.tmp` then rename.

8. **Confirm to user.**
   - Show the final mapping block.
   - Suggest: "Reload VSCode window, or wait for next auto-refresh."

## Examples

### Example 1: Inverted percent + s timestamp

Raw:
```json
{
  "data": {
    "models": [{ "name": "m", "usage": { "used": 45, "limit": 100, "remaining_pct": 55, "reset_at": 1717670400 } }]
  }
}
```

Generated mapping:
```json
{
  "used":      { "path": "$.data.models[0].usage.used" },
  "total":     { "path": "$.data.models[0].usage.limit" },
  "percent":   { "path": "$.data.models[0].usage.remaining_pct", "invert": true },
  "resetTime": { "path": "$.data.models[0].usage.reset_at", "unit": "s" }
}
```

### Example 2: ms timestamp, no total

Raw:
```json
{ "tokens_used": 12345, "reset_at_ms": 1717670400000 }
```

Generated mapping:
```json
{
  "used":      { "path": "$.tokens_used" },
  "total":     null,
  "percent":   null,
  "resetTime": { "path": "$.reset_at_ms", "unit": "ms" }
}
```

## Failure Modes

- **Raw missing** → "Run extension's Add Provider / Refresh first."
- **Raw invalid JSON** → "Cache corrupted. Click Refresh to re-fetch."
- **No numeric fields** → "Response has no numbers. Show me the raw response and I'll figure it out manually."
- **User picks no candidate** → omit that field (null in mapping)
- **Schema validation fail** → show error, retry candidate selection
- **mappings.json version mismatch** → "Mapping file is from v<X> (expected v1). Refusing to write. Backup at <path>.bak."
