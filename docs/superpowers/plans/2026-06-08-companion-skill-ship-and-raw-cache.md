# Companion Skill Ship + Raw Cache Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the companion analyzer skill actually work end-to-end for marketplace users — (1) ship the skill files in the extension and let users install them into Claude Code with one command, (2) fix the raw-cache priming bug so the skill finds data immediately after `Add Provider`.

**Architecture:** Two pure-function modules with thin VSCode glue. `skill-installer.js` exposes `installSkill({sourceDir, destDir, overwrite})` → testable, no `os.homedir()`/no VSCode imports. `extension/extension.js` keeps all VSCode API calls in command wrappers and delegates copy logic to the module. Raw-cache priming piggybacks on the existing `fetchAndCache` in `fetcher.js` — no new HTTP code, just a one-line call in the `addProvider` command and a small reorder in `refreshOne`.

**Tech Stack:** Node.js `fs.promises`, `path`, `os`. VSCode API: `vscode.commands`, `vscode.window.showQuickPick`, `vscode.window.showInformationMessage`, `vscode.workspace.workspaceFolders`, `context.extensionPath`. Tests: `node:test` + `node:assert/strict` (matches existing `test/*.test.js`).

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `extension/skill/SKILL.md` | Bundled copy of analyzer skill instructions | **Create** (copy from `.claude/skills/custom-api-usage-analyze/SKILL.md`) |
| `extension/skill/templates/mapping.schema.json` | Bundled JSON Schema for validation | **Create** (copy from `.claude/skills/custom-api-usage-analyze/templates/mapping.schema.json`) |
| `extension/skill-installer.js` | Pure copy logic: `installSkill()` + `resolveDestDir()` | **Create** |
| `extension/extension.js` | Add `installCompanionSkill` command; fix `addProvider` to prime raw; fix `refreshOne` to fetch raw when missing | **Modify** |
| `package.json` | Register `customApiUsage.installCompanionSkill` command | **Modify** |
| `test/skill-installer.test.js` | Unit tests for `installSkill` (copy, overwrite, missing source) | **Create** |
| `test/raw-cache.test.js` | Integration test for raw-cache priming after `addProvider` | **Create** |
| `README.md` | Document the new "Install Companion Skill" flow | **Modify** |
| `.vscodeignore` | Ensure `extension/skill/**` is NOT excluded (it isn't by default — verify) | **Verify only** |

**Decomposition rationale:** `skill-installer.js` is its own module because file-copy is independent of VSCode lifecycle and the test file is large enough (≥5 cases) to warrant isolation. Raw-cache fix stays in `extension.js` because it's a 1-line call inside an existing command — extracting it would be over-engineering.

---

## Task 1: Bundle skill files inside the extension

**Files:**
- Create: `extension/skill/SKILL.md` (copy of `.claude/skills/custom-api-usage-analyze/SKILL.md`)
- Create: `extension/skill/templates/mapping.schema.json` (copy of `.claude/skills/custom-api-usage-analyze/templates/mapping.schema.json`)
- Verify: `.vscodeignore` does not exclude `extension/skill/**`

- [ ] **Step 1: Copy SKILL.md into the extension directory**

Run from repo root:
```bash
mkdir -p extension/skill/templates
cp .claude/skills/custom-api-usage-analyze/SKILL.md extension/skill/SKILL.md
```

Verify the copy:
```bash
diff .claude/skills/custom-api-usage-analyze/SKILL.md extension/skill/SKILL.md
```
Expected: no output (files are identical).

- [ ] **Step 2: Copy mapping.schema.json into the extension directory**

```bash
cp .claude/skills/custom-api-usage-analyze/templates/mapping.schema.json extension/skill/templates/mapping.schema.json
```

Verify:
```bash
diff .claude/skills/custom-api-usage-analyze/templates/mapping.schema.json extension/skill/templates/mapping.schema.json
```
Expected: no output.

- [ ] **Step 3: Verify .vscodeignore does not exclude the new files**

Read `.vscodeignore` and confirm that no line matches `extension/skill/**` or any parent of it. The current file (per the repo at planning time) excludes only `.vscode/**`, `.gitignore`, `.vscodeignore`, `test/**`, `docs/superpowers/plans/**`, `*.log` — none of these match `extension/skill/**`. **No edit needed.**

If the file ever changes to exclude `extension/skill/**`, this step must add an exception.

- [ ] **Step 4: Commit**

```bash
git add extension/skill/SKILL.md extension/skill/templates/mapping.schema.json
git commit -m "feat: bundle companion skill files in extension"
```

---

## Task 2: Create `skill-installer.js` with failing tests (TDD)

**Files:**
- Create: `extension/skill-installer.js`
- Create: `test/skill-installer.test.js`

- [ ] **Step 1: Write the failing test file**

Create `test/skill-installer.test.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

// Helper: isolated temp workspace with source and dest dirs
async function tempWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cau-skill-test-'));
  const sourceDir = path.join(root, 'source');
  const destDir = path.join(root, 'dest');
  fs.mkdirSync(path.join(sourceDir, 'templates'), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '# Test Skill\n\nBody.\n');
  fs.writeFileSync(path.join(sourceDir, 'templates', 'mapping.schema.json'), '{"version": 1}\n');
  return { sourceDir, destDir, cleanup: () => fsp.rm(root, { recursive: true, force: true }) };
}

test('installSkill: copies SKILL.md and templates/ recursively into destDir', async () => {
  const { sourceDir, destDir, cleanup } = await tempWorkspace();
  try {
    const { installSkill } = require('../extension/skill-installer');
    const result = await installSkill({ sourceDir, destDir, overwrite: false });
    assert.equal(result.installed, true);
    assert.equal(result.skipped, false);
    const skillExists = await fsp.stat(path.join(destDir, 'SKILL.md')).then(() => true).catch(() => false);
    const schemaExists = await fsp.stat(path.join(destDir, 'templates', 'mapping.schema.json')).then(() => true).catch(() => false);
    assert.equal(skillExists, true, 'SKILL.md should exist in destDir');
    assert.equal(schemaExists, true, 'templates/mapping.schema.json should exist in destDir');
  } finally {
    await cleanup();
  }
});

test('installSkill: creates destDir if it does not exist', async () => {
  const { sourceDir, destDir, cleanup } = await tempWorkspace();
  try {
    const { installSkill } = require('../extension/skill-installer');
    // destDir intentionally does not exist
    const result = await installSkill({ sourceDir, destDir, overwrite: false });
    assert.equal(result.installed, true);
    const stat = await fsp.stat(destDir);
    assert.equal(stat.isDirectory(), true);
  } finally {
    await cleanup();
  }
});

test('installSkill: with overwrite=false and existing files, returns skipped:true and does not modify', async () => {
  const { sourceDir, destDir, cleanup } = await tempWorkspace();
  try {
    // Pre-populate destDir with a different SKILL.md
    await fsp.mkdir(destDir, { recursive: true });
    await fsp.writeFile(path.join(destDir, 'SKILL.md'), '# Pre-existing — should NOT be overwritten');
    const { installSkill } = require('../extension/skill-installer');
    const result = await installSkill({ sourceDir, destDir, overwrite: false });
    assert.equal(result.skipped, true);
    assert.equal(result.installed, false);
    const content = await fsp.readFile(path.join(destDir, 'SKILL.md'), 'utf8');
    assert.match(content, /Pre-existing/);
  } finally {
    await cleanup();
  }
});

test('installSkill: with overwrite=true and existing files, replaces them', async () => {
  const { sourceDir, destDir, cleanup } = await tempWorkspace();
  try {
    await fsp.mkdir(destDir, { recursive: true });
    await fsp.writeFile(path.join(destDir, 'SKILL.md'), '# Pre-existing');
    const { installSkill } = require('../extension/skill-installer');
    const result = await installSkill({ sourceDir, destDir, overwrite: true });
    assert.equal(result.installed, true);
    assert.equal(result.skipped, false);
    const content = await fsp.readFile(path.join(destDir, 'SKILL.md'), 'utf8');
    assert.match(content, /Test Skill/);
  } finally {
    await cleanup();
  }
});

test('installSkill: throws if sourceDir does not exist', async () => {
  const { destDir, cleanup } = await tempWorkspace();
  try {
    const { installSkill } = require('../extension/skill-installer');
    await assert.rejects(
      () => installSkill({ sourceDir: '/nonexistent/path/xyz', destDir, overwrite: false }),
      /sourceDir not found/
    );
  } finally {
    await cleanup();
  }
});
```

- [ ] **Step 2: Run the test file to verify all 5 tests fail**

Run: `node --test test/skill-installer.test.js`
Expected: All 5 tests FAIL with "Cannot find module '../extension/skill-installer'".

- [ ] **Step 3: Write minimal `skill-installer.js` to make tests pass**

Create `extension/skill-installer.js`:
```javascript
const fsp = require('node:fs/promises');
const path = require('node:path');

/**
 * Recursively copy a directory tree from src to dest.
 * Creates dest if it doesn't exist.
 */
async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Install the companion analyzer skill by copying SKILL.md + templates/
 * from `sourceDir` into `destDir`.
 *
 * @param {object} opts
 * @param {string} opts.sourceDir - Absolute path to bundled skill dir (contains SKILL.md + templates/)
 * @param {string} opts.destDir   - Absolute path to Claude Code's skills slot (e.g. ~/.claude/skills/custom-api-usage-analyze)
 * @param {boolean} opts.overwrite - If true, replace existing files. If false, skip when destDir is non-empty.
 * @returns {Promise<{installed: boolean, skipped: boolean, error?: string}>}
 */
async function installSkill({ sourceDir, destDir, overwrite }) {
  try {
    await fsp.access(sourceDir);
  } catch {
    throw new Error(`sourceDir not found: ${sourceDir}`);
  }

  // If destDir exists and is non-empty and overwrite=false, skip
  let destExists = false;
  try {
    const stat = await fsp.stat(destDir);
    destExists = stat.isDirectory();
  } catch {
    destExists = false;
  }

  if (destExists && !overwrite) {
    const entries = await fsp.readdir(destDir);
    if (entries.length > 0) {
      return { installed: false, skipped: true };
    }
  }

  await copyDir(sourceDir, destDir);
  return { installed: true, skipped: false };
}

module.exports = { installSkill, copyDir };
```

- [ ] **Step 4: Run tests to verify they all pass**

Run: `node --test test/skill-installer.test.js`
Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add extension/skill-installer.js test/skill-installer.test.js
git commit -m "feat: add skill-installer module with TDD tests"
```

---

## Task 3: Wire `installCompanionSkill` command in extension.js

**Files:**
- Modify: `extension/extension.js` (add `require` at top + register command in `registerCommands`)
- Modify: `package.json` (add command to `contributes.commands`)

- [ ] **Step 1: Add `require` for the new module at top of extension.js**

In `extension/extension.js`, find the require block at the top (lines 1-5):
```javascript
const vscode = require('vscode');
const path = require('node:path');
const os = require('node:os');
const providers = require('./providers');
const { fetchAndCache, extract, renderStatusBar } = require('./fetcher');
```

Add a new line after the fetcher require:
```javascript
const { installSkill } = require('./skill-installer');
```

- [ ] **Step 2: Register the command in `package.json`**

In `package.json`, find `contributes.commands` and add one entry (any position in the array — the convention is alphabetical-ish, so put it after `importMappings`):
```json
{ "command": "customApiUsage.installCompanionSkill", "title": "Custom API Usage: Install Companion Skill" },
```

- [ ] **Step 3: Add the command handler in `registerCommands`**

In `extension/extension.js`, find the `registerCommands` function (starts around line 187). Add a new `vscode.commands.registerCommand` call inside the `context.subscriptions.push(...)` array — place it AFTER the `importMappings` registration (just before the closing `);` of the push call). Use this exact code:

```javascript
    vscode.commands.registerCommand(`${PREFIX}.installCompanionSkill`, async () => {
      // Ask user: install to user-level (~/.claude/skills/...) or project-level (<workspace>/.claude/skills/...)
      const target = await vscode.window.showQuickPick(
        [
          { label: '$(home) User (all projects)', description: '~/.claude/skills/custom-api-usage-analyze/', target: 'user' },
          { label: '$(folder) This workspace', description: '.claude/skills/custom-api-usage-analyze/ in the current workspace', target: 'project' }
        ],
        { placeHolder: 'Where should the companion skill be installed?' }
      );
      if (!target) return;

      let destDir;
      if (target.target === 'user') {
        destDir = path.join(os.homedir(), '.claude', 'skills', 'custom-api-usage-analyze');
      } else {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
          vscode.window.showErrorMessage('No workspace folder open. Open a folder first, or pick "User" instead.');
          return;
        }
        destDir = path.join(folders[0].uri.fsPath, '.claude', 'skills', 'custom-api-usage-analyze');
      }

      const sourceDir = path.join(context.extensionPath, 'skill');
      // If dest already has content, ask before overwriting
      let overwrite = false;
      try {
        const existing = await require('node:fs/promises').readdir(destDir);
        if (existing.length > 0) {
          const choice = await vscode.window.showWarningMessage(
            `Skill already installed at ${destDir}. Overwrite with the version bundled in this extension?`,
            { modal: true },
            'Overwrite'
          );
          if (choice !== 'Overwrite') return;
          overwrite = true;
        }
      } catch {
        // destDir does not exist — proceed without overwrite prompt
      }

      try {
        const result = await installSkill({ sourceDir, destDir, overwrite });
        if (result.skipped) {
          vscode.window.showInformationMessage(`custom-api-usage: skill already installed at ${destDir}.`);
        } else {
          vscode.window.showInformationMessage(
            `custom-api-usage: companion skill installed to ${destDir}. ` +
            `Restart Claude Code, then run /custom-api-usage-analyze <id>.`
          );
        }
      } catch (err) {
        vscode.window.showErrorMessage(`Skill install failed: ${err.message}`);
      }
    }),
```

- [ ] **Step 4: Run the existing test suite to make sure nothing broke**

Run: `npm test`
Expected: All existing tests pass. (`extension/extension.js` requires `vscode` which is not available in `node:test` — but the test runner only runs `test/*.test.js`, which doesn't import `extension.js`. So this should be a no-op for the test suite.)

Verify by reading the test file list:
```bash
ls test/
```
Expected: `fetcher.test.js`, `fetcher.http.test.js`, `providers.test.js`, `skill-installer.test.js` (the new one from Task 2). No `extension.test.js` exists.

- [ ] **Step 5: Commit**

```bash
git add extension/extension.js package.json
git commit -m "feat: register installCompanionSkill command"
```

---

## Task 4: Fix raw-cache priming in `addProvider` (TDD)

**Files:**
- Create: `test/raw-cache.test.js`
- Modify: `extension/extension.js` (in the `addProvider` command handler)

**Problem:** After `addProvider` saves a new provider, the user is told to run the skill — but `raw/<id>.json` is never populated, so the skill immediately fails with "Raw file not found".

**Fix:** In `addProvider`, after `providers.setApiKey(...)`, call `fetchAndCache(provider, CUSTOM_DIR, getApiKey)` to populate the raw cache. This wraps any fetch error in a warning toast (so addProvider doesn't fail if the API is temporarily down) but does not block the rest of the flow.

- [ ] **Step 1: Write a failing test for the priming logic**

The priming logic has a side effect on the filesystem and calls a network function. Extract the "after-save" steps into a testable function: `primeRawCache({ provider, customDir, getApiKey, fetchAndCache })` that returns `{ ok: boolean, error?: string }`. The command handler in `extension.js` will call this.

Create `test/raw-cache.test.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function tempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cau-raw-test-'));
  const customDir = path.join(dir, '.custom-api-usage');
  fs.mkdirSync(path.join(customDir, 'raw'), { recursive: true });
  return { home: dir, customDir };
}

// We test the priming logic in isolation by importing it from a thin shim.
// The actual implementation lives inside the addProvider command in extension.js;
// we refactor it into a small helper that we can call without VSCode APIs.
//
// For this test, we directly require the helper that the next task will create
// in extension.js and export. Until Task 4 step 3 creates it, this test will fail.
test('primeRawCache: writes raw/<id>.json when fetch succeeds', async () => {
  const { customDir } = tempHome();
  const { primeRawCache } = require('../extension/raw-cache');
  const fakeRaw = { data: { usage: { used: 5 } } };
  const fakeFetch = async () => fakeRaw;
  const provider = { id: 'demo', url: 'https://api.example.com', method: 'GET', headers: { Authorization: 'Bearer x' } };
  const result = await primeRawCache({
    provider,
    customDir,
    getApiKey: async () => 'test-key',
    fetchAndCache: fakeFetch
  });
  assert.equal(result.ok, true);
  const written = JSON.parse(fs.readFileSync(path.join(customDir, 'raw', 'demo.json'), 'utf8'));
  assert.deepEqual(written, fakeRaw);
});

test('primeRawCache: returns ok:false when fetch throws, does not write raw', async () => {
  const { customDir } = tempHome();
  const { primeRawCache } = require('../extension/raw-cache');
  const fakeFetch = async () => { throw new Error('network down'); };
  const provider = { id: 'demo', url: 'https://api.example.com', method: 'GET', headers: {} };
  const result = await primeRawCache({
    provider,
    customDir,
    getApiKey: async () => 'test-key',
    fetchAndCache: fakeFetch
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /network down/);
  const rawExists = fs.existsSync(path.join(customDir, 'raw', 'demo.json'));
  assert.equal(rawExists, false, 'raw should not be written on fetch failure');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/raw-cache.test.js`
Expected: FAIL with "Cannot find module '../extension/raw-cache'".

- [ ] **Step 3: Create `extension/raw-cache.js` with `primeRawCache`**

Create `extension/raw-cache.js`:
```javascript
/**
 * Prime the raw-response cache for a newly-added provider.
 * Best-effort: never throws, returns { ok, error? } so the caller can
 * decide whether to surface a warning toast to the user.
 *
 * @param {object} args
 * @param {object} args.provider       - The provider object (needs id, url, method, headers)
 * @param {string} args.customDir      - Path to ~/.custom-api-usage
 * @param {(id: string) => Promise<string|undefined>} args.getApiKey
 * @param {(provider: object, customDir: string, getApiKey: Function) => Promise<object>} args.fetchAndCache
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function primeRawCache({ provider, customDir, getApiKey, fetchAndCache }) {
  try {
    await fetchAndCache(provider, customDir, getApiKey);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { primeRawCache };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/raw-cache.test.js`
Expected: 2 tests PASS.

- [ ] **Step 5: Wire `primeRawCache` into the `addProvider` command**

In `extension/extension.js`:

1. Add require at the top with the other requires:
   ```javascript
   const { primeRawCache } = require('./raw-cache');
   ```

2. Find the `addProvider` command handler (around line 283-319). After the `await providers.setApiKey(id, key.trim());` line, add:
   ```javascript
   // Prime raw cache so the skill has something to analyze.
   // Best-effort: if the network is down or auth is wrong, we still want
   // the provider to be saved and surfaced as "Needs analyze".
   const primeResult = await primeRawCache({
     provider: { id, label: label.trim(), url: url.trim(), method: 'GET', headers: { Authorization: `Bearer ${key.trim()}` } },
     customDir: CUSTOM_DIR,
     getApiKey: (pid) => providers.getApiKey(pid),
     fetchAndCache
   });
   if (!primeResult.ok) {
     vscode.window.showWarningMessage(
       `custom-api-usage: provider "${label}" added, but first fetch failed: ${primeResult.error}. ` +
       `Use Refresh to retry after fixing credentials.`
     );
   }
   ```

3. Modify the success toast at the end of the command to mention this. Find:
   ```javascript
   vscode.window.showInformationMessage(
     `custom-api-usage: provider "${label}" added. ` +
     `Now run /custom-api-usage-analyze ${id} in Claude Code to generate the mapping.`
   );
   ```
   Replace with:
   ```javascript
   vscode.window.showInformationMessage(
     primeResult.ok
       ? `custom-api-usage: provider "${label}" added. ` +
         `Now run /custom-api-usage-analyze ${id} in Claude Code to generate the mapping.`
       : `custom-api-usage: provider "${label}" added, but raw fetch failed. ` +
         `Fix credentials and Refresh, then run /custom-api-usage-analyze ${id}.`
   );
   ```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: All tests pass (providers, fetcher, skill-installer, raw-cache).

- [ ] **Step 7: Commit**

```bash
git add extension/raw-cache.js extension/extension.js test/raw-cache.test.js
git commit -m "fix: prime raw cache after addProvider so skill finds data"
```

---

## Task 5: Make `refreshOne` fetch raw when mapping is missing AND raw is missing

**Files:**
- Modify: `extension/extension.js` (in `refreshOne`, before the `!provider.mapping` short-circuit)

**Problem:** Currently `refreshOne` returns early when mapping is empty, never fetching. If the user runs Refresh manually after addProvider's priming failed, the raw stays empty forever.

**Fix:** Before the early return, check if `raw/<id>.json` exists. If not, call `fetchAndCache` to populate it (best-effort, swallow error), then continue with the "Needs analyze" message.

- [ ] **Step 1: Read the relevant block in `refreshOne`**

In `extension/extension.js`, locate the early return around lines 121-128:
```javascript
  // Check if mapping exists
  if (!provider.mapping || !provider.mapping.used) {
    item.text = `$(warning) ${provider.label || provider.id}: Needs analyze`;
    item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    item.tooltip = `Run /custom-api-usage-analyze ${provider.id} in Claude Code to generate mapping.`;
    item.show();
    return;
  }
```

- [ ] **Step 2: Insert raw-fetch before the early return**

Replace the entire block above with this (note: also need to add `fs` to the requires if not present — see step 3):

```javascript
  // Check if mapping exists
  if (!provider.mapping || !provider.mapping.used) {
    // If raw cache is also missing, try to populate it now so the skill
    // has data to analyze the next time the user runs it.
    const rawPath = path.join(CUSTOM_DIR, 'raw', `${provider.id}.json`);
    if (!fs.existsSync(rawPath)) {
      try {
        await fetchAndCache(provider, CUSTOM_DIR, (id) => providers.getApiKey(id));
      } catch {
        // Silently swallow — we still want to show "Needs analyze" so the user
        // knows the next step is the skill, not debugging the fetch.
      }
    }
    item.text = `$(warning) ${provider.label || provider.id}: Needs analyze`;
    item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    item.tooltip = `Run /custom-api-usage-analyze ${provider.id} in Claude Code to generate mapping.`;
    item.show();
    return;
  }
```

- [ ] **Step 3: Ensure `fs` is required**

At the top of `extension/extension.js`, check if `const fs = require('node:fs');` is present. (Current file uses `node:path` and `node:os` but not `node:fs` directly — `existsSync` is needed now.)

If not present, add it to the require block:
```javascript
const fs = require('node:fs');
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: All tests still pass. (This change is in `extension.js` which is not loaded by tests, so no test changes are required — but we run the suite to verify nothing in the related modules broke.)

- [ ] **Step 5: Commit**

```bash
git add extension/extension.js
git commit -m "fix: refreshOne populates raw cache when mapping is missing"
```

---

## Task 6: Update README to document the new flow

**Files:**
- Modify: `README.md` (Setup section + add Skill Installation section)

- [ ] **Step 1: Update the Setup section**

In `README.md`, find the Setup section (lines 28-34):
```markdown
## Setup

1. Install the extension
2. Run **Custom API Usage: Add Provider**
3. Enter label, URL, API key
4. Run `/custom-api-usage-analyze` in Claude Code to generate the mapping
5. Status bar updates automatically
```

Replace with:
```markdown
## Setup

1. Install the extension
2. Run **Custom API Usage: Add Provider** — first fetch happens automatically
3. Enter label, URL, API key
4. Run **Custom API Usage: Install Companion Skill** (one-time, picks user or workspace scope)
5. Restart Claude Code, then run `/custom-api-usage-analyze <id>` to generate the mapping
6. Status bar updates automatically
```

- [ ] **Step 2: Add a new "Companion Skill" section after the existing "Skill" section**

Find the existing Skill section (around line 55-57):
```markdown
## Skill

See [`.claude/skills/custom-api-usage-analyze/SKILL.md`](.claude/skills/custom-api-usage-analyze/SKILL.md).
```

Replace with:
```markdown
## Skill

The analyzer skill is bundled in the extension and installed into Claude Code on demand.

**Install:**
1. Run **Custom API Usage: Install Companion Skill** from the command palette
2. Choose **User** (available in all projects) or **This workspace** (scoped to current folder)
3. Restart Claude Code

**Use:** `/custom-api-usage-analyze <provider-id>` — reads the raw cached response, asks 2-3 questions, writes the mapping.

The skill source is also in the repo at [`.claude/skills/custom-api-usage-analyze/SKILL.md`](.claude/skills/custom-api-usage-analyze/SKILL.md) for users who prefer manual install.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document companion skill install flow"
```

---

## Task 7: Final verification — package the VSIX and run all tests

**Files:** none modified

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass across `providers.test.js`, `fetcher.test.js`, `fetcher.http.test.js`, `skill-installer.test.js`, `raw-cache.test.js`.

- [ ] **Step 2: Verify `extension/skill/` is included in the VSIX**

Run: `npm run package`
Then: `vsce ls` (or unzip the .vsix and check `extension/skill/SKILL.md` is present).
Expected: `extension/skill/SKILL.md` and `extension/skill/templates/mapping.schema.json` are listed in the package contents.

- [ ] **Step 3: Smoke test by installing the VSIX locally**

Run: `code --install-extension custom-api-usage-*.vsix`
Then: open VSCode, run **Custom API Usage: Install Companion Skill**, pick "User", confirm the file appears at `~/.claude/skills/custom-api-usage-analyze/SKILL.md`.

- [ ] **Step 4: Tag the release**

```bash
git tag v0.2.0
git push origin v0.2.0
```

---

## Self-Review (completed by planner before handoff)

**1. Spec coverage:**
- ✅ Ship skill in extension → Task 1
- ✅ Install command (opt-in, user/project) → Task 3
- ✅ Raw-cache priming after addProvider → Task 4
- ✅ refreshOne fetches raw when missing → Task 5
- ✅ Docs updated → Task 6
- ✅ Final verification → Task 7

**2. Placeholder scan:** No "TBD"/"implement later"/"add appropriate error handling" found. All test code is complete. All command handler code is shown in full.

**3. Type consistency:**
- `installSkill({sourceDir, destDir, overwrite})` — used identically in tests (Task 2) and command (Task 3). ✓
- `primeRawCache({provider, customDir, getApiKey, fetchAndCache})` — used identically in tests (Task 4) and command (Task 4 step 5). ✓
- `fetchAndCache` is imported once at top of `extension.js` (line 5) and reused in Tasks 4-5. No re-import. ✓
- `context.extensionPath` is the VSCode API for "where this extension is installed" — used only in Task 3. ✓

**4. Risk callouts for the implementer:**
- The `.vscodeignore` already excludes `test/**` and `docs/superpowers/plans/**` — verify it does NOT grow a rule that matches `extension/skill/**` in the future.
- `primeRawCache` is best-effort by design: a failed prime must not block addProvider from completing.
- The `installCompanionSkill` command uses `vscode.workspace.workspaceFolders[0]` — this is always non-empty in trusted workspaces, but the code defensively checks. ✓
- Skill files are read at command-invocation time from `context.extensionPath/skill/` — extension updates will be picked up automatically on next install with `overwrite: true`.
