# Custom API Usage

Display token/quota usage from **any JSON API** in the VS Code status bar.

## What is this?

A generic, multi-provider VSCode extension. Add any quota/usage-style API as a "provider" by supplying:
1. A **URL** (e.g., `https://api.z.ai/api/coding/paas/v4`)
2. An **API key** (stored securely in VSCode SecretStorage)

A Claude Code skill analyzes the first response and generates a **JSONPath mapping** that tells the extension which fields are "used / total / percent / reset time".

Multiple providers are supported simultaneously, with reorderable status bar items.

## Why?

Existing AI-usage extensions are hardcoded to one provider. This one is generic — if your API returns JSON, this extension can show it.

## Features

- ✅ Any JSON API (Bearer auth default, custom headers via mapping)
- ✅ N providers, each with its own status bar item
- ✅ Reorderable display order
- ✅ Per-provider refresh interval
- ✅ Mapping config syncable across machines (plain JSON)
- ✅ API keys never leave VSCode SecretStorage

## Setup

1. Install the extension
2. Run **Custom API Usage: Add Provider**
3. Enter label, URL, API key
4. Run `/custom-api-usage-analyze` in Claude Code to generate the mapping
5. Status bar updates automatically

## Commands

| Command | Description |
|---|---|
| `Add Provider` | Wizard: label, URL, key → fetches and caches raw response |
| `Set API Key` | Replace stored key for a provider |
| `Refresh` | Re-fetch all providers |
| `Show Details` | Webview with all providers + raw JSON |
| `Reorder Providers` | Change display order |
| `Remove Provider` | Remove from mapping + delete secret |
| `Export Mappings` | Copy mappings.json to clipboard (for sync to other machines) |
| `Import Mappings` | Paste mappings.json from clipboard |

## Storage

- `~/.custom-api-usage/mappings.json` — provider list, URLs, mappings (syncable, **no secrets**)
- `~/.custom-api-usage/raw/<id>.json` — last raw response (regenerated on every fetch)
- VSCode SecretStorage — API keys (machine-local)

## Skill

See [`.claude/skills/custom-api-usage-analyze/SKILL.md`](.claude/skills/custom-api-usage-analyze/SKILL.md).

## License

MIT
