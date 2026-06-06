# Custom API Usage — Design Spec

**Date:** 2026-06-06
**Status:** Approved (pending implementation plan)
**Repo (planned):** `custom-api-usage` (new repo)
**Brainstormed from:** `minimax-usage` v1.0.4 (existing, frozen)

---

## 1. Context & Motivation

The current `minimax-usage` VSCode extension is hardcoded to one provider and one response shape. It cannot be reused for other "token plan" / "quota" style APIs (e.g., z.ai, OpenAI plan usage, internal corporate APIs) without forking the code.

This project replaces that hardcoded extension with a **generic, provider-agnostic** version where:

- The user supplies a URL + API key per provider.
- A **Claude Code skill** analyzes the raw response and produces a **mapping config** (JSONPath-based).
- The extension uses that mapping to extract `used / total / percent / resetTime` from any response shape.
- The mapping config is **plain JSON** that can be shared across machines (re-entering only the API key is required).
- Multiple providers are supported simultaneously, with reorderable status bar items.
- Before a mapping exists, the extension uses a **default fetch config** (`GET` + `Authorization: Bearer ${apiKey}`) to grab the first raw response — enough for the skill to analyze.

The user wants to publish this as a **new repo** (`custom-api-usage`) — distinct from the legacy `minimax-usage`.

---

## 2. Goals & Non-Goals

### Goals
- Add any quota/usage-style API as a provider via URL + key.
- **Default fetch** before mapping exists: `GET` + `Authorization: Bearer ${apiKey}` header — enough to grab a raw response and feed the skill.
- Skill-driven mapping generation (no manual JSONPath editing required).
- N providers, each with its own status bar item, reorderable. Max **3 visible** items in the status bar to avoid crowding; the rest are collapsed into a `⚡ +N more` aggregate item (click opens detail view).
- Per-provider refresh interval.
- Mapping config syncable across machines (plain JSON, no secrets embedded).
- API keys stored in VSCode SecretStorage (machine-local, never written to disk in plaintext).
- Fallback status bar display: when `percent` cannot be determined but `used`/`total` are available, show raw numbers (e.g. `⚡ Example API 450/1000`).

### Non-Goals (v1)
- Workspace-level configs (only user-global).
- Custom display templates (fixed `⚡ <label> <pct>% (<timeLeft>)` format).
- History / trends / graphs.
- Webhook / push updates (polling only).
- OAuth flows (static API keys only).
- Encrypted mappings.json (user's responsibility to sync via private channels).
- Built-in "test connection" command (raw file is the test result).
- Marketplace auto-publish.
- JSONPath autocomplete in settings.
- Mapping migration tooling beyond `version: 1`.
- Per-provider color thresholds (global 75%/90% for all providers).
- POST request body support (all providers default to `GET`; `method` + `body` support deferred to v2).
- Built-in manual JSONPath wizard (users without Claude Code must hand-edit `mappings.json`).

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER WORKFLOW                              │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐   add provider    ┌─────────────────────────┐
  │  VSCode (user)   │ ───────────────►  │  Extension              │
  │                  │  label/url/key    │  - stores key in        │
  │                  │ ◄───────────────  │    SecretStorage        │
  └──────────────────┘   "raw saved"     │  - fetches raw JSON     │
           │                              │  - saves raw cache      │
           │                              └────────────┬────────────┘
           │ run skill                                   │
           ▼                                             │
  ┌──────────────────┐    reads raw     ┌───────────────▼────────────┐
  │  Claude Code     │ ──────────────►  │  ~/.custom-api-usage/      │
  │  (slash command) │                  │   ├── raw/<id>.json        │
  │                  │  writes mapping  │   └── mappings.json        │
  │  /custom-api-    │ ──────────────►  │       (providers[])        │
  │   usage-analyze  │                  └────────────┬───────────────┘
  └──────────────────┘                               │ reads mapping
                                                     │ reads raw
                          ┌──────────────────────────▼──────┐
                          │  Extension                       │
                          │  - evaluates JSONPath per field  │
                          │  - renders N status bar items    │
                          │  - auto-refresh on interval      │
                          └──────────────────────────────────┘
```

### Components

| Component | Purpose |
|---|---|
| `extension/extension.js` | VSCode entry. Commands, status bar lifecycle, refresh timer. |
| `extension/providers.js` | Load/save `mappings.json`, SecretStorage CRUD, add/remove/reorder providers. |
| `extension/fetcher.js` | HTTPS request → raw cache. JSONPath evaluation via `jsonpath-plus`. |
| `.claude/skills/custom-api-usage-analyze/` | Claude Code skill: read raw, propose mapping, write `mappings.json`. |
| `~/.custom-api-usage/mappings.json` | Plain JSON, syncable. Contains N providers' URL + mapping. No secrets. |
| `~/.custom-api-usage/raw/<id>.json` | Raw response cache, per provider. Regenerated on every fetch. |
| VSCode SecretStorage | API keys keyed by `customApiUsage.providers.<id>.apiKey`. Machine-local. |

### Data Flow Contracts

- `mappings.json` is the **source of truth** for: provider list, URLs, mapping rules, display order, refresh interval.
- SecretStorage is the **only** place for API keys — never written to `mappings.json`.
- Raw cache is **regenerated on every successful fetch** and preserved when fetches fail (so the user can re-run the skill against the last good response if needed). If the cache is absent, the extension shows "⚠️ Needs analyze" for that provider.
- Missing `display` object → defaults to `{order: providers.length, showPercent: true, showTimeLeft: true}`.
- On **error responses** (4xx/5xx), the raw response body is also cached to `~/.custom-api-usage/raw/<id>_error.json` for debugging. The skill can optionally read this to help diagnose auth/config issues.

### Default Fetch Behavior (Pre-Mapping Stage)

Before a provider has a mapping config (fresh after `addProvider`), the extension needs to fetch a raw response so the skill can analyze it. Without a mapping, there's no `method` or `headers` configuration — so the extension falls back to a **built-in default**:

| Setting | Default |
|---|---|
| `method` | `GET` |
| `headers` | `{ "Authorization": "Bearer ${apiKey}", "Content-Type": "application/json" }` |
| Timeout | 10 seconds |

This default is intentionally minimal — it covers the most common API auth pattern. Once the skill writes the mapping, the provider's configured `method` and `headers` take over for all subsequent fetches.

**Rationale:** This solves the chicken-and-egg problem (need mapping to fetch, need raw to create mapping) without requiring the user to understand HTTP method/header configuration before they've even seen a response.

**Edge case:** If a provider's API requires `POST` or a non-standard auth header, the default `GET` will fail. The user will see `⚠️ <label>: Error` and can either:
- Hand-edit `mappings.json` to set `method: "POST"` and the correct `headers`, then re-fetch.
- Use `curl` or Postman to fetch manually and paste the raw JSON into `~/.custom-api-usage/raw/<id>.json`, then run the skill.

---

## 4. File Layout

```
custom-api-usage/
├── extension/
│   ├── extension.js              # VSCode entry, commands, status bar lifecycle
│   ├── providers.js              # mappings.json CRUD, SecretStorage
│   └── fetcher.js                # HTTPS request + raw cache + JSONPath evaluation
├── .claude/skills/custom-api-usage-analyze/
│   ├── SKILL.md                  # Claude instructions for the analyzer
│   └── templates/
│       └── mapping.schema.json   # JSON Schema (for skill to validate its own output)
├── docs/
│   └── superpowers/specs/
│       └── 2026-06-06-custom-api-usage-design.md
├── test/
│   ├── fetcher.test.js
│   └── providers.test.js
├── package.json
├── README.md
├── LICENSE
└── AGENTS.md
```

User-level (machine-local):

```
~/.custom-api-usage/
├── mappings.json                 # SOURCE OF TRUTH — sync across machines
└── raw/
    ├── provider-a.json           # last raw response (regenerated on every fetch)
    ├── provider-b.json
    └── ...
```

---

## 5. Mapping Schema (`mappings.json`)

```json
{
  "version": 1,
  "providers": [
    {
      "id": "example-api",
      "label": "Example API",
      "url": "https://api.example.com/v1/usage",
      "method": "GET",
      "headers": {
        "Authorization": "Bearer ${apiKey}",
        "Content-Type": "application/json"
      },
      "mapping": {
        "used":      { "path": "$.data.models[0].usage.used" },
        "total":     { "path": "$.data.models[0].usage.limit" },
        "percent":   { "path": "$.data.models[0].usage.remaining_percent", "invert": true },
        "resetTime": { "path": "$.data.models[0].usage.reset_at_seconds", "unit": "s" }
      },
      "display": {
        "order": 1,
        "showPercent": true,
        "showTimeLeft": true
      },
      "refreshIntervalMinutes": 5
    }
  ]
}
```

### Field Semantics (the "fixed fields")

| Field | Type | Notes |
|---|---|---|
| `used` | number | Tokens/quota consumed in current window. |
| `total` | number | Total quota for current window. If absent, percent can still be shown. |
| `percent` | number | `invert: true` when API returns *remaining* percent (e.g., `25` → 75% used). |
| `resetTime` | timestamp | Absolute time. `unit: "ms"` or `unit: "s"` (auto-detected if > 1e12 → ms). |

### Provider Fields

| Field | Required | Notes |
|---|---|---|
| `id` | ✅ | Unique slug, e.g. `openai-plan`, `z-ai`. Used as raw cache filename. |
| `label` | ✅ | Display name in status bar. Keep short (<20 chars). |
| `url` | ✅ | Full URL including `https://`. |
| `method` | ✅ | HTTP method. `GET` for most APIs. `POST` is reserved for v2 (default fetch only uses GET). |
| `headers` | ✅ | Key-value map. `${apiKey}` is resolved from SecretStorage at fetch time. |
| `body` | — | **Reserved for v2.** Not used in v1. Would support `${apiKey}` and `${timestamp}` templates for POST-based APIs. |
| `mapping` | ✅ | JSONPath extraction rules for the 4 fixed fields. |
| `display` | — | Ordering and visibility toggles. Defaults if absent. |
| `refreshIntervalMinutes` | — | Per-provider polling interval. Default: `5`. |

### Why This Shape

- **JSONPath strings** as extraction primitive → familiar, easy to edit by hand, `jsonpath-plus` is a tiny well-tested lib.
- **Inline metadata** (`invert`, `unit`) keeps schema flat and grep-friendly.
- **`headers` template** uses `${apiKey}` placeholder → resolved from SecretStorage at fetch time, never written to disk.
- **`version: 1`** reserved for future migration (skill refuses to write if mismatch).

### Dependency: `jsonpath-plus`

The extension uses [`jsonpath-plus`](https://www.npmjs.com/package/jsonpath-plus) (^9.0.0) for JSONPath evaluation. Unlike `minimax-usage` which had zero external dependencies, this is a necessary trade-off — hand-rolling JSONPath traversal for arbitrary nested responses is error-prone and not worth the maintenance burden. The package is ~12 KB gzipped and has no sub-dependencies.

### Template Injection Safety

`${apiKey}` in `headers` and (future) `body` is resolved via **simple string replacement** — not a template engine, not `eval()`. The implementation uses:
```js
headers[key] = headers[key].replaceAll('${apiKey}', actualApiKey);
```
This means:
- API keys containing `${` or `}` are handled literally (no recursive resolution).
- No arbitrary expression evaluation — only the exact placeholder `${apiKey}` is replaced.
- The placeholder never appears in logs or `mappings.json`; only the resolved value is sent over the wire.

### Validation

- `templates/mapping.schema.json` defines the contract.
- Skill validates its own output before writing.
- Extension validates on load → invalid providers skipped with warning, others keep working.

---

## 6. Skill Behavior (`/custom-api-usage-analyze`)

### Trigger

Slash command in Claude Code:
- `/custom-api-usage-analyze` (prompts for provider)
- `/custom-api-usage-analyze <provider-id>` (specific provider)

### Flow

```
1. Parse args / AskUserQuestion
   - "Which provider? [provider-a | provider-b | new...]"
   - "Use raw from default path (~/.custom-api-usage/raw/<id>.json)? or paste path?"

2. Load state
   - Read ~/.custom-api-usage/mappings.json (if exists) — check if already mapped
   - Read ~/.custom-api-usage/raw/<id>.json — to analyze
   - If raw missing → STOP with message:
     "Run extension's 'Add Provider' first to fetch raw"

3. Analyze raw JSON
   - Walk structure (jsonpath), collect all numeric values
   - Heuristics:
     * value 0-100       → percent-candidate
     * large integer     → used/total-candidate
     * > 1e12            → timestamp-ms-candidate
     * 1e9 - 1e12        → timestamp-s-candidate
     * string ISO 8601   → timestamp-string-candidate
   - For each numeric field, score by name:
     'used', 'total', 'limit', 'remaining', 'percent', 'quota' etc.

4. Propose mapping (4 fixed fields)
   - For each field, show 1-3 candidate paths + their values
   - Example:
       percent candidates:
         [1] $.data.usage.used_percent     →  45
         [2] $.data.remaining_percent     →  55
         [3] $.data.quota.percent         →  45
   - AskUserQuestion: "Which path is 'percent'?"

5. Apply transformations
   - If user picked a 'remaining_percent' field → set invert: true
   - For resetTime: ask "is this ms or seconds?" if ambiguous

6. Validate against schema
   - Use mapping.schema.json to validate proposed output
   - If fail → show error, retry step 4

7. Write to mappings.json
   - If provider id exists → update only the mapping object
     (preserve label/url/order/interval)
   - If new → append to providers[]
   - Preserve other providers unchanged

8. Confirm
   - Show the final mapping block
   - Suggest: "Reload VSCode window to apply (or wait for next auto-refresh)"
```

### Skill Capabilities

- `Read` files (raw, mappings, schema)
- `Write`/`Edit` `mappings.json`
- `AskUserQuestion` (4 fields × confirmations)
- `Bash` for JSON validation (optional — `node -e 'JSON.parse(...)'` or `jq`)

### Skill Explicitly Does NOT

- Fetch the API (extension does that — avoids duplicating auth logic)
- Store secrets
- Touch other providers' mappings

### Concurrency Safety

The skill and the extension may both write `mappings.json` concurrently (e.g., the skill is writing a new mapping while the extension auto-saves a reorder). To prevent data loss:

1. **Skill reads first, then writes** — before writing, the skill re-reads `mappings.json` and checks that no new providers were added/removed since its initial read. If the provider list changed, it warns the user and asks for confirmation.
2. **Extension uses atomic writes** — `save()` writes to `mappings.json.tmp`, then renames over the target (see Section 7). If a `.tmp` file already exists from a previous incomplete write, the extension waits 500ms and retries once.
3. **No file locks** — to keep the implementation simple, we use optimistic concurrency (read-check-write) rather than OS-level file locking. The window for conflicts is small (skill writes are rare, human-initiated events).

### Failure Modes

| Situation | Skill response |
|---|---|
| Raw file missing | "Raw response not found. Use the extension's 'Add Provider' command first to fetch and cache the response." |
| Raw is invalid JSON | "Raw file is not valid JSON. Re-fetch by running 'Refresh' on this provider." |
| No candidate matches a fixed field | "Couldn't find a number field for `<field>`. Here are all numeric values in the response — please tell me which one to use, or paste a different sample." |
| `mappings.json` has `version` mismatch | "Mapping file is from a newer/older version. Refusing to write. Backup at `<path>.bak`." |
| User cancels mid-flow | No writes. Idempotent. |

---

## 7. Extension Behavior

### Module: `extension/extension.js` (entry point)

```
activate(context):
  - Load mappings via providers.load()
  - For each provider in mapping:
      - Create status bar item (alignment: Right, priority = 100 + display.order)
      - Schedule per-provider refresh (interval from refreshIntervalMinutes)
  - Register commands:
      - customApiUsage.addProvider         (wizard: label, url, key)
      - customApiUsage.refresh             (refresh all or current)
      - customApiUsage.refreshProvider     (refresh one)
      - customApiUsage.showDetails         (webview with all providers)
      - customApiUsage.reorderProviders    (quick pick to reorder)
      - customApiUsage.removeProvider      (remove from mapping + secret)
      - customApiUsage.exportMappings      (copy mappings.json to clipboard)
      - customApiUsage.importMappings      (paste mappings.json from clipboard)
      - customApiUsage.setApiKey           (set/replace key for one provider)
  - onDidChangeConfiguration → reload mappings
  - file watcher on mappings.json → reload (debounced)
```

### Module: `extension/providers.js` (~100 lines)

```
load() → {version, providers[]}      # reads ~/.custom-api-usage/mappings.json
save(mappings)                       # writes back, atomic (tmp + rename)
add({id, label, url})                # appends, returns provider
remove(id)                           # removes + deletes secret
reorder(ids[])                       # updates display.order
getApiKey(id) → string | null        # SecretStorage
setApiKey(id, key)                   # SecretStorage
deleteApiKey(id)
# All operations preserve other providers
```

### Module: `extension/fetcher.js` (~120 lines)

```
fetchAndCache(provider) →
  - Resolve ${apiKey} in headers via providers.getApiKey(id)
  - HTTPS request (method from mapping, or default GET if no mapping yet) with 10s timeout
  - On success (2xx): save raw body to ~/.custom-api-usage/raw/<id>.json
  - On error (4xx/5xx): save error body to ~/.custom-api-usage/raw/<id>_error.json for debugging
  - Return parsed JSON (or throw with status code + body excerpt)

extract(provider, raw) →
  - Evaluate JSONPath for each mapping field
  - Apply transform: percent.invert → 100 - x
  - Apply unit: resetTime.unit === 's' → * 1000
  - Return {used, total, percent, resetTimeMs}

renderStatusBar(item, extracted, provider) →
  - Format (normal):    "⚡ <label> <pct>% (<timeLeft>)"
  - Format (fallback):  "⚡ <label> <used>/<total>"   (when percent is null but used+total exist)
  - Format (minimal):   "⚡ <label>"                  (when only partial data available)
  - Color: green < 75%, yellow 75-89%, red 90%+
  - Click → customApiUsage.showDetails
```

### Status Bar Rendering

For provider `example-api` with `display.showPercent: true, showTimeLeft: true`:

```
⚡ Example API 45% (2h30m)           ← normal (percent + time available)
⚡ Example API 7% (1h26m)            ← low usage
⚡ Example API 450/1000              ← fallback (percent null, used+total available)
⚡ Example API                       ← minimal (only partial data)
⚡ z.ai 80% (45m)                    ← second provider
🔑 Example API: Set API Key          ← secret missing
⚠️ Example API: Needs analyze        ← no mapping or mapping incomplete
⚠️ Example API: Error                ← fetch failed (click = retry)
```

### Max Visible Items

To prevent status bar crowding, a maximum of **3 providers** are shown as individual items. If there are more than 3, the first 2 plus an aggregate item are shown:

```
⚡ Provider A 45% (2h)  ⚡ Provider B 80% (1h)  ⚡ +2 more
```

Clicking the aggregate item opens the detail view showing all providers. The `display.order` field determines which providers get individual slots (lowest order numbers first). Reordering via `reorderProviders` lets users control which providers appear directly in the status bar.

### Status Bar Lifecycle

- **Per provider**, not global timer → each can have its own `refreshIntervalMinutes`.
- **Stagger** first fetch (provider 1 at t=0, provider 2 at t=10s, provider 3 at t=20s) to avoid burst. Staggering respects each provider's own interval — a provider with a 60-min interval still only fetches every 60 min regardless of stagger offset.
- On **`mappings.json` change** (file watch) → reload providers (debounced 2s).
- On **error** → set error text + color, schedule next attempt at the normal interval.

#### Atomic Writes on Windows

`save()` writes to `mappings.json.tmp`, then renames over the target. On Windows, `fs.rename()` fails if the target already exists — so the implementation must **unlink the target first** (or use `fs.copyFile` + `fs.unlink`). The `.tmp` file is always cleaned up on extension deactivate. If a stale `.tmp` is found on startup (from a previous crash), it is deleted — the original `mappings.json` is the source of truth.

#### File Watcher Cross-Platform Caution

VSCode's `createFileSystemWatcher` works reliably for workspace files, but watching `~/.custom-api-usage/mappings.json` (a path outside the workspace) may behave differently across platforms:
- **macOS/Linux:** Generally reliable with home-directory paths.
- **Windows:** May require the full absolute path (e.g., `C:\Users\...\.custom-api-usage\mappings.json`).
- **WSL remote:** Path translation may interfere — test early.

Fallback: if the file watcher fails to initialize, the extension logs a warning and reloads mappings on every refresh cycle instead (slightly less responsive but never broken).

### Commands in Detail

| Command | UX flow |
|---|---|
| `addProvider` | Input: label → input: URL → input: API key (masked) → **(uses default GET + Bearer config to fetch raw)** → "Run /custom-api-usage-analyze to complete" → status bar shows `⚠️ Needs analyze`. Advanced: user can optionally set `method` and `headers` in the wizard for non-standard APIs. |
| `setApiKey` | Quick pick provider → input new key (masked) → refresh |
| `refresh` | Refresh all providers in parallel |
| `showDetails` | Webview: list of providers with bar+percent+time-left + raw JSON (collapsible per provider) |
| `reorderProviders` | Quick pick with current order → user picks new order → save |
| `exportMappings` | Read `mappings.json` → copy to clipboard + show "Saved to clipboard" notification |
| `importMappings` | Read clipboard → validate schema → confirm overwrite → save |
| `removeProvider` | Quick pick → confirm → remove from mapping + delete secret + dispose status bar item |

### Per-Provider Status States

| State | Display |
|---|---|
| No API key | `🔑 <label>: Set API Key` |
| No mapping (just added) | `⚠️ <label>: Needs analyze` |
| Mapping invalid | `⚠️ <label>: Bad mapping` |
| Fetch error (4xx/5xx/timeout) | `⚠️ <label>: Error` (click = retry) |
| Mapping evaluated but all fields null | `⚠️ <label>: No data` (mapping paths don't match — re-analyze) |
| OK with data | `⚡ <label> 45% (2h30m)` (or as configured) |

---

## 8. Error Handling Matrix

| Layer | Failure | Behavior | Recovery |
|---|---|---|---|
| **Provider load** | `mappings.json` missing | Treat as `providers: []` → status bar shows "🔑 Add a provider" hint | `addProvider` command |
| **Provider load** | `mappings.json` invalid JSON | Show error notification, treat as empty | Manual fix or `importMappings` |
| **Provider load** | `mapping.version` mismatch | Skip that provider, warn | User updates manually |
| **Provider load** | Stale `.tmp` file from crash | Delete `.tmp`, use original `mappings.json` | Automatic on startup |
| **Secret** | API key missing | Status bar: `🔑 <label>: Set API Key` | `setApiKey` command |
| **Fetch** | DNS / network / timeout | Status bar: `⚠️ <label>: Error` (click = retry) | Next interval or manual `refresh` |
| **Fetch** | HTTP 4xx/5xx | Same as above, with HTTP code in tooltip. Error body saved to `raw/<id>_error.json` for debugging. | Same |
| **Fetch** | Non-JSON response | Status bar: `⚠️ <label>: Bad response` | Re-fetch |
| **Fetch** | Default GET fails (API needs POST) | `⚠️ <label>: Error` — user must hand-edit `mappings.json` or paste raw manually | See Default Fetch Behavior edge case |
| **Extract** | JSONPath returns no value | Field is `null` in extracted result | `⚠️ <label>: No data` → user re-analyzes |
| **Extract** | JSONPath returns multiple values | Take first (with warning logged) | User re-analyzes |
| **Extract** | `percent` with `invert` and value > 100 or < 0 | Clamp to 0-100, log warning | User re-analyzes |
| **Extract** | `resetTime` in the past | Show "(expired)" instead of "(2h30m)" | Auto-resolves at next refresh |
| **Extract** | All 4 fields return null | Status bar shows `⚠️ <label>: No data` | User re-analyzes mapping |
| **Extract** | `percent` null but `used`+`total` exist | Fallback display: `⚡ <label> <used>/<total>` | Works as-is; user may still re-analyze |
| **Secret** | SecretStorage write fails | Show error notification, don't cache | Retry |
| **Config write** | Concurrent write (skill + extension) | Skill re-reads before write, warns if provider list changed. Extension uses atomic tmp+rename. | User confirms or retries |
| **Config write** | Disk full / permission denied | Show error notification, keep in-memory state | Retry on next save |
| **File watcher** | `createFileSystemWatcher` fails (path outside workspace) | Log warning, fall back to reload-on-refresh-cycle | Automatic; slightly less responsive |
| **Skill** | Raw file missing | Refuse to write, instruct user to run `addProvider` first | — |
| **Skill** | Raw file invalid JSON | Refuse to write | User re-fetches |
| **Skill** | User picks no candidate for a field | Skip that field in mapping (use null) | Re-run skill |
| **Skill** | Proposed mapping fails schema validation | Show error, retry candidate selection | — |

### Defensive Principles

1. **One bad provider must not break others** — fetch in parallel, isolate errors per provider.
2. **Atomic config writes** — write to `mappings.json.tmp`, rename; never partial writes.
3. **No secrets in logs** — log paths, status codes, but never API key contents.
4. **Graceful degradation** — `percent` alone is enough to show status bar; don't require all 4 fields.

---

## 9. Testing Strategy

### Unit Tests (Node.js, no VSCode required)

**`fetcher.js`:**
```js
extract(provider, sampleRaw)
// Case 1:  example response → percent 45, used 45, total 100, resetTime future
// Case 2:  invert: true → 100 - remaining_percent
// Case 3:  unit: 's' → multiplied by 1000
// Case 4:  path returns null → field is null
// Case 5:  path returns multiple → first wins
// Case 6:  header template resolves ${apiKey}
// Case 7:  all 4 fields null → returns {used:null, total:null, percent:null, resetTimeMs:null}
// Case 8:  percent=null, used=450, total=1000 → percent still null (no auto-calc)
// Case 9:  percent with invert:true, value=110 → clamped to 0 after invert
// Case 10: resetTime in past (timestamp < Date.now()) → resetTimeMs < 0 (caller shows "expired")
// Case 11: ${apiKey} appears multiple times in headers → all instances replaced
// Case 12: apiKey contains special chars ($, {, }) → replaced literally, no recursive resolution

renderStatusBar(item, extracted, provider)
// Case 13: percent=45, timeLeft=9000000 → "⚡ <label> 45% (2h30m)"
// Case 14: percent=null, used=450, total=1000 → "⚡ <label> 450/1000"
// Case 15: percent=null, used=null, total=1000 → "⚡ <label>"
// Case 16: percent=92 → color=red (errorForeground/errorBackground)
// Case 17: percent=80 → color=yellow (warningForeground/warningBackground)
// Case 18: percent=50 → color=undefined (theme default)
```

**`providers.js`:**
```js
load() / save() round-trip
add() / remove() / reorder() preserve other providers
getApiKey() returns null when not set
save() is atomic (no partial writes on crash)
save() handles Windows rename-over-existing (unlink first)
save() cleans up stale .tmp on failure
load() returns {version:1, providers:[]} when file missing
load() returns {version:1, providers:[]} + warning when file is invalid JSON
load() skips providers with version mismatch, keeps valid ones
reorder() with unknown id → no-op + log warning
```

### Integration Tests (manual, documented in README)

| Scenario | Expected |
|---|---|
| Install extension, run `addProvider` | Status bar shows "⚠️ Needs analyze" |
| Run `/custom-api-usage-analyze <id>` | Mapping written, status bar updates to `⚡ <label> 45% (2h30m)` |
| Add 2nd provider, run skill | Both status bar items visible, in `display.order` order |
| Run `exportMappings`, paste to clipboard on another machine, run `importMappings` | Status bar rebuilds (after re-entering API keys) |
| Provider's API goes down | Status bar shows error; other providers unaffected |
| Edit `mappings.json` while VSCode is open | Reload on next refresh interval |
| Remove provider via command | Status bar item disappears, secret deleted |
| Add 5 providers | Only 3 visible in status bar (2 individual + `⚡ +3 more` aggregate); detail view shows all 5 |
| API returns no percent field but has used/total | Status bar shows fallback `450/1000` format |
| API returns only partial data (used only) | Status bar shows minimal `⚡ <label>` format |
| `mappings.json` hand-edited with wrong JSONPath | Status bar: `⚠️ <label>: No data` → re-run skill |
| Provider API requires POST (not GET) | Default fetch fails → `⚠️ <label>: Error` → manually set method in `mappings.json` → refresh works |

#### Cross-Platform Smoke Tests

| Platform | What to verify |
|---|---|
| **Windows** | Atomic save (rename over existing), file watcher on `C:\Users\...`, SecretStorage works |
| **macOS** | File watcher on `~/.custom-api-usage/`, `~` path resolution |
| **Linux** | Same as macOS, plus snap/flatpak sandboxing doesn't block SecretStorage |
| **WSL remote** | Path translation for `~/.custom-api-usage/` — file watcher may need absolute Windows path |

### No Automated UI Tests

VSCode extension testing is heavy and not worth it for this scope.

---

## 10. Migration from `minimax-usage`

Since this is a new repo, no migration tooling is needed:

1. **Copy** this design doc → new repo.
2. **New code** — no carry-over from `extension.js` (it's hardcoded to one provider).
3. **Old repo** (`minimax-usage`) keeps its last release as-is; no further updates.
4. **New repo name:** `custom-api-usage` (per user direction).
5. **New display name:** "Custom API Usage".
6. **Renamed identifiers** (all `minimaxUsage` / `minimax` references gone):
   - Package: `custom-api-usage`
   - Display: `Custom API Usage`
   - Commands/settings prefix: `customApiUsage.*`
   - Secret key: `customApiUsage.providers.<id>.apiKey`
   - User dir: `~/.custom-api-usage/`
   - Skill dir: `.claude/skills/custom-api-usage-analyze/`
   - Status bar label: provider's own `label` from mapping (no hardcoded "MiniMax")

---

## 11. Open Questions

### Resolved (during design review — 2026-06-06)

1. ✅ **Default fetch before mapping** — `GET` + `Bearer ${apiKey}`. Edge case for POST-only APIs documented in §3.
2. ✅ **Max visible status bar items** — 3 (2 individual + aggregate). User controls visibility via `display.order`.
3. ✅ **Fallback display when percent is null** — `used/total` raw numbers, or minimal label. Documented in §7.
4. ✅ **Concurrent writes** — Optimistic concurrency (skill re-reads before write, extension uses atomic tmp+rename). Documented in §6 and §7.
5. ✅ **Error response caching** — Save to `raw/<id>_error.json` for debugging. Documented in §3 and §8.
6. ✅ **POST body support** — Deferred to v2. `body` field reserved in schema. Documented in §2 and §5.
7. ✅ **Per-provider color thresholds** — Deferred to v2. Global 75%/90% for v1. Documented in §2.
8. ✅ **Atomic writes on Windows** — Unlink target before rename. Documented in §7.
9. ✅ **jsonpath-plus dependency** — Explicitly listed with size/version. Documented in §5.

### Still Open (implementation-level)

- **Exact JSON Schema** (`mapping.schema.json`) — to be written during implementation.
- **Sample raw responses for unit tests** — need 2-3 real API response shapes for test fixtures.
- **`resetTime.unit` auto-detection** — whether to auto-detect by magnitude (heuristic: > 1e12 → ms, else → s) or always require explicit `unit`. Current leaning: **auto-detect with explicit override**.
- **Schema validation ownership** — whether the skill should also validate against the JSON Schema before writing, or if the extension should be the sole validator. Current leaning: **both** (skill validates its output, extension re-validates on load — defense in depth).
