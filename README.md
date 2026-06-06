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

## Manual Integration Tests

After installing the extension in VSCode (`code --install-extension custom-api-usage-0.1.0.vsix` and reload window), verify these scenarios:

| # | Scenario | Expected |
|---|---|---|
| 1 | First run, no providers | Status bar: empty (or "🔑 Add a provider" hint if implemented) |
| 2 | Run **Add Provider** for any real API | Status bar shows `⚠️ <label>: Needs analyze` |
| 3 | Run `/custom-api-usage-analyze <id>` in Claude Code | Mapping written, status bar updates to `⚡ <label> 45% (2h30m)` |
| 4 | Add 2nd provider, run skill | Both status bar items visible, in `display.order` order |
| 5 | Run **Export Mappings** | `mappings.json` content visible in clipboard |
| 6 | Run **Import Mappings** with that clipboard | Toast: "N provider(s) imported" |
| 7 | Provider's API goes down | Status bar shows `⚠️ <label>: Error`; other providers unaffected |
| 8 | Edit `mappings.json` while VSCode is open | Reload on next refresh interval (or manually trigger **Refresh**) |
| 9 | Run **Remove Provider** | Status bar item disappears, secret deleted |
| 10 | Run **Reorder Providers** | Status bar items swap order |
