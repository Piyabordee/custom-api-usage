# Changelog

All notable changes to **Custom API Usage** are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned for v0.3.0
- `POST` request bodies with `${apiKey}` and `${timestamp}` templates
- Per-provider color thresholds (override the global 75% / 90%)
- Custom status bar label templates
- Multi-account support per provider (single API key per provider remains in v0.2.0)

## [0.2.0] — 2026-06-09

### Highlights
- **One-click companion skill install.** Marketplace users no longer have to manually copy the analyzer skill into `~/.claude/skills/` — run **Custom API Usage: Install Companion Skill** and pick user-scope or workspace-scope. Skill is bundled in the extension, schema is bundled, and overwrite is guarded by a confirmation prompt.
- **Raw cache auto-primes on add.** Adding a provider now fetches the API once so `raw/<id>.json` is populated before the user runs the analyzer skill. If the fetch fails (bad key, network down) the provider is still saved and surfaced as "Needs analyze" with a warning toast — Refresh retries the fetch later.
- **`refreshOne` self-heals.** If the raw cache is missing while the mapping is also missing, `refreshOne` will fetch raw on its own so the user can fix credentials and re-run the skill without re-adding the provider.

### Added
- **Bundled skill files in extension.** `extension/skill/SKILL.md` + `extension/skill/templates/mapping.schema.json` ship inside the VSIX. The install command copies these into the user's Claude Code skills slot.
- **`installSkill({ sourceDir, destDir, overwrite })`** in `extension/skill-installer.js` — pure file-copy helper, no VSCode API surface, fully testable.
- **`primeRawCache({ provider, customDir, getApiKey, fetchAndCache })`** in `extension/raw-cache.js` — best-effort fetch helper, never throws, returns `{ ok, error? }`.
- **2 new commands** (now 10 total): `Custom API Usage: Install Companion Skill`, `Custom API Usage: Provider Menu`.
- **Status bar click → provider menu.** Clicking the status bar opens a quick-pick with per-provider actions (Refresh / Set API Key / Show Details / Reorder / Remove) and global actions (Add Provider / Install Companion Skill / Export / Import). No more guessing which command to run.
- **README Setup flow updated** to recommend the new one-click install instead of hand-copying files.

### Changed
- **VSIX bundle is now lean.** `.vscodeignore` excludes `.claude/**` (the development copy of the skill), `docs/**` (internal specs/plans), `.remember/**`, `test/**`, and `*.log`. Marketplace install is ~340 KB instead of ~700 KB.
- **`addProvider` success toast** now branches on whether the priming fetch succeeded, telling the user either to run the skill or to fix credentials and Refresh.

### Fixed
- **Raw cache empty after `addProvider`.** Previously, after adding a provider the user had to click Refresh once before `/custom-api-usage-analyze` could find data. Now the first fetch is part of the add flow.
- **Raw cache empty after `Refresh` on a provider that has no mapping.** Previously, Refresh bailed out early when mapping was missing and never fetched. Now it fetches raw first, then shows the "Needs analyze" hint.
- **Dedupe of the success toast** in `extension.js` — previously a single add flow could fire `showInformationMessage` twice; refactored to one branchy message that handles both fetch-ok and fetch-failed cases.
- **`fs/promises` hoisted** to a top-level require in `extension.js` — was being `require`'d inside a hot path.

### Security
- **No change to the security model from v0.1.0.** API keys still live in VSCode SecretStorage only; `mappings.json` still contains zero secrets and is safe to sync.

### Test Coverage
- **37 unit tests, all passing** (`npm test`) — up from 30 in v0.1.0
  - `providers.test.js`: 13 tests (unchanged)
  - `fetcher.test.js`: 12 tests (unchanged)
  - `fetcher.http.test.js`: 5 tests (unchanged)
  - `skill-installer.test.js`: 5 tests (new — covers `installSkill` happy path, missing dest, overwrite=false skip, overwrite=true replace, missing sourceDir)
  - `raw-cache.test.js`: 2 tests (new — covers `primeRawCache` success and best-effort failure)

### Known Limitations
- **`POST` request bodies still not supported** — postponed from v0.2.0, now planned for v0.3.0
- **Color thresholds still global (75% / 90%)** — per-provider overrides postponed to v0.3.0
- **Single API key per provider** — multi-account requires schema change, planned for v0.3.0
- **No automated UI tests** — VSCode extension testing is heavy for this scope; manual smoke test covers the new `installCompanionSkill` flow (reinstall VSIX, run command, verify file at `~/.claude/skills/custom-api-usage-analyze/SKILL.md`)

### Dependencies
- Runtime: [`jsonpath-plus`](https://www.npmjs.com/package/jsonpath-plus) `^10.0.0` (unchanged)
- Dev: [`@vscode/vsce`](https://github.com/microsoft/vscode-vscode) `^3.0.0` (unchanged)
- Tests: **zero external deps** (unchanged)

[0.2.0]: https://github.com/Piyabordee/custom-api-usage/releases/tag/v0.2.0

### Highlights
- **For developers juggling multiple AI providers.** Stop maintaining one extension per vendor — wire up your quota endpoints once, switch providers freely.
- **Self-hosted, no trust required.** You supply the URL, you supply the key, you can read every line of the source. No third-party telemetry, no opaque callbacks to a vendor server — your API keys never leave VSCode SecretStorage.
- **Configuration generated by AI, not hand-written JSONPath.** Point the `/custom-api-usage-analyze` Claude Code skill at your API's raw response and it proposes the mapping interactively. No fiddling with path expressions.
- **One extension, any JSON API.** If the response is JSON and contains numbers, this extension can show it in your status bar.

### Added
- **Multi-provider status bar items.** Add N quota/usage APIs and see N independent status bar entries, each with its own refresh interval and color threshold.
- **Generic JSONPath mapping.** Supports 4 fixed fields (`used`, `total`, `percent`, `resetTime`) with `invert` and `unit` transforms. Works with any JSON API — not locked to a vendor.
- **Claude Code skill: `/custom-api-usage-analyze`.** Reads the cached raw response, walks the JSON, and proposes a mapping via interactive Q&A. Writes to `mappings.json` atomically.
- **8 commands:** Add Provider, Set API Key, Refresh, Show Details, Reorder Providers, Remove Provider, Export Mappings, Import Mappings.
- **Status bar webview** (`Show Details`) with per-provider cards, progress bars, and raw JSON inspector.
- **Atomic config writes** (`mappings.json.tmp` + unlink + rename) — survives crashes on Windows.
- **Status bar states:** Loading, Needs Analyze, Needs API Key, Error, and OK with fallback `used/total` rendering when `percent` is null.
- **Color thresholds:** Green (< 75%), Yellow (75–89%), Red (≥ 90%) via ThemeColor.

### Security
- **API keys stored in VSCode SecretStorage** under `customApiUsage.providers.<id>.apiKey` — never written to `mappings.json` or `raw/`.
- **No secrets in `mappings.json`** — syncable across machines via dotfiles without encryption.
- **Raw cache only on successful fetch** — error responses are not cached as `raw/<id>.json` (would mislead the analyzer skill).

### Test Coverage
- 30 unit tests, all passing (`npm test`)
- `providers.js`: 13 tests (CRUD, atomic write, SecretStorage injection)
- `fetcher.js`: 12 tests (extract with JSONPath, invert, unit; renderStatusBar with color thresholds and expired state)
- `fetcher.http.test.js`: 5 tests (mock HTTP server: success, header template resolution, 4xx/5xx, non-JSON, no-cache-on-error)
- Manual integration scenarios documented in `README.md` § Manual Integration Tests

### Known Limitations
- **Global 75% / 90% color thresholds** — not per-provider configurable (planned for v0.2.0)
- **GET only** — no `POST` request bodies in v1
- **No automated UI tests** — VSCode extension testing is heavy for this scope; manual scenarios in README
- **Single API key per provider** — multi-account support requires schema change

### Dependencies
- Runtime: [`jsonpath-plus`](https://www.npmjs.com/package/jsonpath-plus) `^10.0.0` (only)
- Dev: [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce) `^3.0.0` (packaging only)
- Tests: **zero external deps** — uses Node's built-in `node:test`

[0.1.0]: https://github.com/Piyabordee/custom-api-usage/releases/tag/v0.1.0
