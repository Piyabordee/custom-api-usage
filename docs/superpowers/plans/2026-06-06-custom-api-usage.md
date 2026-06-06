# Custom API Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a generic, multi-provider VSCode extension (`custom-api-usage`) where users add their own API URL + key, run a Claude Code skill to generate a JSONPath mapping, and the extension renders usage percentage + time-left in reorderable status bar items.

**Architecture:** Light modular split — `extension/extension.js` (VSCode entry) coordinates with `extension/providers.js` (config CRUD + SecretStorage) and `extension/fetcher.js` (HTTP + JSONPath extraction). Mapping config lives in `~/.custom-api-usage/mappings.json` (syncable, no secrets). API keys live in VSCode SecretStorage (machine-local). A Claude Code skill at `.claude/skills/custom-api-usage-analyze/` analyzes raw responses and writes the mapping.

**Tech Stack:** Node.js, VSCode Extension API v1.85+, `jsonpath-plus` (JSONPath evaluation), `node:test` (built-in test runner, no deps), `@vscode/vsce` (packaging).

**Repo:** New repo at `C:\dev\custom-api-usage\` (sibling to current `minimax-usage`). This plan is saved in the old repo for now and gets copied over as part of Task 1.

**Reference Spec:** `docs/superpowers/specs/2026-06-06-custom-api-usage-design.md` (copy to new repo in Task 1).

---

## File Structure

```
C:\dev\custom-api-usage\
├── extension/
│   ├── extension.js              # VSCode entry, commands, status bar lifecycle
│   ├── providers.js              # mappings.json CRUD, SecretStorage
│   └── fetcher.js                # HTTPS request + raw cache + JSONPath extraction + status bar render
├── .claude/skills/custom-api-usage-analyze/
│   ├── SKILL.md                  # Claude instructions for the analyzer
│   └── templates/
│       └── mapping.schema.json   # JSON Schema for mapping validation
├── docs/
│   └── superpowers/
│       ├── specs/2026-06-06-custom-api-usage-design.md
│       └── plans/2026-06-06-custom-api-usage.md  # this file
├── test/
│   ├── providers.test.js         # tests for extension/providers.js
│   ├── fetcher.test.js           # tests for extract() + renderStatusBar()
│   └── fetcher.http.test.js      # tests for fetchAndCache() with mock server
├── package.json
├── README.md
├── AGENTS.md
├── LICENSE
├── .gitignore
└── .vscodeignore
```

**Responsibilities per file:**

- `extension/extension.js` — VSCode lifecycle: register commands, create status bar items, schedule refresh timers, file watcher
- `extension/providers.js` — `load()`, `save()` (atomic), `add()`, `remove()`, `reorder()`, `getApiKey()`, `setApiKey()`, `deleteApiKey()` — pure data + SecretStorage
- `extension/fetcher.js` — `fetchAndCache()` (HTTP), `extract()` (JSONPath), `renderStatusBar()` (pure function returning text + colors)
- `test/*` — `node:test` based, no framework deps

User-level runtime files (created by extension on first run, not in repo):

```
~/.custom-api-usage/
├── mappings.json
└── raw/
    ├── <provider-id>.json      # last successful raw response
    └── <provider-id>_error.json # last error response (for debugging)
```

---

## Conventions

- **Commit often** — every task ends with a commit. Use Conventional Commits (`feat:`, `test:`, `chore:`, `docs:`).
- **TDD for unit-testable code** — providers.js + fetcher.js (extract, render) follow red-green-refactor. Skip TDD for VSCode command glue code (manual test in VSCode).
- **No external test deps** — use Node's built-in `node:test` + `node:assert`.
- **Test command:** `node --test test/` (run from repo root).
- **Manual VSCode test:** `vsce package` then `code --install-extension <file>.vsix` then reload window.

---

## Phase 0: Repo Scaffolding

### Task 1: Create new repo

**Files:**
- Create: `C:\dev\custom-api-usage\` (entire dir, empty except `.git`)

- [ ] **Step 1: Create the directory and initialize git**

```bash
cd /c/dev
mkdir custom-api-usage
cd custom-api-usage
git init
git checkout -b main
```

- [ ] **Step 2: Copy design spec into new repo**

```bash
mkdir -p docs/superpowers/specs
cp /c/dev/minimax-usage/docs/superpowers/specs/2026-06-06-custom-api-usage-design.md docs/superpowers/specs/
```

- [ ] **Step 3: Copy this plan into new repo**

```bash
mkdir -p docs/superpowers/plans
cp /c/dev/minimax-usage/docs/superpowers/plans/2026-06-06-custom-api-usage.md docs/superpowers/plans/
```

- [ ] **Step 4: Set local git user (if not already set globally)**

```bash
git config user.name "Piyabordee"
git config user.email "piyabordee@users.noreply.github.com"
```

- [ ] **Step 5: Initial commit (empty for now, will have content after Task 2)**

```bash
git add docs/
git commit -m "docs: import design spec and implementation plan"
```

Expected: 2 files committed, working tree clean.

---

### Task 2: Create package.json

**Files:**
- Create: `package.json`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "custom-api-usage",
  "displayName": "Custom API Usage",
  "description": "Display token/quota usage from any JSON API in the VSCode status bar",
  "version": "0.1.0",
  "publisher": "custom-api-usage",
  "license": "MIT",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "keywords": ["usage", "quota", "token plan", "status bar", "api", "jsonpath"],
  "activationEvents": ["onStartupFinished"],
  "main": "./extension/extension.js",
  "repository": {
    "type": "git",
    "url": "https://github.com/Piyabordee/custom-api-usage"
  },
  "scripts": {
    "test": "node --test test/",
    "package": "vsce package"
  },
  "dependencies": {
    "jsonpath-plus": "^10.0.0"
  },
  "devDependencies": {
    "@vscode/vsce": "^3.0.0"
  },
  "contributes": {
    "commands": [
      { "command": "customApiUsage.addProvider",      "title": "Custom API Usage: Add Provider" },
      { "command": "customApiUsage.setApiKey",        "title": "Custom API Usage: Set API Key" },
      { "command": "customApiUsage.refresh",          "title": "Custom API Usage: Refresh All" },
      { "command": "customApiUsage.refreshProvider",  "title": "Custom API Usage: Refresh Provider" },
      { "command": "customApiUsage.showDetails",      "title": "Custom API Usage: Show Details" },
      { "command": "customApiUsage.reorderProviders", "title": "Custom API Usage: Reorder Providers" },
      { "command": "customApiUsage.removeProvider",   "title": "Custom API Usage: Remove Provider" },
      { "command": "customApiUsage.exportMappings",   "title": "Custom API Usage: Export Mappings" },
      { "command": "customApiUsage.importMappings",   "title": "Custom API Usage: Import Mappings" }
    ]
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: initialize package.json with jsonpath-plus dep"
```

---

### Task 3: Create README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

```markdown
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
| `Refresh All` | Re-fetch all providers |
| `Refresh Provider` | Re-fetch a single provider |
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

### Task 4: Create AGENTS.md

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: Write AGENTS.md**

```markdown
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
- **Max 3 visible** status bar items — 2 individual + aggregate (`⚡ +N more`) when > 3 providers.
- **Fallback display** — `used/total` raw numbers when percent is unavailable.
- **Atomic config writes** — `mappings.json.tmp` + unlink target + rename (required for Windows).
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
| `customApiUsage.refreshProvider` | Re-fetch one provider |
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
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add AGENTS.md"
```

---

### Task 5: Create LICENSE, .gitignore, .vscodeignore

**Files:**
- Create: `LICENSE`
- Create: `.gitignore`
- Create: `.vscodeignore`

- [ ] **Step 1: Write LICENSE (MIT)**

```
MIT License

Copyright (c) 2026 Piyabordee

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write .gitignore**

```
node_modules/
*.vsix
.DS_Store
*.log
.vscode-test/
.vscode/
```

- [ ] **Step 3: Write .vscodeignore**

```
node_modules/**
.vscode/**
.gitignore
.vscodeignore
test/**
docs/superpowers/plans/**
*.log
```

- [ ] **Step 4: Commit**

```bash
git add LICENSE .gitignore .vscodeignore
git commit -m "chore: add LICENSE, .gitignore, .vscodeignore"
```

---

### Task 6: Create directory structure

**Files:**
- Create: `extension/` (with `.gitkeep`)
- Create: `test/` (with `.gitkeep`)
- Create: `.claude/skills/custom-api-usage-analyze/templates/` (with `.gitkeep`)

- [ ] **Step 1: Create directories with placeholders**

```bash
mkdir -p extension test
mkdir -p .claude/skills/custom-api-usage-analyze/templates
touch extension/.gitkeep test/.gitkeep .claude/skills/custom-api-usage-analyze/templates/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add extension/.gitkeep test/.gitkeep .claude/skills/custom-api-usage-analyze/templates/.gitkeep
git commit -m "chore: create directory structure"
```

---

## Phase 1: providers.js (data layer, TDD)

### Task 7: Failing test for load() and save()

**Files:**
- Create: `test/providers.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Helper: isolated temp dir for each test
function tempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cau-test-'));
  const customDir = path.join(dir, '.custom-api-usage');
  fs.mkdirSync(customDir);
  return { home: dir, customDir };
}

test('load() returns empty providers when mappings.json missing', () => {
  const { customDir } = tempHome();
  const { load } = require('../extension/providers');
  const result = load(customDir);
  assert.equal(result.version, 1);
  assert.deepEqual(result.providers, []);
});

test('save() then load() round-trips a mapping', () => {
  const { customDir } = tempHome();
  const { load, save } = require('../extension/providers');
  const mappings = {
    version: 1,
    providers: [{
      id: 'example',
      label: 'Example',
      url: 'https://api.example.com/v1/usage',
      method: 'GET',
      headers: { Authorization: 'Bearer ${apiKey}' },
      mapping: {
        used:      { path: '$.data.used' },
        total:     { path: '$.data.total' },
        percent:   { path: '$.data.remaining_pct', invert: true },
        resetTime: { path: '$.data.reset_at', unit: 's' }
      },
      display: { order: 1, showPercent: true, showTimeLeft: true },
      refreshIntervalMinutes: 5
    }]
  };
  save(customDir, mappings);
  const loaded = load(customDir);
  assert.deepEqual(loaded, mappings);
});

test('save() is atomic (uses .tmp + rename)', () => {
  const { customDir } = tempHome();
  const { save } = require('../extension/providers');
  save(customDir, { version: 1, providers: [] });
  // .tmp file should NOT exist after save
  assert.equal(fs.existsSync(path.join(customDir, 'mappings.json.tmp')), false);
  // main file should exist
  assert.equal(fs.existsSync(path.join(customDir, 'mappings.json')), true);
});

test('load() throws on invalid JSON', () => {
  const { customDir } = tempHome();
  fs.writeFileSync(path.join(customDir, 'mappings.json'), '{ bad json');
  const { load } = require('../extension/providers');
  assert.throws(() => load(customDir), /invalid JSON/i);
});

test('save() handles Windows rename-over-existing (unlink first)', () => {
  const { customDir } = tempHome();
  const { save, load } = require('../extension/providers');
  // Write first mapping
  save(customDir, { version: 1, providers: [{ id: 'a', label: 'A', url: 'https://a' }] });
  // Write second mapping — must succeed on Windows (rename over existing file)
  save(customDir, { version: 1, providers: [{ id: 'b', label: 'B', url: 'https://b' }] });
  const loaded = load(customDir);
  assert.equal(loaded.providers.length, 1);
  assert.equal(loaded.providers[0].id, 'b');
  // No .tmp artifact left behind
  assert.equal(fs.existsSync(path.join(customDir, 'mappings.json.tmp')), false);
});

test('load() cleans up stale .tmp file from previous crash', () => {
  const { customDir } = tempHome();
  const filePath = path.join(customDir, 'mappings.json');
  const tmpPath = path.join(customDir, 'mappings.json.tmp');
  // Simulate crash: save real file + leave stale .tmp
  fs.writeFileSync(filePath, JSON.stringify({ version: 1, providers: [{ id: 'real', label: 'Real', url: 'https://real' }] }));
  fs.writeFileSync(tmpPath, 'garbage');
  const { load } = require('../extension/providers');
  const result = load(customDir);
  // Should load the real file successfully (stale .tmp is cleaned up)
  assert.equal(result.providers.length, 1);
  assert.equal(result.providers[0].id, 'real');
  assert.equal(fs.existsSync(tmpPath), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL with "Cannot find module '../extension/providers'".

> **⚠️ Test isolation note:** Node.js caches modules loaded via `require()`. Since all tests import `../extension/providers`, calling `_setStorage()` in one test will affect subsequent tests in the same file. To ensure full isolation, add `delete require.cache[require.resolve('../extension/providers')]` at the start of each test, or use separate test files for storage-injection tests vs pure CRUD tests.

---

### Task 8: Implement load() and save()

**Files:**
- Create: `extension/providers.js`

- [ ] **Step 1: Write minimal implementation**

```js
const fs = require('node:fs');
const path = require('node:path');

const FILE = 'mappings.json';

/**
 * Load mappings from disk. Returns {version: 1, providers: []} if file missing.
 * Throws on invalid JSON. Cleans up stale .tmp files from previous crashes.
 */
function load(customDir) {
  const filePath = path.join(customDir, FILE);
  const tmpPath = `${filePath}.tmp`;
  // Clean up stale .tmp from previous crash
  if (fs.existsSync(tmpPath)) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
  if (!fs.existsSync(filePath)) {
    return { version: 1, providers: [] };
  }
  const text = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`mappings.json: invalid JSON: ${err.message}`);
  }
}

/**
 * Save mappings to disk atomically (writes to .tmp, unlinks target, then renames).
 * Explicit unlink before rename is REQUIRED on Windows (fs.rename fails if target exists).
 */
function save(customDir, mappings) {
  const filePath = path.join(customDir, FILE);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(mappings, null, 2));
  // Windows: unlink target before rename, otherwise rename fails if target exists
  try { fs.unlinkSync(filePath); } catch (_) {}
  fs.renameSync(tmpPath, filePath);
}

module.exports = { load, save };
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npm test
```

Expected: All 6 load/save tests PASS.

- [ ] **Step 3: Commit**

```bash
git add test/providers.test.js extension/providers.js
git commit -m "feat(providers): load() and save() with atomic write + stale tmp cleanup"
```

---

### Task 9: Failing test for add(), remove(), reorder()

**Files:**
- Modify: `test/providers.test.js` (append tests)

- [ ] **Step 1: Append failing tests**

```js
test('add() appends a new provider', () => {
  const { customDir } = tempHome();
  const { load, add } = require('../extension/providers');
  const result = add(customDir, {
    id: 'first',
    label: 'First',
    url: 'https://a.example.com'
  });
  assert.equal(result.id, 'first');
  const loaded = load(customDir);
  assert.equal(loaded.providers.length, 1);
  assert.equal(loaded.providers[0].id, 'first');
});

test('add() preserves existing providers', () => {
  const { customDir } = tempHome();
  const { add } = require('../extension/providers');
  add(customDir, { id: 'first', label: 'First', url: 'https://a' });
  add(customDir, { id: 'second', label: 'Second', url: 'https://b' });
  const { load } = require('../extension/providers');
  const loaded = load(customDir);
  assert.deepEqual(loaded.providers.map(p => p.id), ['first', 'second']);
});

test('remove() deletes a provider by id', () => {
  const { customDir } = tempHome();
  const { add, remove, load } = require('../extension/providers');
  add(customDir, { id: 'first', label: 'First', url: 'https://a' });
  add(customDir, { id: 'second', label: 'Second', url: 'https://b' });
  remove(customDir, 'first');
  const loaded = load(customDir);
  assert.deepEqual(loaded.providers.map(p => p.id), ['second']);
});

test('remove() on missing id is a no-op', () => {
  const { customDir } = tempHome();
  const { remove, load } = require('../extension/providers');
  remove(customDir, 'nonexistent');
  assert.deepEqual(load(customDir).providers, []);
});

test('reorder() updates display.order to match new order', () => {
  const { customDir } = tempHome();
  const { add, reorder, load } = require('../extension/providers');
  add(customDir, { id: 'a', label: 'A', url: 'https://a' });
  add(customDir, { id: 'b', label: 'B', url: 'https://b' });
  add(customDir, { id: 'c', label: 'C', url: 'https://c' });
  reorder(customDir, ['c', 'a', 'b']);
  const loaded = load(customDir);
  const orders = Object.fromEntries(loaded.providers.map(p => [p.id, p.display.order]));
  assert.equal(orders.c, 1);
  assert.equal(orders.a, 2);
  assert.equal(orders.b, 3);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: New tests FAIL with "add is not a function" etc.

---

### Task 10: Implement add(), remove(), reorder()

**Files:**
- Modify: `extension/providers.js`

- [ ] **Step 1: Add CRUD functions**

Replace the entire file with:

```js
const fs = require('node:fs');
const path = require('node:path');

const FILE = 'mappings.json';

function load(customDir) {
  const filePath = path.join(customDir, FILE);
  const tmpPath = `${filePath}.tmp`;
  // Clean up stale .tmp from previous crash
  if (fs.existsSync(tmpPath)) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
  if (!fs.existsSync(filePath)) {
    return { version: 1, providers: [] };
  }
  const text = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`mappings.json: invalid JSON: ${err.message}`);
  }
}

function save(customDir, mappings) {
  const filePath = path.join(customDir, FILE);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(mappings, null, 2));
  // Windows: unlink target before rename
  try { fs.unlinkSync(filePath); } catch (_) {}
  fs.renameSync(tmpPath, filePath);
}

function ensureDir(customDir) {
  if (!fs.existsSync(customDir)) {
    fs.mkdirSync(customDir, { recursive: true });
  }
}

function add(customDir, { id, label, url, method = 'GET', headers = {}, mapping = null, display = null, refreshIntervalMinutes = 5 }) {
  ensureDir(customDir);
  const mappings = load(customDir);
  const existing = mappings.providers.find(p => p.id === id);
  if (existing) {
    // Update only the provided fields; preserve mapping/display if not given
    Object.assign(existing, { label, url, method, headers, refreshIntervalMinutes });
    save(customDir, mappings);
    return existing;
  }
  const provider = {
    id,
    label,
    url,
    method,
    headers,
    mapping,
    display: display || { order: mappings.providers.length + 1, showPercent: true, showTimeLeft: true },
    refreshIntervalMinutes
  };
  mappings.providers.push(provider);
  save(customDir, mappings);
  return provider;
}

function remove(customDir, id) {
  const mappings = load(customDir);
  const before = mappings.providers.length;
  mappings.providers = mappings.providers.filter(p => p.id !== id);
  if (mappings.providers.length !== before) {
    save(customDir, mappings);
  }
}

function reorder(customDir, idsInOrder) {
  const mappings = load(customDir);
  for (let i = 0; i < idsInOrder.length; i++) {
    const provider = mappings.providers.find(p => p.id === idsInOrder[i]);
    if (provider) {
      if (!provider.display) provider.display = {};
      provider.display.order = i + 1;
    }
  }
  save(customDir, mappings);
}

module.exports = { load, save, add, remove, reorder };
```

- [ ] **Step 2: Run tests to verify pass**

```bash
npm test
```

Expected: All 11 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add extension/providers.js test/providers.test.js
git commit -m "feat(providers): add, remove, reorder CRUD"
```

---

### Task 11: SecretStorage integration

The SecretStorage API is VSCode-specific. To keep `providers.js` testable in plain Node, we'll define a **storage adapter** interface and let `extension.js` inject a VSCode-backed implementation. The default (no injection) uses an in-memory map for tests.

**Files:**
- Modify: `extension/providers.js`
- Modify: `test/providers.test.js`

- [ ] **Step 1: Append failing tests for SecretStorage**

```js
test('getApiKey() returns null when not set', () => {
  const { customDir } = tempHome();
  const { getApiKey } = require('../extension/providers');
  assert.equal(getApiKey('any'), null);
});

test('setApiKey() then getApiKey() round-trips', () => {
  const { customDir } = tempHome();
  const { setApiKey, getApiKey } = require('../extension/providers');
  setApiKey('my-id', 'secret-value');
  assert.equal(getApiKey('my-id'), 'secret-value');
});

test('deleteApiKey() removes a key', () => {
  const { customDir } = tempHome();
  const { setApiKey, getApiKey, deleteApiKey } = require('../extension/providers');
  setApiKey('my-id', 'secret-value');
  deleteApiKey('my-id');
  assert.equal(getApiKey('my-id'), null);
});

test('injected storage is used instead of in-memory default', () => {
  const store = new Map();
  const storage = {
    get: async (k) => store.has(k) ? store.get(k) : null,
    store: async (k, v) => { store.set(k, v); },
    delete: async (k) => { store.delete(k); }
  };
  const { setApiKey, getApiKey, _setStorage } = require('../extension/providers');
  _setStorage(storage);
  // Need to wrap to use the async API; for sync test, just verify the key gets passed through
  // Simpler: use the sync helpers
  setApiKey('a', 'b');
  assert.equal(getApiKey('a'), 'b');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: New tests FAIL with "getApiKey is not a function".

- [ ] **Step 3: Add SecretStorage to providers.js**

Replace the entire file with:

```js
const fs = require('node:fs');
const path = require('node:path');

const FILE = 'mappings.json';

// In-memory storage (default for tests). Real impl injected from extension.js.
let storage = {
  _data: new Map(),
  async get(k) { return this._data.has(k) ? this._data.get(k) : null; },
  async store(k, v) { this._data.set(k, v); },
  async delete(k) { this._data.delete(k); }
};

function _setStorage(vscodeSecrets) {
  storage = vscodeSecrets;
}

function _secretKey(id) {
  return `customApiUsage.providers.${id}.apiKey`;
}

function load(customDir) {
  const filePath = path.join(customDir, FILE);
  const tmpPath = `${filePath}.tmp`;
  // Clean up stale .tmp from previous crash
  if (fs.existsSync(tmpPath)) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
  if (!fs.existsSync(filePath)) {
    return { version: 1, providers: [] };
  }
  const text = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`mappings.json: invalid JSON: ${err.message}`);
  }
}

function save(customDir, mappings) {
  const filePath = path.join(customDir, FILE);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(mappings, null, 2));
  // Windows: unlink target before rename
  try { fs.unlinkSync(filePath); } catch (_) {}
  fs.renameSync(tmpPath, filePath);
}

function ensureDir(customDir) {
  if (!fs.existsSync(customDir)) {
    fs.mkdirSync(customDir, { recursive: true });
  }
}

function add(customDir, { id, label, url, method = 'GET', headers = {}, mapping = null, display = null, refreshIntervalMinutes = 5 }) {
  ensureDir(customDir);
  const mappings = load(customDir);
  const existing = mappings.providers.find(p => p.id === id);
  if (existing) {
    Object.assign(existing, { label, url, method, headers, refreshIntervalMinutes });
    save(customDir, mappings);
    return existing;
  }
  const provider = {
    id,
    label,
    url,
    method,
    headers,
    mapping,
    display: display || { order: mappings.providers.length + 1, showPercent: true, showTimeLeft: true },
    refreshIntervalMinutes
  };
  mappings.providers.push(provider);
  save(customDir, mappings);
  return provider;
}

function remove(customDir, id) {
  const mappings = load(customDir);
  const before = mappings.providers.length;
  mappings.providers = mappings.providers.filter(p => p.id !== id);
  if (mappings.providers.length !== before) {
    save(customDir, mappings);
  }
}

function reorder(customDir, idsInOrder) {
  const mappings = load(customDir);
  for (let i = 0; i < idsInOrder.length; i++) {
    const provider = mappings.providers.find(p => p.id === idsInOrder[i]);
    if (provider) {
      if (!provider.display) provider.display = {};
      provider.display.order = i + 1;
    }
  }
  save(customDir, mappings);
}

async function getApiKey(id) {
  return await storage.get(_secretKey(id));
}

async function setApiKey(id, key) {
  await storage.store(_secretKey(id), key);
}

async function deleteApiKey(id) {
  await storage.delete(_secretKey(id));
}

module.exports = { load, save, add, remove, reorder, getApiKey, setApiKey, deleteApiKey, _setStorage };
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: All 15 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/providers.js test/providers.test.js
git commit -m "feat(providers): SecretStorage CRUD with injectable adapter"
```

---

## Phase 2: fetcher.js — extract() and renderStatusBar() (TDD)

### Task 12: Failing test for extract() basic + invert + unit

**Files:**
- Create: `test/fetcher.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const { extract, renderStatusBar } = require('../extension/fetcher');

const sampleRaw = {
  data: {
    models: [
      {
        name: 'example-model',
        usage: {
          used: 45,
          limit: 100,
          remaining_percent: 55,
          reset_at_seconds: 1717670400  // 2024-06-06 (approx)
        }
      }
    ]
  }
};

const exampleProvider = {
  id: 'example-api',
  label: 'Example API',
  url: 'https://api.example.com/v1/usage',
  method: 'GET',
  headers: { Authorization: 'Bearer ${apiKey}' },
  mapping: {
    used:      { path: '$.data.models[0].usage.used' },
    total:     { path: '$.data.models[0].usage.limit' },
    percent:   { path: '$.data.models[0].usage.remaining_percent', invert: true },
    resetTime: { path: '$.data.models[0].usage.reset_at_seconds', unit: 's' }
  },
  display: { order: 1, showPercent: true, showTimeLeft: true }
};

test('extract() resolves all 4 fields with full mapping', () => {
  const result = extract(exampleProvider, sampleRaw);
  assert.equal(result.used, 45);
  assert.equal(result.total, 100);
  // remaining_percent is 55, invert → 100 - 55 = 45
  assert.equal(result.percent, 45);
  // reset_at_seconds * 1000 (unit conversion)
  assert.equal(result.resetTimeMs, 1717670400000);
});

test('extract() returns null for fields with no matching path', () => {
  const provider = {
    ...exampleProvider,
    mapping: {
      used:      { path: '$.nonexistent.used' },
      total:     { path: '$.data.models[0].usage.limit' },
      percent:   null,
      resetTime: null
    }
  };
  const result = extract(provider, sampleRaw);
  assert.equal(result.used, null);
  assert.equal(result.total, 100);
  assert.equal(result.percent, null);
  assert.equal(result.resetTimeMs, null);
});

test('extract() takes first match when path returns multiple values', () => {
  const raw = { items: [{ count: 10 }, { count: 20 }] };
  const provider = {
    ...exampleProvider,
    mapping: { used: { path: '$.items[*].count' }, total: null, percent: null, resetTime: null }
  };
  const result = extract(provider, raw);
  assert.equal(result.used, 10);
});

test('extract() handles missing mapping object', () => {
  const result = extract({ ...exampleProvider, mapping: null }, sampleRaw);
  assert.equal(result.used, null);
  assert.equal(result.total, null);
  assert.equal(result.percent, null);
  assert.equal(result.resetTimeMs, null);
});

test('extract() does NOT auto-calculate percent from used/total', () => {
  const raw = { used: 450, total: 1000 };
  const provider = {
    ...exampleProvider,
    mapping: { used: { path: '$.used' }, total: { path: '$.total' }, percent: null, resetTime: null }
  };
  const result = extract(provider, raw);
  assert.equal(result.used, 450);
  assert.equal(result.total, 1000);
  // Percent must remain null — no auto-calc. Fallback display handled by renderStatusBar.
  assert.equal(result.percent, null);
});

test('extract() clamps inverted percent when value exceeds 100', () => {
  const raw = { remaining_pct: 110 };  // API bug — more than 100% remaining
  const provider = {
    ...exampleProvider,
    mapping: { used: null, total: null, percent: { path: '$.remaining_pct', invert: true }, resetTime: null }
  };
  const result = extract(provider, raw);
  // invert: 100 - 110 = -10 → clamped to 0
  assert.equal(result.percent, 0);
});

test('extract() clamps inverted percent when value is negative', () => {
  const raw = { remaining_pct: -5 };
  const provider = {
    ...exampleProvider,
    mapping: { used: null, total: null, percent: { path: '$.remaining_pct', invert: true }, resetTime: null }
  };
  const result = extract(provider, raw);
  // invert: 100 - (-5) = 105 → clamped to 100
  assert.equal(result.percent, 100);
});

test('extract() returns all null when all 4 fields have no matching paths', () => {
  const provider = {
    ...exampleProvider,
    mapping: { used: { path: '$.nope' }, total: { path: '$.nope' }, percent: { path: '$.nope' }, resetTime: { path: '$.nope' } }
  };
  const result = extract(provider, sampleRaw);
  assert.equal(result.used, null);
  assert.equal(result.total, null);
  assert.equal(result.percent, null);
  assert.equal(result.resetTimeMs, null);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: FAIL with "Cannot find module '../extension/fetcher'".

---

### Task 13: Implement extract()

**Files:**
- Create: `extension/fetcher.js` (partial — just extract and renderStatusBar stub)

- [ ] **Step 1: Write extract() implementation**

```js
const { JSONPath } = require('jsonpath-plus');

/**
 * Evaluate JSONPath for each fixed field. Apply invert / unit transforms.
 * Returns { used, total, percent, resetTimeMs } — any may be null.
 */
function extract(provider, raw) {
  const mapping = provider.mapping || {};
  const result = { used: null, total: null, percent: null, resetTimeMs: null };

  if (mapping.used) {
    result.used = resolveNumber(mapping.used.path, raw);
  }
  if (mapping.total) {
    result.total = resolveNumber(mapping.total.path, raw);
  }
  if (mapping.percent) {
    let pct = resolveNumber(mapping.percent.path, raw);
    if (pct !== null) {
      if (mapping.percent.invert) pct = 100 - pct;
      result.percent = Math.max(0, Math.min(100, Math.round(pct)));
    }
  }
  if (mapping.resetTime) {
    const raw_val = resolveNumber(mapping.resetTime.path, raw);
    if (raw_val !== null) {
      const unit = mapping.resetTime.unit || (raw_val > 1e12 ? 'ms' : 's');
      result.resetTimeMs = unit === 's' ? raw_val * 1000 : raw_val;
    }
  }

  return result;
}

function resolveNumber(path, raw) {
  if (!path) return null;
  try {
    const matches = JSONPath({ path, json: raw });
    if (!matches || matches.length === 0) return null;
    const v = matches[0];
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

// renderStatusBar stub — implemented in next task
function renderStatusBar(provider, extracted) {
  return { text: '', color: undefined, backgroundColor: undefined };
}

module.exports = { extract, renderStatusBar };
```

- [ ] **Step 2: Run tests to verify pass**

```bash
npm test
```

Expected: All extract tests PASS.

- [ ] **Step 3: Commit**

```bash
git add extension/fetcher.js test/fetcher.test.js
git commit -m "feat(fetcher): extract() with JSONPath + invert + unit"
```

---

### Task 14: Failing test for renderStatusBar()

**Files:**
- Modify: `test/fetcher.test.js` (append)

- [ ] **Step 1: Append failing tests**

```js
test('renderStatusBar() shows label, percent, and time-left when all data present', () => {
  // Future time: 1 hour from now
  const oneHourFromNow = Date.now() + 3600000;
  const extracted = { used: 45, total: 100, percent: 45, resetTimeMs: oneHourFromNow };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.match(result.text, /⚡ Example API/);
  assert.match(result.text, /45%/);
  assert.match(result.text, /\(1h\d+m\)/);
});

test('renderStatusBar() omits time-left when resetTimeMs is null', () => {
  const extracted = { used: 45, total: 100, percent: 45, resetTimeMs: null };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.equal(result.text.includes('('), false);
  assert.match(result.text, /45%/);
});

test('renderStatusBar() omits percent when null but shows time-left', () => {
  const oneHourFromNow = Date.now() + 3600000;
  const extracted = { used: null, total: null, percent: null, resetTimeMs: oneHourFromNow };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.match(result.text, /⚡ Example API/);
  assert.equal(result.text.includes('%'), false);
  assert.match(result.text, /\(1h\d+m\)/);
});

test('renderStatusBar() shows (expired) for past reset time', () => {
  const past = Date.now() - 60000;  // 1 minute ago
  const extracted = { used: 100, total: 100, percent: 100, resetTimeMs: past };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.match(result.text, /expired/);
});

test('renderStatusBar() applies red color when percent >= 90', () => {
  const extracted = { used: 95, total: 100, percent: 95, resetTimeMs: null };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.equal(result.color, 'error');
  assert.equal(result.backgroundColor, 'error');
});

test('renderStatusBar() applies yellow color when 75 <= percent < 90', () => {
  const extracted = { used: 80, total: 100, percent: 80, resetTimeMs: null };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.equal(result.color, 'warning');
  assert.equal(result.backgroundColor, 'warning');
});

test('renderStatusBar() applies no color when percent < 75', () => {
  const extracted = { used: 50, total: 100, percent: 50, resetTimeMs: null };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.equal(result.color, undefined);
  assert.equal(result.backgroundColor, undefined);
});

test('renderStatusBar() respects showPercent: false', () => {
  const provider = { ...exampleProvider, display: { ...exampleProvider.display, showPercent: false } };
  const extracted = { used: 45, total: 100, percent: 45, resetTimeMs: null };
  const result = renderStatusBar(provider, extracted);
  assert.equal(result.text.includes('%'), false);
});

test('renderStatusBar() shows fallback used/total when percent is null', () => {
  const extracted = { used: 450, total: 1000, percent: null, resetTimeMs: null };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.match(result.text, /450\/1000/);
  assert.equal(result.text.includes('%'), false);
});

test('renderStatusBar() shows minimal label when only partial data available', () => {
  const extracted = { used: null, total: 1000, percent: null, resetTimeMs: null };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.match(result.text, /⚡ Example API/);
  // No percent, no used/total (total alone is not enough for fallback)
  assert.equal(result.text.includes('%'), false);
  assert.equal(result.text.includes('/'), false);
});

test('renderStatusBar() shows fallback used/total even with time-left present', () => {
  const oneHourFromNow = Date.now() + 3600000;
  const extracted = { used: 450, total: 1000, percent: null, resetTimeMs: oneHourFromNow };
  const result = renderStatusBar(exampleProvider, extracted);
  assert.match(result.text, /450\/1000/);
  assert.match(result.text, /\(1h\d+m\)/);
  assert.equal(result.text.includes('%'), false);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: New tests FAIL because renderStatusBar is a stub.

---

### Task 15: Implement renderStatusBar()

**Files:**
- Modify: `extension/fetcher.js` (replace renderStatusBar stub)

- [ ] **Step 1: Replace the stub**

Find the line `function renderStatusBar(provider, extracted) {` and replace it with:

```js
function renderStatusBar(provider, extracted) {
  const showPct = provider.display?.showPercent !== false;
  const showTime = provider.display?.showTimeLeft !== false;
  const label = provider.label || provider.id || 'Provider';
  const pct = extracted.percent;
  const resetTimeMs = extracted.resetTimeMs;

  const parts = [`⚡ ${label}`];
  if (showPct && pct !== null) {
    parts.push(`${pct}%`);
  } else if (extracted.used !== null && extracted.total !== null) {
    // Fallback: show raw used/total when percent is unavailable
    parts.push(`${extracted.used}/${extracted.total}`);
  }
  if (showTime && resetTimeMs !== null) {
    if (resetTimeMs > Date.now()) {
      const remaining = resetTimeMs - Date.now();
      parts.push(formatDuration(remaining));
    } else {
      parts.push('(expired)');
    }
  }

  const text = parts.join(' ');
  const color = pct === null ? undefined : pct >= 90 ? 'error' : pct >= 75 ? 'warning' : undefined;
  const backgroundColor = color;

  return { text, color, backgroundColor };
}

function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  let inner;
  if (hours > 0) {
    inner = `${hours}h${mins}m`;
  } else if (mins > 0) {
    inner = `${mins}m`;
  } else {
    inner = '<1m';
  }
  return `(${inner})`;
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add extension/fetcher.js test/fetcher.test.js
git commit -m "feat(fetcher): renderStatusBar() with colors, time-left, expired state"
```

---

## Phase 3: fetcher.js — fetchAndCache() (HTTP)

### Task 16: Failing test for fetchAndCache() with mock server

**Files:**
- Create: `test/fetcher.http.test.js`

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function tempCustomDir() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cau-http-'));
  const customDir = path.join(home, '.custom-api-usage');
  fs.mkdirSync(customDir, { recursive: true });
  return customDir;
}

function startMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

test('fetchAndCache() GETs the URL and saves raw to disk', async () => {
  const customDir = tempCustomDir();
  const { server, url } = await startMockServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { used: 42 } }));
  });
  try {
    const { fetchAndCache } = require('../extension/fetcher');
    const provider = { id: 'mock', url, method: 'GET', headers: {} };
    const raw = await fetchAndCache(provider, customDir, async () => 'fake-key');
    assert.equal(raw.data.used, 42);
    const rawFile = path.join(customDir, 'raw', 'mock.json');
    assert.equal(fs.existsSync(rawFile), true);
    const cached = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
    assert.equal(cached.data.used, 42);
  } finally {
    server.close();
  }
});

test('fetchAndCache() resolves ${apiKey} in headers', async () => {
  let receivedAuth = null;
  const { server, url } = await startMockServer((req, res) => {
    receivedAuth = req.headers.authorization;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  try {
    const { fetchAndCache } = require('../extension/fetcher');
    const provider = { id: 'mock', url, method: 'GET', headers: { Authorization: 'Bearer ${apiKey}' } };
    await fetchAndCache(provider, tempCustomDir(), async () => 'the-secret');
    assert.equal(receivedAuth, 'Bearer the-secret');
  } finally {
    server.close();
  }
});

test('fetchAndCache() throws on 4xx/5xx with status code in message', async () => {
  const { server, url } = await startMockServer((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end('{"message": "unauthorized"}');
  });
  try {
    const { fetchAndCache } = require('../extension/fetcher');
    const provider = { id: 'mock', url, method: 'GET', headers: {} };
    await assert.rejects(
      fetchAndCache(provider, tempCustomDir(), async () => null),
      /401/
    );
  } finally {
    server.close();
  }
});

test('fetchAndCache() throws on non-JSON response', async () => {
  const { server, url } = await startMockServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html>not json</html>');
  });
  try {
    const { fetchAndCache } = require('../extension/fetcher');
    const provider = { id: 'mock', url, method: 'GET', headers: {} };
    await assert.rejects(
      fetchAndCache(provider, tempCustomDir(), async () => null),
      /Invalid JSON/
    );
  } finally {
    server.close();
  }
});

test('fetchAndCache() does not write raw file on error', async () => {
  const customDir = tempCustomDir();
  const { server, url } = await startMockServer((req, res) => {
    res.writeHead(500);
    res.end('oops');
  });
  try {
    const { fetchAndCache } = require('../extension/fetcher');
    const provider = { id: 'mock', url, method: 'GET', headers: {} };
    await fetchAndCache(provider, customDir, async () => null).catch(() => {});
    const rawFile = path.join(customDir, 'raw', 'mock.json');
    assert.equal(fs.existsSync(rawFile), false);
  } finally {
    server.close();
  }
});

test('fetchAndCache() saves error body to _error.json on 4xx/5xx for debugging', async () => {
  const customDir = tempCustomDir();
  const { server, url } = await startMockServer((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end('{"message":"unauthorized"}');
  });
  try {
    const { fetchAndCache } = require('../extension/fetcher');
    const provider = { id: 'mock', url, method: 'GET', headers: {} };
    await fetchAndCache(provider, customDir, async () => null).catch(() => {});
    const errorFile = path.join(customDir, 'raw', 'mock_error.json');
    assert.equal(fs.existsSync(errorFile), true);
    const cached = JSON.parse(fs.readFileSync(errorFile, 'utf8'));
    assert.equal(cached.message, 'unauthorized');
  } finally {
    server.close();
  }
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test
```

Expected: FAIL with "fetchAndCache is not a function".

---

### Task 17: Implement fetchAndCache()

**Files:**
- Modify: `extension/fetcher.js` (add fetchAndCache function, update module.exports)

- [ ] **Step 1: Add fetchAndCache to fetcher.js**

Append to the existing fetcher.js (BEFORE the existing `module.exports` line, add the requires and function):

```js
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const RAW_DIR = 'raw';

/**
 * Fetch URL, save raw to <customDir>/raw/<id>.json, return parsed JSON.
 * `getApiKey` is an async function (id) => string | null for resolving ${apiKey}.
 * Throws on non-2xx, non-JSON, or network error. Does NOT write raw on error.
 *
 * `customDir` is the full path to the user's config dir
 * (e.g. `~/.custom-api-usage`), matching `providers.load()` / `providers.save()`.
 */
function fetchAndCache(provider, customDir, getApiKey) {
  return new Promise(async (resolve, reject) => {
    let url;
    try {
      url = new URL(provider.url);
    } catch (err) {
      return reject(new Error(`Invalid URL: ${provider.url}`));
    }
    const lib = url.protocol === 'https:' ? https : http;

    // Resolve ${apiKey} in headers
    let resolvedHeaders = {};
    for (const [k, v] of Object.entries(provider.headers || {})) {
      if (typeof v === 'string' && v.includes('${apiKey}')) {
        const key = await getApiKey(provider.id);
        resolvedHeaders[k] = v.replace('${apiKey}', key || '');
      } else {
        resolvedHeaders[k] = v;
      }
    }

    const req = lib.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: provider.method || 'GET',
      headers: resolvedHeaders
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          // Cache error body for debugging
          try {
            const rawDir = path.join(customDir, RAW_DIR);
            fs.mkdirSync(rawDir, { recursive: true });
            fs.writeFileSync(path.join(rawDir, `${provider.id}_error.json`), body);
          } catch (_) {}
          return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          return reject(new Error(`Invalid JSON: ${body.slice(0, 80)}`));
        }
        // Only write on success
        try {
          const rawDir = path.join(customDir, RAW_DIR);
          fs.mkdirSync(rawDir, { recursive: true });
          fs.writeFileSync(path.join(rawDir, `${provider.id}.json`), JSON.stringify(parsed, null, 2));
        } catch (err) {
          // Cache write failure is non-fatal; we still return parsed data
          console.error(`[fetcher] failed to cache raw: ${err.message}`);
        }
        resolve(parsed);
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timeout after 10s'));
    });
    req.end();
  });
}

module.exports = { extract, renderStatusBar, fetchAndCache };
```

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: All tests PASS (now ~30+ tests across all three test files).

- [ ] **Step 3: Commit**

```bash
git add extension/fetcher.js test/fetcher.http.test.js
git commit -m "feat(fetcher): fetchAndCache() with header template, error handling, raw cache"
```

---

## Phase 4: extension.js — VSCode Entry

### Task 18: Minimal extension.js with activate/deactivate

**Files:**
- Create: `extension/extension.js`

- [ ] **Step 1: Write minimal extension.js**

```js
const vscode = require('vscode');
const path = require('node:path');
const os = require('node:os');
const providers = require('./providers');
const { fetchAndCache, extract, renderStatusBar } = require('./fetcher');

const CUSTOM_DIR = path.join(os.homedir(), '.custom-api-usage');
const PREFIX = 'customApiUsage';
const MAX_VISIBLE = 3;  // Max individual status bar items before aggregate

// Per-provider state
const state = {
  items: new Map(),          // id → StatusBarItem
  timers: new Map(),         // id → NodeJS.Timeout
  lastExtracted: new Map(),  // id → {used,total,percent,resetTimeMs}
  aggregateItem: null,       // StatusBarItem for "⚡ +N more"
  emptyHint: null            // StatusBarItem for "🔑 Add a provider"
};

let mappingsWatcher = null;

async function activate(context) {
  // Clean up stale .tmp from previous crash (defense in depth — providers.load also does this)
  const tmpPath = path.join(CUSTOM_DIR, 'mappings.json.tmp');
  try { require('node:fs').unlinkSync(tmpPath); } catch (_) {}

  // Inject VSCode SecretStorage into providers
  providers._setStorage(context.secrets);

  // Initial load
  await rebuildFromDisk(context);

  // Watch mappings.json for external edits
  startMappingsWatcher(context);

  // Reload on configuration change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('customApiUsage')) {
        rebuildFromDisk(context);
      }
    })
  );

  // Register commands
  registerCommands(context);
}

function deactivate() {
  if (mappingsWatcher) mappingsWatcher.dispose();
  for (const t of state.timers.values()) clearInterval(t);
}

async function rebuildFromDisk(context) {
  let mappings;
  try {
    mappings = providers.load(CUSTOM_DIR);
  } catch (err) {
    vscode.window.showErrorMessage(`custom-api-usage: failed to load mappings: ${err.message}`);
    return;
  }

  // Dispose old items/timers
  for (const item of state.items.values()) item.dispose();
  for (const t of state.timers.values()) clearInterval(t);
  if (state.aggregateItem) { state.aggregateItem.dispose(); state.aggregateItem = null; }
  if (state.emptyHint) { state.emptyHint.dispose(); state.emptyHint = null; }
  state.items.clear();
  state.timers.clear();
  state.lastExtracted.clear();

  // Empty state: show hint when no providers
  if (mappings.providers.length === 0) {
    const hint = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100000);
    hint.text = `$(add) Add a provider`;
    hint.command = `${PREFIX}.addProvider`;
    hint.tooltip = 'Custom API Usage — click to add your first provider';
    hint.show();
    state.emptyHint = hint;
    context.subscriptions.push(hint);
    return;
  }

  // Sort by display.order
  const sorted = [...mappings.providers].sort((a, b) =>
    (a.display?.order ?? 999) - (b.display?.order ?? 999)
  );

  // Max visible items: first 2 individual + aggregate if > MAX_VISIBLE
  const visibleCount = Math.min(sorted.length, MAX_VISIBLE);
  const individualCount = sorted.length > MAX_VISIBLE ? MAX_VISIBLE - 1 : visibleCount;

  for (let i = 0; i < individualCount; i++) {
    const provider = sorted[i];
    const item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100000 - i
    );
    item.command = `${PREFIX}.showDetails`;
    state.items.set(provider.id, item);
    context.subscriptions.push(item);

    // Stagger first fetch
    setTimeout(() => refreshOne(context, provider), i * 10000);
    // Schedule periodic refresh
    const interval = (provider.refreshIntervalMinutes || 5) * 60 * 1000;
    const timer = setInterval(() => refreshOne(context, provider), interval);
    state.timers.set(provider.id, timer);
    context.subscriptions.push({ dispose: () => clearInterval(timer) });
  }

  // Aggregate item for overflow providers
  if (sorted.length > MAX_VISIBLE) {
    const overflowCount = sorted.length - individualCount;
    const agg = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100000 - individualCount
    );
    agg.text = `⚡ +${overflowCount} more`;
    agg.command = `${PREFIX}.showDetails`;
    agg.tooltip = `${overflowCount} more provider(s) — click for details`;
    agg.show();
    state.aggregateItem = agg;
    context.subscriptions.push(agg);

    // Also create timers for overflow providers (items not shown but still fetched)
    for (let i = individualCount; i < sorted.length; i++) {
      const provider = sorted[i];
      setTimeout(() => refreshOne(context, provider), i * 10000);
      const interval = (provider.refreshIntervalMinutes || 5) * 60 * 1000;
      const timer = setInterval(() => refreshOne(context, provider), interval);
      state.timers.set(provider.id, timer);
      context.subscriptions.push({ dispose: () => clearInterval(timer) });
    }
  }
}

async function refreshOne(context, provider) {
  const item = state.items.get(provider.id);
  const label = provider.label || provider.id || 'Provider';

  // Show loading state (only if item is visible)
  if (item) {
    item.text = `$(sync~spin) ${label}...`;
    item.color = undefined;
    item.backgroundColor = undefined;
    item.tooltip = `Refreshing ${label}...`;
    item.show();
  }

  // Check if mapping exists but is invalid structure (has mapping but no usable fields)
  if (provider.mapping && typeof provider.mapping === 'object' &&
      !provider.mapping.used && !provider.mapping.total && !provider.mapping.percent && !provider.mapping.resetTime) {
    if (item) {
      item.text = `$(warning) ${label}: Bad mapping`;
      item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      item.command = `${PREFIX}.showDetails`;
      item.tooltip = `Mapping has no usable fields. Run /custom-api-usage-analyze ${provider.id} to regenerate.`;
      item.show();
    }
    return;
  }

  // Check if mapping exists at all
  if (!provider.mapping || !provider.mapping.used) {
    if (item) {
      item.text = `$(warning) ${label}: Needs analyze`;
      item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      item.tooltip = `Run /custom-api-usage-analyze ${provider.id} in Claude Code to generate mapping.`;
      item.show();
    }
    return;
  }

  // Check API key
  const apiKey = await providers.getApiKey(provider.id);
  if (!apiKey) {
    if (item) {
      item.text = `$(key) ${label}: Set API Key`;
      item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      item.command = `${PREFIX}.setApiKey`;
      item.tooltip = `Click to set API key for ${label}`;
      item.show();
    }
    return;
  }

  // Fetch + extract
  try {
    const raw = await fetchAndCache(provider, CUSTOM_DIR, (id) => providers.getApiKey(id));
    const extracted = extract(provider, raw);
    state.lastExtracted.set(provider.id, extracted);

    // Check if all extracted fields are null (mapping paths don't match response)
    const allNull = extracted.used === null && extracted.total === null
      && extracted.percent === null && extracted.resetTimeMs === null;
    if (allNull) {
      if (item) {
        item.text = `$(warning) ${label}: No data`;
        item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
        item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        item.command = `${PREFIX}.showDetails`;
        item.tooltip = `Mapping paths returned no data. Run /custom-api-usage-analyze ${provider.id} to fix.`;
        item.show();
      }
      return;
    }

    const rendered = renderStatusBar(provider, extracted);
    if (item) {
      item.text = rendered.text;
      if (rendered.color === 'error') {
        item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
        item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      } else if (rendered.color === 'warning') {
        item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
        item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        item.color = undefined;
        item.backgroundColor = undefined;
      }
      item.command = `${PREFIX}.showDetails`;
      const mins = provider.refreshIntervalMinutes || 5;
      item.tooltip = `${label}\nRefreshes every ${mins} min — click for details`;
      item.show();
    }
  } catch (err) {
    if (item) {
      item.text = `$(warning) ${label}: Error`;
      item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
      item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      item.command = `${PREFIX}.refresh`;
      item.tooltip = `Error: ${err.message} — click to retry`;
      item.show();
    }
  }
}

function startMappingsWatcher(context) {
  if (mappingsWatcher) mappingsWatcher.dispose();
  try {
    const pattern = new vscode.RelativePattern(path.dirname(CUSTOM_DIR), path.basename(CUSTOM_DIR) + '/mappings.json');
    mappingsWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    mappingsWatcher.onDidChange(() => rebuildFromDisk(context));
    mappingsWatcher.onDidCreate(() => rebuildFromDisk(context));
    context.subscriptions.push(mappingsWatcher);
  } catch (err) {
    console.warn(`[custom-api-usage] File watcher failed: ${err.message}. Falling back to per-refresh reload.`);
    // Mappings will be reloaded on each refresh cycle — slightly less responsive but never broken
  }
}

function registerCommands(context) {
  // Placeholder — real commands in next task
  context.subscriptions.push(
    vscode.commands.registerCommand(`${PREFIX}.refresh`, () => {
      const mappings = providers.load(CUSTOM_DIR);
      for (const p of mappings.providers) refreshOne(context, p);
    })
  );
}

module.exports = { activate, deactivate };
```

- [ ] **Step 2: Verify it loads (no syntax errors)**

```bash
node -e "require('./extension/extension.js')" 2>&1 | head -20
```

Expected: Either loads silently OR fails with "Cannot find module 'vscode'" (expected — vscode module is only available inside VSCode). No syntax errors.

- [ ] **Step 3: Commit**

```bash
git add extension/extension.js
git commit -m "feat(extension): activate/deactivate with max 3 items, aggregate, all status states, watcher fallback"
```

---

### Task 19: Implement customApiUsage.addProvider and setApiKey commands

**Files:**
- Modify: `extension/extension.js`

- [ ] **Step 1: Replace registerCommands function**

Find the `function registerCommands(context)` function and replace it with:

```js
function registerCommands(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(`${PREFIX}.refresh`, async () => {
      const mappings = providers.load(CUSTOM_DIR);
      for (const p of mappings.providers) {
        await refreshOne(context, p);
      }
    }),

    vscode.commands.registerCommand(`${PREFIX}.addProvider`, async () => {
      const label = await vscode.window.showInputBox({
        prompt: 'Provider label (e.g. "Example API")',
        placeHolder: 'Example API',
        ignoreFocusOut: true
      });
      if (!label?.trim()) return;

      const id = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      const url = await vscode.window.showInputBox({
        prompt: 'API URL',
        placeHolder: 'https://api.example.com/v1/usage',
        ignoreFocusOut: true
      });
      if (!url?.trim()) return;

      const key = await vscode.window.showInputBox({
        prompt: `API key for "${label}"`,
        password: true,
        placeHolder: 'Paste API key...',
        ignoreFocusOut: true
      });
      if (!key?.trim()) return;

      // Save provider (no mapping yet) + secret
      const provider = providers.add(CUSTOM_DIR, { id, label: label.trim(), url: url.trim() });
      await providers.setApiKey(id, key.trim());

      // Fetch raw immediately with default GET + Bearer config so the skill has data to analyze
      vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: `Fetching ${label}...` }, async () => {
        try {
          await fetchAndCache(provider, CUSTOM_DIR, (pid) => providers.getApiKey(pid));
          vscode.window.showInformationMessage(
            `custom-api-usage: provider "${label}" added. ` +
            `Now run /custom-api-usage-analyze ${id} in Claude Code to generate the mapping.`
          );
        } catch (err) {
          // Default fetch failed — provider is still saved; user can fix config + retry
          vscode.window.showWarningMessage(
            `custom-api-usage: provider "${label}" added, but default fetch failed: ${err.message}. ` +
            `Run /custom-api-usage-analyze ${id} after fixing URL/headers.`
          );
        }
      });

      await rebuildFromDisk(context);
    }),

    vscode.commands.registerCommand(`${PREFIX}.setApiKey`, async () => {
      const mappings = providers.load(CUSTOM_DIR);
      if (mappings.providers.length === 0) {
        vscode.window.showInformationMessage('No providers configured. Use "Add Provider" first.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        mappings.providers.map(p => ({ label: p.label, id: p.id })),
        { placeHolder: 'Select provider to update API key' }
      );
      if (!picked) return;

      const key = await vscode.window.showInputBox({
        prompt: `New API key for "${picked.label}"`,
        password: true,
        placeHolder: 'Paste new API key...',
        ignoreFocusOut: true
      });
      if (!key?.trim()) return;

      await providers.setApiKey(picked.id, key.trim());
      vscode.window.showInformationMessage(`custom-api-usage: API key updated for "${picked.label}".`);
      await rebuildFromDisk(context);
    })
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add extension/extension.js
git commit -m "feat(extension): addProvider and setApiKey commands"
```

---

### Task 20: Implement showDetails webview

**Files:**
- Modify: `extension/extension.js` (add escapeHtml helper + showDetails to registerCommands)

- [ ] **Step 1: Add escapeHtml helper at the top of extension.js (after the requires block, before `const CUSTOM_DIR`)**

```js
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 2: Add showDetails to registerCommands**

Find the line `vscode.commands.registerCommand(\`${PREFIX}.setApiKey\`, async () => {` block. Before its closing `}),`, add (inside the same `registerCommands` call):

```js
    vscode.commands.registerCommand(`${PREFIX}.showDetails`, () => {
      const mappings = providers.load(CUSTOM_DIR);
      if (mappings.providers.length === 0) {
        vscode.window.showInformationMessage('No providers configured.');
        return;
      }
      const panel = vscode.window.createWebviewPanel(
        'customApiUsageDetails',
        'Custom API Usage',
        vscode.ViewColumn.One,
        { enableScripts: false }
      );
      const fs = require('node:fs');
      const path = require('node:path');
      const cards = mappings.providers
        .sort((a, b) => (a.display?.order ?? 999) - (b.display?.order ?? 999))
        .map(p => {
          const ex = state.lastExtracted.get(p.id) || { used: null, total: null, percent: null, resetTimeMs: null };
          const rendered = renderStatusBar(p, ex);
          const pct = ex.percent;
          const barColor = pct === null ? '#888' : pct >= 90 ? '#e05c5c' : pct >= 75 ? '#e0a85c' : '#4f98a3';
          const barWidth = pct === null ? 0 : pct;

          // Try to load raw JSON from cache for this provider
          let rawJson = '';
          try {
            const rawPath = path.join(CUSTOM_DIR, 'raw', `${p.id}.json`);
            if (fs.existsSync(rawPath)) {
              const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
              rawJson = `<details style="margin-top: 8px;"><summary style="cursor: pointer; font-size: 0.8em; color: var(--vscode-descriptionForeground);">📋 Raw JSON</summary><pre style="background: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; overflow-x: auto; font-size: 0.75em; max-height: 300px; overflow-y: auto;">${escapeHtml(JSON.stringify(raw, null, 2))}</pre></details>`;
            }
          } catch (_) {}

          return `
            <div style="margin-bottom: 24px; padding: 12px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 8px;">
              <h2 style="margin: 0 0 8px 0; font-size: 1.1em;">${escapeHtml(p.label)}</h2>
              <div style="font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-bottom: 8px;">
                <code>${escapeHtml(p.method || 'GET')} ${escapeHtml(p.url)}</code>
              </div>
              <div style="margin-bottom: 8px; font-size: 0.9em;">${escapeHtml(rendered.text || '—')}</div>
              ${pct !== null ? `<div style="background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 999px; height: 8px; margin-bottom: 4px;"><div style="width: ${barWidth}%; background: ${barColor}; height: 100%; border-radius: 999px;"></div></div><div style="font-size: 0.75em; color: var(--vscode-descriptionForeground);">${pct}% used</div>` : ''}
              ${ex.used !== null || ex.total !== null ? `<div style="margin-top: 8px; font-size: 0.8em;">Used: ${ex.used ?? '—'} / Total: ${ex.total ?? '—'}</div>` : ''}
              ${rawJson}
            </div>`;
        })
        .join('');

      panel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 24px; max-width: 720px; margin: 0 auto; }
h1 { font-size: 1.25em; margin-bottom: 16px; }
</style>
</head><body>
<h1>Custom API Usage — ${mappings.providers.length} provider(s)</h1>
${cards}
</body></html>`;
    })
```

- [ ] **Step 3: Commit**

```bash
git add extension/extension.js
git commit -m "feat(extension): showDetails webview with per-provider cards + raw JSON"
```

---

### Task 21: Implement reorderProviders, removeProvider, exportMappings, importMappings, refreshProvider

**Files:**
- Modify: `extension/extension.js`

- [ ] **Step 1: Add the five commands to registerCommands**

Inside the `registerCommands` function, after the `setApiKey` block, add:

```js
    vscode.commands.registerCommand(`${PREFIX}.refreshProvider`, async () => {
      const mappings = providers.load(CUSTOM_DIR);
      if (mappings.providers.length === 0) {
        vscode.window.showInformationMessage('No providers configured.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        mappings.providers.map(p => ({ label: p.label, id: p.id, description: p.url })),
        { placeHolder: 'Select provider to refresh' }
      );
      if (!picked) return;
      const provider = mappings.providers.find(p => p.id === picked.id);
      if (provider) {
        await refreshOne(context, provider);
      }
    }),

    vscode.commands.registerCommand(`${PREFIX}.reorderProviders`, async () => {
      const mappings = providers.load(CUSTOM_DIR);
      if (mappings.providers.length < 2) {
        vscode.window.showInformationMessage('Need at least 2 providers to reorder.');
        return;
      }
      const sorted = [...mappings.providers].sort((a, b) =>
        (a.display?.order ?? 999) - (b.display?.order ?? 999)
      );
      const picked = await vscode.window.showQuickPick(
        sorted.map((p, i) => ({ label: `${i + 1}. ${p.label}`, id: p.id })),
        { placeHolder: 'Select the new FIRST provider (rest will follow in current order)' }
      );
      if (!picked) return;
      const idx = sorted.findIndex(p => p.id === picked.id);
      const reordered = [...sorted.slice(idx), ...sorted.slice(0, idx)].map(p => p.id);
      providers.reorder(CUSTOM_DIR, reordered);
      await rebuildFromDisk(context);
      vscode.window.showInformationMessage('custom-api-usage: providers reordered.');
    }),

    vscode.commands.registerCommand(`${PREFIX}.removeProvider`, async () => {
      const mappings = providers.load(CUSTOM_DIR);
      if (mappings.providers.length === 0) {
        vscode.window.showInformationMessage('No providers to remove.');
        return;
      }
      const picked = await vscode.window.showQuickPick(
        mappings.providers.map(p => ({ label: p.label, id: p.id, description: p.url })),
        { placeHolder: 'Select provider to remove' }
      );
      if (!picked) return;
      const confirm = await vscode.window.showWarningMessage(
        `Remove "${picked.label}" and delete its API key?`,
        { modal: true },
        'Remove'
      );
      if (confirm !== 'Remove') return;
      providers.remove(CUSTOM_DIR, picked.id);
      await providers.deleteApiKey(picked.id);
      await rebuildFromDisk(context);
      vscode.window.showInformationMessage(`custom-api-usage: "${picked.label}" removed.`);
    }),

    vscode.commands.registerCommand(`${PREFIX}.exportMappings`, async () => {
      try {
        const mappings = providers.load(CUSTOM_DIR);
        await vscode.env.clipboard.writeText(JSON.stringify(mappings, null, 2));
        vscode.window.showInformationMessage(
          `custom-api-usage: mappings.json copied to clipboard (${mappings.providers.length} provider(s)).`
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Export failed: ${err.message}`);
      }
    }),

    vscode.commands.registerCommand(`${PREFIX}.importMappings`, async () => {
      const text = await vscode.env.clipboard.readText();
      if (!text?.trim()) {
        vscode.window.showInformationMessage('Clipboard is empty.');
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        vscode.window.showErrorMessage(`Clipboard is not valid JSON: ${err.message}`);
        return;
      }
      if (!parsed.version || !Array.isArray(parsed.providers)) {
        vscode.window.showErrorMessage('Clipboard JSON does not look like a mappings file (missing version or providers).');
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Import ${parsed.providers.length} provider(s)? This will REPLACE your current mappings.json.`,
        { modal: true },
        'Replace'
      );
      if (confirm !== 'Replace') return;
      providers.save(CUSTOM_DIR, parsed);
      await rebuildFromDisk(context);
      vscode.window.showInformationMessage(`custom-api-usage: ${parsed.providers.length} provider(s) imported. Re-enter API keys for each.`);
    })
```

- [ ] **Step 2: Commit**

```bash
git add extension/extension.js
git commit -m "feat(extension): reorder, remove, export, import, refreshProvider commands"
```

---

## Phase 5: Skill

### Task 22: Create mapping.schema.json (JSON Schema for mapping validation)

**Files:**
- Create: `.claude/skills/custom-api-usage-analyze/templates/mapping.schema.json`

- [ ] **Step 1: Write the schema**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Custom API Usage — Mapping Config",
  "description": "Schema for ~/.custom-api-usage/mappings.json",
  "type": "object",
  "required": ["version", "providers"],
  "properties": {
    "version": { "const": 1 },
    "providers": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "label", "url", "method", "headers", "mapping", "display", "refreshIntervalMinutes"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$" },
          "label": { "type": "string", "minLength": 1 },
          "url": { "type": "string", "format": "uri" },
          "method": { "type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"] },
          "headers": { "type": "object", "additionalProperties": { "type": "string" } },
          "mapping": {
            "type": ["object", "null"],
            "properties": {
              "used":      { "$ref": "#/definitions/field" },
              "total":     { "$ref": "#/definitions/field" },
              "percent":   { "$ref": "#/definitions/percentField" },
              "resetTime": { "$ref": "#/definitions/resetTimeField" }
            }
          },
          "display": {
            "type": "object",
            "properties": {
              "order": { "type": "integer", "minimum": 1 },
              "showPercent": { "type": "boolean" },
              "showTimeLeft": { "type": "boolean" }
            }
          },
          "refreshIntervalMinutes": { "type": "integer", "minimum": 1, "maximum": 60 }
        }
      }
    }
  },
  "definitions": {
    "field": {
      "type": "object",
      "required": ["path"],
      "properties": {
        "path": { "type": "string", "minLength": 1 }
      }
    },
    "percentField": {
      "type": "object",
      "required": ["path"],
      "properties": {
        "path": { "type": "string", "minLength": 1 },
        "invert": { "type": "boolean" }
      }
    },
    "resetTimeField": {
      "type": "object",
      "required": ["path"],
      "properties": {
        "path": { "type": "string", "minLength": 1 },
        "unit": { "type": "string", "enum": ["ms", "s"] }
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/custom-api-usage-analyze/templates/mapping.schema.json
git commit -m "feat(skill): JSON Schema for mapping validation"
```

---

### Task 23: Create SKILL.md (Claude instructions for the analyzer)

**Files:**
- Create: `.claude/skills/custom-api-usage-analyze/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

````markdown
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
   - **Atomic write (same pattern as the extension):** write to `mappings.json.tmp`, unlink existing `mappings.json`, then rename `.tmp` → `mappings.json`. This prevents data loss if the extension is writing concurrently.

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
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/custom-api-usage-analyze/SKILL.md
git commit -m "feat(skill): Claude instructions for analyzer"
```

---

### Task 24: Test that the schema validates a sample mapping

**Decision: SKIP.** The JSON Schema in `mapping.schema.json` is documentation + skill tooling, not extension code. The extension trusts skill output. If invalid JSON is loaded, the extension fails gracefully per the spec's error matrix (status bar shows "⚠️ Bad mapping"). Adding an ajv dep just to validate skill output is YAGNI.

If a future need arises (e.g., to validate imports in the `importMappings` command), add a task here using `ajv` or `jsonschema` as a dep.

---

## Phase 6: Build, Test, Document

### Task 25: Add integration test scenarios to README

**Files:**
- Modify: `README.md` (append a "Manual Integration Tests" section)

- [ ] **Step 1: Append section**

Append at the end of `README.md`:

```markdown
## Manual Integration Tests

After installing the extension in VSCode (`code --install-extension custom-api-usage-0.1.0.vsix` and reload window), verify these scenarios:

| # | Scenario | Expected |
|---|---|---|
| 1 | First run, no providers | Status bar: `➕ Add a provider` hint |
| 2 | Run **Add Provider** for any real API | Raw fetched automatically; status bar shows `⚠️ <label>: Needs analyze` |
| 3 | Run `/custom-api-usage-analyze <id>` in Claude Code | Mapping written, status bar updates to `⚡ <label> 45% (2h30m)` |
| 4 | Add 2nd provider, run skill | Both status bar items visible, in `display.order` order |
| 5 | Add 5 providers (exceeds max visible) | First 2 visible + `⚡ +3 more` aggregate item; detail view shows all 5 |
| 6 | Run **Export Mappings** | `mappings.json` content visible in clipboard |
| 7 | Run **Import Mappings** with that clipboard | Toast: "N provider(s) imported" |
| 8 | Provider's API goes down | Status bar shows `⚠️ <label>: Error`; other providers unaffected |
| 9 | Edit `mappings.json` while VSCode is open | Reload on next refresh interval (or file watcher triggers immediate reload) |
| 10 | Run **Remove Provider** | Status bar item disappears, secret deleted |
| 11 | Run **Reorder Providers** | Status bar items swap order |
| 12 | API returns no percent field but has used/total | Status bar shows fallback `⚡ <label> 450/1000` format |
| 13 | API returns only partial data (used only) | Status bar shows minimal `⚡ <label>` format |
| 14 | `mappings.json` hand-edited with wrong JSONPath (all fields null) | Status bar: `⚠️ <label>: No data` → re-run skill |
| 15 | `mappings.json` hand-edited with empty mapping object | Status bar: `⚠️ <label>: Bad mapping` → re-run skill |
| 16 | Provider API requires POST (not GET) | Default fetch fails → `⚠️ <label>: Error` → manually set method in `mappings.json` → refresh works |
| 17 | Run **Refresh Provider** on a single provider | Only that provider refreshes; others unchanged |
| 18 | Crash during config write (simulate by killing process) | Stale `.tmp` cleaned up on next start; original `mappings.json` intact |
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add manual integration test scenarios"
```

---

### Task 26: Manual package + install in VSCode

**No code changes — manual verification only.**

- [ ] **Step 1: Run all unit tests**

```bash
npm test
```

Expected: All tests PASS (should be ~30 tests across providers.test.js, fetcher.test.js, fetcher.http.test.js).

- [ ] **Step 2: Package the extension**

```bash
npm run package
```

Expected: `custom-api-usage-0.1.0.vsix` file created in repo root.

- [ ] **Step 3: Install in VSCode**

```bash
code --install-extension custom-api-usage-0.1.0.vsix
```

Expected: VSCode shows "Extension installed successfully" notification.

- [ ] **Step 4: Reload window and verify**

Open VSCode Command Palette → "Developer: Reload Window".

Check that:
- No errors in Output → "Extension Host" log
- Running **Custom API Usage: Add Provider** shows the input prompts

- [ ] **Step 5: Run one integration test**

Use a real (or mock) API endpoint and verify the full flow:
1. Add provider
2. Run skill
3. Status bar updates

Document any issues found.

- [ ] **Step 6: Commit the .vsix artifact (or don't, per release preference)**

The release script in `scripts/release.sh` will handle artifact creation for actual releases. The manually built `.vsix` is just for local testing — add to `.gitignore` if not already.

Verify `.gitignore` includes `*.vsix` (it does from Task 5). The .vsix is NOT committed.

- [ ] **Step 7: Final commit (only if fixes were needed)**

```bash
git add -A
git status  # review what changed
git commit -m "fix: address issues from manual integration test" || echo "no changes"
```

---

## Phase 7: Cleanup & Final

### Task 27: Remove temporary .gitkeep files where dirs now have content

**Files:**
- Modify: `extension/.gitkeep` (delete)
- Modify: `test/.gitkeep` (delete)
- Modify: `.claude/skills/custom-api-usage-analyze/templates/.gitkeep` (delete)

- [ ] **Step 1: Remove empty .gitkeep files**

```bash
git rm extension/.gitkeep test/.gitkeep .claude/skills/custom-api-usage-analyze/templates/.gitkeep 2>/dev/null || true
```

(Errors are OK — the files are already removed by the prior `git add <actual files>`.)

- [ ] **Step 2: Verify working tree state**

```bash
git status
```

Expected: Clean working tree (no untracked .gitkeep files).

- [ ] **Step 3: Commit if there are changes**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore: remove gitkeep files now that dirs are populated"
```

---

### Task 28: Tag v0.1.0

- [ ] **Step 1: Create the tag**

```bash
git tag -a v0.1.0 -m "v0.1.0 — initial release of custom-api-usage

- Multi-provider support (N providers, reorderable)
- JSONPath-based mapping with 4 fixed fields
- /custom-api-usage-analyze Claude Code skill for mapping generation
- mappings.json syncable across machines
- API keys in VSCode SecretStorage (machine-local)"
```

- [ ] **Step 2: Verify the tag**

```bash
git tag -l
git show v0.1.0 --stat
```

Expected: `v0.1.0` listed. `git show` lists the commit and tag message.

---

## Acceptance Checklist

Before considering this plan complete, verify:

- [ ] `npm test` passes (all unit tests green)
- [ ] `npm run package` produces a valid .vsix
- [ ] `code --install-extension` succeeds in a real VSCode instance
- [ ] Add Provider flow works end-to-end with a real (or mock) API
- [ ] `/custom-api-usage-analyze` skill produces a working mapping
- [ ] Status bar shows usage after mapping is applied
- [ ] Reorder / Remove / Export / Import commands all work
- [ ] Per spec, no "MiniMax" or "minimax" string remains in repo
- [ ] Old `minimax-usage` repo is unchanged (this plan lives in new repo only after Task 1)

---

## Notes for the Implementer

- **Where to create the new repo:** `C:\dev\custom-api-usage\` (sibling to current `minimax-usage`). If you prefer a different path, adjust the paths in Task 1's cp commands.
- **VSCode module is only available inside VSCode** — `require('vscode')` will fail when running extension.js directly with Node. This is expected. The `node --test test/` runner never touches vscode.
- **Tests use `node:test`** — no jest/mocha. If you see a test that requires ajv, it was a placeholder and intentionally a no-op.
- **The `os.homedir()` in `extension.js` and `fetcher.js`** resolves to the current user's home dir. On Windows this is `C:\Users\<user>\`. The extension uses `~/.custom-api-usage/`.
- **`${apiKey}` placeholder** is resolved at fetch time, not at config-load time. This means a user can change their key in SecretStorage without restarting VSCode — next refresh picks up the new value.
- **File watcher is debounced by VSCode** — multiple rapid writes to `mappings.json` don't cause multiple rebuilds (the watcher fires onDidChange after the debounce).
- **The skill is the source of truth for mapping generation.** The extension trusts whatever JSON the skill writes. If invalid, the extension shows "⚠️ Bad mapping" per the spec's error matrix.
