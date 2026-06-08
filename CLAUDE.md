# CLAUDE.md — custom-api-usage

Guidance for Claude Code, GitHub Copilot, and other AI coding agents working in this repository.

## Project Identity

A **generic, multi-provider** VSCode extension that displays token/quota usage from **any JSON API** in the status bar. The "generic" is the differentiator — not hardcoded to one AI vendor. If the API returns JSON, this extension can show it.

**Flow:** User adds a provider (URL + API key via wizard) → a companion Claude Code skill generates a JSONPath mapping by inspecting the raw API response → the extension auto-refreshes and renders `⚡ <label> <pct>% (<timeLeft>)` in the status bar, per provider.

## Quick Reference — Commands

| Task | Command |
|---|---|
| Run all tests | `npm test` (runs `node --test test/*.test.js`) |
| Run a single test file | `node --test test/fetcher.test.js` (or `providers.test.js`, `fetcher.http.test.js`) |
| Run a single test by name | `node --test --test-name-pattern="<pattern>" test/` |
| Package VSIX | `npm run package` (uses `@vscode/vsce`) |
| Install locally | `code --install-extension custom-api-usage-*.vsix` |

No build step, no bundler, no transpiler. Pure Node.js + VSCode API. Tests use built-in `node:test` — **zero external test dependencies**.

## Architecture

```
extension/
├── extension.js      # VSCode entry point, command registration, status bar lifecycle
├── providers.js      # mappings.json CRUD + SecretStorage wrapper (data layer only)
└── fetcher.js        # HTTPS fetch + JSONPath extract + status bar render

.claude/skills/custom-api-usage-analyze/
├── SKILL.md          # Analyzer instructions for the companion skill
└── templates/
    └── mapping.schema.json   # JSON Schema v1 — source of truth for mapping validation
```

### Strict Module Boundaries

| Module | Responsibility | Forbidden |
|---|---|---|
| `providers.js` | Data layer only: `load/save/add/remove/reorder` for `mappings.json`; `getApiKey/setApiKey/deleteApiKey` over SecretStorage | No HTTP, no JSONPath, no rendering |
| `fetcher.js` | HTTP + extraction + render: exports `extract`, `renderStatusBar`, `fetchAndCache` (pure except for the fetch promise) | No filesystem writes outside `raw/`, no SecretStorage access (receives `getApiKey` as injected function) |
| `extension.js` | VSCode glue only: activation/deactivation, command registration, status bar item creation, `FileSystemWatcher`, webview | Never reads/writes files directly — always goes through `providers` |

## Key Design Decisions

- **JSONPath** (via `jsonpath-plus` v10) as the extraction primitive — familiar syntax, easy to hand-edit in `mappings.json`.
- **`mappings.json` at `~/.custom-api-usage/`** is the single source of truth (syncable across machines, **contains zero secrets**).
- **VSCode SecretStorage** for API keys — never written to disk in plaintext. Keys are stored under `customApiUsage.providers.<id>.apiKey`.
- **Per-provider refresh timers**, staggered to avoid burst: provider *i* first fetches at `i × 10s` after activation.
- **Atomic config writes** — `mappings.json.tmp` + `fs.renameSync` to prevent corruption.
- **Raw cache** at `~/.custom-api-usage/raw/<id>.json` is only written on successful fetch (never on error). This is what the analyzer skill reads.
- **No VSCode settings-level configuration** — everything lives in `mappings.json` to keep it portable and syncable.

## Data Contracts (Do Not Break)

### `mappings.json` — Version 1

```json
{
  "version": 1,
  "providers": [{
    "id": "kebab-case-id",
    "label": "Display Name",
    "url": "https://api.example.com/v1/usage",
    "method": "GET",
    "headers": { "Authorization": "Bearer ${apiKey}" },
    "mapping": {
      "used":      { "path": "$.data.usage.used" },
      "total":     { "path": "$.data.usage.limit" },
      "percent":   { "path": "$.data.usage.remaining_pct", "invert": true },
      "resetTime": { "path": "$.data.usage.reset_at", "unit": "s" }
    },
    "display": { "order": 1, "showPercent": true, "showTimeLeft": true },
    "refreshIntervalMinutes": 5
  }]
}
```

**Exactly 4 fixed mapping fields** — all optional (omit any you can't map):

| Field | Type | Notes |
|---|---|---|
| `used` | number | Tokens/quota consumed |
| `total` | number | Total quota for the window |
| `percent` | number (0–100) | Set `invert: true` when the API returns *remaining* percent (the extension will compute `100 - value`) |
| `resetTime` | timestamp | `unit: "ms"` or `"s"`. Auto-detected as `"ms"` when raw value > `1e12` |

**`${apiKey}` in headers** is a template literal — resolved at fetch time from SecretStorage. The literal string `${apiKey}` is replaced with the stored key; if no key is stored, it resolves to empty string.

### Status Bar Contract

**Format:** `⚡ <label> <pct>% (<timeLeft>)`

**Color thresholds (foreground + background via ThemeColor):**

| Usage | Color |
|---|---|
| < 75% | Default (no color override — green-ish in most themes) |
| 75% – 89% | `statusBarItem.warningForeground` / `warningBackground` |
| ≥ 90% | `statusBarItem.errorForeground` / `errorBackground` |

**Status bar text must always show *some* state** — never blank. Fallback states in priority order:
1. **Loading:** `$(sync~spin) <label>...`
2. **Needs analyze:** `$(warning) <label>: Needs analyze` (no mapping yet)
3. **Needs API key:** `$(key) <label>: Set API Key` (clickable → setApiKey command)
4. **Error:** `$(warning) <label>: Error` (clickable → refresh command)
5. **Data:** `⚡ <label> <pct>% (<timeLeft>)`

Each provider gets its own `StatusBarItem`, right-aligned with priority `100000 - order_index`.

## Storage Layout

| Path | Content | Notes |
|---|---|---|
| `~/.custom-api-usage/mappings.json` | Provider list with mappings | Syncable, **no secrets**. Atomic write via `.tmp` + rename |
| `~/.custom-api-usage/raw/<id>.json` | Last raw API response | Regenerated on every successful fetch. Read by the analyzer skill |
| VSCode SecretStorage `customApiUsage.providers.<id>.apiKey` | API key per provider | Never touches disk in plaintext |

## Per-Provider Lifecycle

1. **Activation** (`onStartupFinished`): `rebuildFromDisk` reads `mappings.json`, creates one `StatusBarItem` per provider (right-aligned, priority descending by `display.order`).
2. **First fetch:** Staggered — provider at index *i* fetches after `i × 10s`.
3. **Periodic refresh:** Default 5 min, configurable per provider (1–60 min range). Each provider has its own `setInterval`.
4. **External edit detection:** A `FileSystemWatcher` on `mappings.json` triggers a full `rebuildFromDisk` on `onDidChange` and `onDidCreate`. This disposes all old items/timers and recreates them.
5. **Deactivation:** All timers cleared, watcher disposed.

### Fetch + Extract Pipeline (per refresh)

```
fetchAndCache(provider, customDir, getApiKey)
  ├─ Resolve ${apiKey} in headers from SecretStorage
  ├─ HTTPS GET (10s timeout)
  ├─ On 2xx + valid JSON: write raw → raw/<id>.json, return parsed
  └─ On error: throw (no cache write)

extract(provider, raw)
  ├─ JSONPath each of the 4 mapping fields
  ├─ Apply invert (100 - value) if percent.invert
  ├─ Apply unit conversion (s→ms) if resetTime.unit === "s"
  └─ Return { used, total, percent, resetTimeMs }

renderStatusBar(provider, extracted)
  ├─ Format: ⚡ <label> [<pct>%] [(<timeLeft>)]
  ├─ Time remaining: "XhYm", "Xm", or "<1m"
  ├─ "(expired)" when resetTimeMs is in the past
  └─ Return { text, color, backgroundColor }
```

## Companion Skill

Located at `.claude/skills/custom-api-usage-analyze/SKILL.md`. This skill:

- Reads `~/.custom-api-usage/raw/<id>.json` (the raw API response)
- Walks the JSON to find numeric fields, scores them by name heuristics (`used`, `total`, `limit`, `remaining`, `percent`, `quota`, `reset`, `expires`, etc.)
- Proposes JSONPath candidates for each of the 4 fixed fields
- Validates against `templates/mapping.schema.json`
- Writes the mapping into `~/.custom-api-usage/mappings.json` (atomic write)
- **Refuses to write** if `mappings.json` version ≠ schema version

## Registered VSCode Commands

All prefixed `Custom API Usage: ` in the command palette:

| Command ID | Action |
|---|---|
| `customApiUsage.addProvider` | Wizard: enter label, URL, API key → creates provider entry |
| `customApiUsage.setApiKey` | Replace stored API key for a provider |
| `customApiUsage.refresh` | Force re-fetch all providers immediately |
| `customApiUsage.showDetails` | Open webview panel with usage cards + progress bars for all providers |
| `customApiUsage.reorderProviders` | Quick pick to reorder providers (updates `display.order`) |
| `customApiUsage.removeProvider` | Remove provider from `mappings.json` + delete its SecretStorage key |
| `customApiUsage.exportMappings` | Copy `mappings.json` to clipboard (no secrets) |
| `customApiUsage.importMappings` | Paste `mappings.json` from clipboard (merges providers) |

## Modification Guidelines

1. **Respect module boundaries.** Don't add HTTP concerns to `providers.js` or filesystem/storage concerns to `fetcher.js`. `extension.js` is VSCode glue — it should never read/write files directly.
2. **Never log API keys.** Never write API keys to `mappings.json` or `raw/`.
3. **Status bar must always render.** Every code path in `refreshOne` must set `item.text` to a non-empty string before `item.show()`.
4. **Adding a new mapping field** → bump `version` in `mapping.schema.json` (the skill will refuse to write to old-version files). Update `extract()` in `fetcher.js` and `renderStatusBar()` accordingly.
5. **Keep dependencies minimal.** The only runtime dependency is `jsonpath-plus`. Tests use only `node:test`.
6. **Atomic writes only.** Always use the `.tmp` + rename pattern for `mappings.json`.
