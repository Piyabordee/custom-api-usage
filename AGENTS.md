# AGENTS.md — custom-api-usage

## Project Overview

Generic, multi-provider VSCode extension that displays token/quota usage from any JSON API in the status bar. User adds providers (URL + key), a Claude Code skill generates the JSONPath mapping, extension auto-refreshes.

## Architecture

```
extension/
├── extension.js      # VSCode entry, commands, status bar lifecycle
├── providers.js      # mappings.json CRUD, SecretStorage
└── fetcher.js        # HTTPS fetch + JSONPath extract + status bar render

.claude/skills/custom-api-usage-analyze/
├── SKILL.md          # analyzer instructions
└── templates/
    └── mapping.schema.json
```

No build step. Pure Node.js + VSCode API.

## Key Decisions

- **JSONPath** (via `jsonpath-plus`) as the extraction primitive. Familiar, easy to hand-edit.
- **mappings.json** at `~/.custom-api-usage/` is the source of truth (syncable, no secrets).
- **SecretStorage** for API keys, never written to disk in plaintext.
- **Per-provider** refresh timers, staggered to avoid burst.
- **Atomic config writes** — `mappings.json.tmp` + rename.
- **No external test deps** — use Node's built-in `node:test`.

## API Contracts

- `mappings.json` version `1`. Skill refuses to write if mismatch.
- 4 fixed fields: `used`, `total`, `percent` (with optional `invert`), `resetTime` (with `unit: "ms"|"s"`).
- Status bar format: `⚡ <label> <pct>% (<timeLeft>)` — color thresholds: green < 75, yellow 75-89, red 90+.

## Commands

| Command | What it does |
|---|---|
| `customApiUsage.addProvider` | Wizard: label, URL, key |
| `customApiUsage.setApiKey` | Replace stored key |
| `customApiUsage.refresh` | Re-fetch all |
| `customApiUsage.showDetails` | Webview with all providers |
| `customApiUsage.reorderProviders` | Quick pick to reorder |
| `customApiUsage.removeProvider` | Remove + delete secret |
| `customApiUsage.exportMappings` | Copy to clipboard |
| `customApiUsage.importMappings` | Paste from clipboard |

## Configuration

None at the VSCode settings level. All config is in `mappings.json` to keep it syncable.

## Test

```bash
npm test
```

Runs `node --test test/`. Covers `providers.js` (CRUD + atomic write) and `fetcher.js` (extract, render, fetchAndCache with mock HTTP server).

## Modification Guidelines

- Keep modules focused. `providers.js` is data only. `fetcher.js` is HTTP + extraction + render. `extension.js` is VSCode glue.
- Never log API keys.
- Status bar text must always show *some* state (never blank).
- Adding a new field to the mapping schema → bump `version` in `mapping.schema.json`.
