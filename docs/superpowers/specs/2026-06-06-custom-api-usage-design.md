# Custom API Usage — Design Notes

**Status:** v0.1.0 design rationale (frozen — implementation has shipped)

This document captures the *why* behind key architecture decisions. For *how* the code works today, see [CLAUDE.md](../../CLAUDE.md) and the source.

---

## Goals

- **Generic, not vendor-locked.** Any JSON API exposing usage/quota data can be wired up without forking the extension.
- **Skill-driven mapping.** A Claude Code skill reads the raw API response and writes a JSONPath mapping — users never hand-edit JSONPath in normal flow.
- **Syncable config, local secrets.** `mappings.json` is plain JSON (sync via dotfiles, no encryption needed). API keys live in VSCode SecretStorage (machine-local).
- **Multi-provider, reorderable.** N providers render as N status bar items, in user-defined order.

## Non-Goals (v1)

- Workspace-level configs (user-global only)
- Custom status bar templates (fixed `⚡ <label> <pct>% (<timeLeft>)`)
- History / trends / graphs
- Webhook / push updates (polling only)
- OAuth flows (static API keys only)
- Per-provider color thresholds (global 75% / 90%)
- POST request bodies (reserved for v2)

---

## Key Architecture Decisions

### 1. JSONPath as the extraction primitive

**Why:** Familiar to anyone who's used `jq` or worked with JSON APIs. Hand-editable in `mappings.json` when the skill gets it wrong. [`jsonpath-plus`](https://www.npmjs.com/package/jsonpath-plus) is ~12 KB gzipped with zero sub-dependencies — cheaper than rolling our own traversal.

**Trade-off:** Adds one runtime dependency. Worth it.

### 2. The 4 fixed mapping fields

The extension recognizes exactly 4 fields and ignores everything else:

| Field | Type | Notes |
|---|---|---|
| `used` | number | Tokens/quota consumed in window |
| `total` | number | Total quota for window |
| `percent` | number | `invert: true` when API returns *remaining* percent |
| `resetTime` | timestamp | `unit: "ms"` or `"s"`, auto-detected when value > `1e12` |

**Why these 4:** They're the minimum needed to render a meaningful status bar. `used` + `total` enable the `450/1000` fallback. `percent` enables the primary `<pct>%` view. `resetTime` enables the time-left display.

**Trade-off:** v2 will likely add `windowSize` (for "X of Y requests used"). Bumping the schema version forces a one-time skill/extension migration.

### 3. `${apiKey}` template substitution in headers

Headers support a single placeholder — `${apiKey}` — resolved at fetch time from SecretStorage. The literal string is replaced; no template engine, no `eval()`.

**Why simple string replace:**
- Predictable. Users can grep `mappings.json` and see exactly what goes on the wire.
- Safe. No recursive expansion. An API key containing `$` or `{}` is passed through literally.
- Testable. `fetcher.js` takes `getApiKey` as an injected function — no SecretStorage needed in tests.

**Trade-off:** No support for dynamic values (timestamps, request IDs, etc.). Reserved for v2 with a `${timestamp}` placeholder.

### 4. Per-provider refresh timers, staggered first fetch

Each provider has its own `setInterval`. First fetch is staggered by `index × 10s` to avoid burst on activation.

**Why:** A user with 4 providers on a slow connection shouldn't have all 4 fire simultaneously. The 10s gap is invisible to users but prevents thundering herd on shared API gateways.

### 5. Atomic `mappings.json` writes (`.tmp` + unlink + rename)

`fs.writeFileSync` is not atomic — a crash mid-write leaves a partial file. The extension writes to `mappings.json.tmp`, unlinks the target (required on Windows: `rename` fails if target exists), then renames.

**Why unlink before rename on Windows:** Node's `fs.rename` on Windows fails with `EPERM` or `EBUSY` if the target already exists. The unlink-then-rename pattern works on all platforms. The `.tmp` file is cleaned up on every successful `save()` and on startup (defends against crash-mid-write).

### 6. Raw cache only on successful fetch

`raw/<id>.json` is written only when the API returns 2xx + valid JSON. Error responses are *not* cached as `raw/<id>.json` (the analyzer skill would misread them as the success shape).

**Trade-off:** If the API starts returning 4xx consistently, the user must hit **Refresh** to populate the cache. Acceptable.

### 7. Skill refuses to write on version mismatch

The skill validates `mappings.json`'s `version` field against `templates/mapping.schema.json`'s `version`. If they differ, the skill refuses to write and creates a `.bak` backup.

**Why:** Schema migration is the #1 source of data loss in evolving JSON configs. Refusing-to-write is safer than silently upgrading — the user can decide.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       USER WORKFLOW                                 │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐   add provider    ┌─────────────────────────┐
│  VSCode (user)   │ ───────────────►  │  Extension              │
│  label/url/key   │  ◄───────────────  │  - stores key in        │
│                  │  "raw saved"       │    SecretStorage        │
└──────────────────┘                   │  - fetches raw JSON     │
        │                              │  - saves raw cache      │
        │ run skill                    └────────────┬────────────┘
        ▼                                            │
  ┌──────────────────┐    reads raw     ┌───────────▼─────────────┐
│  Claude Code     │ ──────────────►  │  ~/.custom-api-usage/    │
│  /custom-api-    │                  │   ├── raw/<id>.json      │
│   usage-analyze  │  writes mapping  │   └── mappings.json      │
└──────────────────┘ ──────────────►  │       (providers[])      │
                                     └────────────┬─────────────┘
                                                  │ reads mapping
                                                  │ reads raw
                          ┌───────────────────────▼──────┐
                          │  Extension                    │
                          │  - JSONPath per field         │
                          │  - renders N status bar items │
                          │  - auto-refresh on interval   │
                          └───────────────────────────────┘
```

---

## Module Boundaries

| Module | Responsibility | Forbidden |
|---|---|---|
| `extension/extension.js` | VSCode glue: activation, commands, status bar lifecycle, webview | Reading/writing files directly (always go through `providers`) |
| `extension/providers.js` | Data layer: `mappings.json` CRUD, SecretStorage wrapper | HTTP, JSONPath, rendering |
| `extension/fetcher.js` | HTTP + extraction + render: `fetchAndCache`, `extract`, `renderStatusBar` | Filesystem writes outside `raw/`, SecretStorage access (receives `getApiKey` as injected fn) |
| `.claude/skills/custom-api-usage-analyze/` | Skill: reads raw, proposes mapping, writes `mappings.json` | Fetching the API (extension does that), storing secrets |

**Why strict boundaries:** Each module is testable in isolation. `fetcher.js` is pure except for the fetch promise. `providers.js` is pure data. `extension.js` is the only thing that imports `vscode`.

---

## Future Work (v2+)

Reserved fields and known extensions:

- `mapping.body` — POST request bodies with `${apiKey}`, `${timestamp}` templates
- `mapping.windowSize` — "X of Y requests in current window" rendering
- `display.percentThreshold` — per-provider color thresholds (currently global)
- `display.labelTemplate` — custom status bar format
- OAuth flow support (with `refresh_token` handling)
- History view (last 24h usage trend per provider)
