# Next Steps — `custom-api-usage` v0.1.0 Handoff

> เอกสารนี้สรุปสิ่งที่ทำเสร็จ + งานที่เหลือ + context ที่ต้องจำ สำหรับคนที่จะ pick up ต่อ (รวมถึงตัวเองในอนาคต)

---

## 1. Current State ✅

Repo ใหม่ที่ `C:\dev\custom-api-usage\` build เสร็จแล้วตาม spec ใน `docs/superpowers/specs/2026-06-06-custom-api-usage-design.md` และ plan ใน `docs/superpowers/plans/2026-06-06-custom-api-usage.md`

**ทำเสร็จแล้ว:**
- 20 commits, 1 tag (`v0.1.0`)
- 30 unit tests ผ่านหมด (run ด้วย `npm test`)
- `npm run package` → `custom-api-usage-0.1.0.vsix` (28.15 KB)
- Extension ติดตั้งใน VSCode แล้ว (`code --list-extensions` เห็น `custom-api-usage.custom-api-usage`)
- All 8 commands registered: addProvider, setApiKey, refresh, showDetails, reorderProviders, removeProvider, exportMappings, importMappings
- Skill ที่ `.claude/skills/custom-api-usage-analyze/` (SKILL.md + mapping.schema.json)

**Working tree:** clean
**Tag:** `v0.1.0`

---

## 2. งานที่เหลือ (Your Next Steps)

### 2.1 Push ไป GitHub (สำคัญที่สุด)

Repo ยังอยู่แค่ local — ยัง push ขึ้น remote ไม่ได้

```bash
cd /c/dev/custom-api-usage

# 1. สร้าง repo บน GitHub: https://github.com/new
#    - Name: custom-api-usage
#    - Owner: Piyabordee
#    - Private หรือ Public ตามต้องการ
#    - **อย่า** check "Initialize with README" (เรามีแล้ว)

# 2. เพิ่ม remote แล้ว push
git remote add origin https://github.com/Piyabordee/custom-api-usage.git
git push -u origin main
git push --tags    # push tag v0.1.0 ด้วย
```

**Verify:** ไปที่ https://github.com/Piyabordee/custom-api-usage ควรเห็น:
- README, LICENSE, AGENTS.md
- 21 commits
- Tag `v0.1.0`
- ไฟล์ครบตาม structure

### 2.2 Test end-to-end ด้วย API จริง (ก่อน publish)

ทดสอบ flow จริงตาม integration tests ใน README section "Manual Integration Tests":

```bash
# 1. Reload window ใน VSCode หลัง install (ถ้ายังไม่ได้ทำ)
#    Cmd Palette → "Developer: Reload Window"

# 2. รัน Add Provider wizard:
#    Cmd Palette → "Custom API Usage: Add Provider"
#    - Label:  "Z.AI"  (หรือ provider ที่มี token จริง)
#    - URL:    https://api.z.ai/api/coding/paas/v4
#    - Key:    <token จริง>
#    → ควรเห็น status bar: "⚠️ Z.AI: Needs analyze"

# 3. รัน skill ใน Claude Code:
#    /custom-api-usage-analyze z-ai
#    → Claude จะอ่าน ~/.custom-api-usage/raw/z-ai.json
#    → ถาม candidate paths
#    → เขียน mapping
#    → status bar อัปเดตเป็น "⚡ Z.AI 45% (2h30m)" (หรือตามจริง)

# 4. ทดสอบ export → import flow:
#    - Cmd Palette → "Custom API Usage: Export Mappings"
#    - paste ใน editor (verify JSON)
#    - ลบ mapping
#    - Cmd Palette → "Custom API Usage: Import Mappings" (paste กลับ)
#    → ใช้งานได้
```

### 2.3 (Optional) Publish to VSCode Marketplace

```bash
# 1. สร้าง Personal Access Token ที่ https://dev.azure.com
#    (Organization: Piyabordee หรือ default)
#    - ตั้ง scope: Marketplace > Manage
#    - copy token

# 2. Login
cd /c/dev/custom-api-usage
npx vsce login Piyabordee   # ใส่ token เมื่อถาม

# 3. Publish
npx vsce publish
# หรือ publish minor/patch version:
# npx vsce publish minor
# npx vsce publish patch
```

**ผลลัพธ์:** Extension จะอยู่ที่ https://marketplace.visualstudio.com/items?itemName=Piyabordee.custom-api-usage

### 2.4 (Optional) ปรับปรุง README เพิ่ม

- ใส่ screenshot ของ status bar (ถ้ามี)
- เพิ่ม section "Troubleshooting" ถ้าเจอปัญหาระหว่างใช้งาน
- เพิ่ม link ไป Marketplace หลัง publish

---

## 3. Context ที่ต้องจำ ⚠️

### 3.1 CWD warning (สำคัญมาก)

**Default shell cwd คือ `C:\dev\minimax-usage\` (repo เก่า, frozen)** ตอนเริ่ม session

ถ้าจะทำงานกับ repo ใหม่ ต้อง `cd /c/dev/custom-api-usage/` **ก่อนทุกครั้ง**

ตัวอย่างจุดพลาดระหว่าง build: Task 22 ใส่ไฟล์ผิด repo (ลง minimax-usage แทน custom-api-usage) เพราะลืม cd

**Verify cwd ด้วย `pwd` ก่อน commit ทุกครั้ง** — ถ้าไม่ใช่ `/c/dev/custom-api-usage` อย่า commit

### 3.2 Repo เก่า (`minimax-usage`) — FROZEN

อย่าแก้ไขอะไรใน `C:\dev\minimax-usage\` อีก มันเป็น legacy single-provider extension

ถ้าจะ push legacy code ขึ้น GitHub (เก็บไว้ดู):
- Repo เก่ามี commits 0d4d684 (impl plan) และ cb686ec (enhance spec) แล้ว
- HEAD ปัจจุบัน: d2e91f4 (existing commit, ไม่ใช่ของเรา)
- ถ้าจะ archive ให้ push เป็น `minimax-usage-legacy` repo แยก

### 3.3 Secret key naming convention

API keys เก็บใน VSCode SecretStorage ด้วย key:
```
customApiUsage.providers.<id>.apiKey
```

ตัวอย่าง: `customApiUsage.providers.z-ai.apiKey`

ถ้าจะลบ key นอก extension (เช่น debug):
- เปิด Command Palette → "Developer: Set Log Level" + "Developer: Toggle Developer Tools"
- ใน console รัน: `await (await import('vscode')).env.secrets.delete('customApiUsage.providers.<id>.apiKey')`

### 3.4 Mappings config location

User-level file: `~/.custom-api-usage/mappings.json`

ไม่ควร commit file นี้ (มันอยู่ใน home dir ไม่ใช่ใน repo) — แต่ sync ข้ามเครื่องได้ด้วยตัวเอง (dotfiles, git private repo, etc.)

Raw cache: `~/.custom-api-usage/raw/<id>.json` — สร้างใหม่ทุกครั้งที่ fetch สำเร็จ ไม่ต้อง backup

### 3.5 Skill location

Claude Code จะหา skill ที่ `.claude/skills/custom-api-usage-analyze/SKILL.md` (ใน repo)

ถ้าจะใช้ skill นอก repo นี้ (เช่น dotfiles sync) — copy directory ทั้ง dir ไป

---

## 4. Quick Reference

### Commands

```bash
cd /c/dev/custom-api-usage    # ก่อนทำอะไรก็ตาม
pwd                          # verify cwd
npm test                     # 30 unit tests (~400ms)
npm run package              # produce .vsix
code --install-extension custom-api-usage-0.1.0.vsix
git status                   # ก่อน commit
```

### File map (อย่าลืม)

| Path | Purpose |
|---|---|
| `extension/extension.js` | VSCode entry, commands, status bar lifecycle (~340 lines) |
| `extension/providers.js` | mappings.json CRUD + SecretStorage (~100 lines) |
| `extension/fetcher.js` | HTTP + JSONPath extract + render (~150 lines) |
| `test/providers.test.js` | 13 tests for providers.js |
| `test/fetcher.test.js` | 12 tests for extract() + renderStatusBar() |
| `test/fetcher.http.test.js` | 5 tests with mock HTTP server |
| `.claude/skills/custom-api-usage-analyze/SKILL.md` | Claude skill instructions |
| `.claude/skills/custom-api-usage-analyze/templates/mapping.schema.json` | JSON Schema |
| `docs/superpowers/specs/2026-06-06-custom-api-usage-design.md` | Design spec (read this first) |
| `docs/superpowers/plans/2026-06-06-custom-api-usage.md` | Implementation plan (what was built) |

### In-VSCode commands (8 total)

| Command | What it does |
|---|---|
| `Custom API Usage: Add Provider` | 3-step wizard: label, URL, key |
| `Custom API Usage: Set API Key` | Replace stored key |
| `Custom API Usage: Refresh` | Re-fetch all |
| `Custom API Usage: Show Details` | Webview with all providers |
| `Custom API Usage: Reorder Providers` | Pick new first, rotate rest |
| `Custom API Usage: Remove Provider` | Pick, confirm, remove + delete secret |
| `Custom API Usage: Export Mappings` | Copy mappings.json to clipboard |
| `Custom API Usage: Import Mappings` | Paste from clipboard, validate, replace |

---

## 5. Known Limitations / Future Work

จาก review ของ subagents + plan's "Open Questions":

1. **`fetchAndCache` uses `new Promise(async ...)` anti-pattern** — ใช้งานได้ถูกต้อง แต่ syntax ไม่ clean ควร refactor ใน v0.2.0
2. **No automated UI tests** — VSCode extension testing หนักเกินไปสำหรับ scope นี้ (10 manual integration tests ใน README แทน)
3. **Single API key per provider** — ถ้าจะรองรับ multi-account ใน provider เดียว ต้อง redesign mapping
4. **Global 75%/90% color thresholds** — ไม่ใช่ per-provider configurable (YAGNI)
5. **No marketplace auto-publish** — manual ผ่าน `vsce publish` เท่านั้น
6. **No migration tooling** — `version: 1` ใน mappings.json รองรับอนาคต แต่ v0.2.0+ จะต้องเพิ่ม

---

## 6. Surprises / Gotchas ที่เจอระหว่าง Build

**สำหรับคนที่จะ modify code ในอนาคต:**

1. **Test runner glob issue** — `node --test test/` ไม่ทำงานบน Node v22.14.0 บน Windows (errors with "Cannot find module 'C:\\dev\\custom-api-usage\\test'"). ใช้ glob `test/*.test.js` แทน — fix อยู่ใน commit 6262441
2. **Sync test code vs async implementation** — Task 11 spec เขียน test แบบ sync แต่ implementation เป็น async (เพราะ VSCode SecretStorage เป็น async). Implementer ต้อง `await` ใน tests. ไม่ใช่ bug แต่เป็น spec inconsistency ที่ resolve แล้ว
3. **`renderStatusBar` stub 2/8 vacuous pass** — ตอน test renderStatusBar ครั้งแรก (Task 14), stub returns empty text/undefined colors ทำให้ 2 tests pass แบบไม่มีความหมาย. แก้ใน Task 15 เมื่อ implement จริง. ถ้าเพิ่ม tests ใหม่ ระวังเรื่องนี้
4. **Subagent cwd bug** — Subagents default to `C:\dev\minimax-usage\` (parent shell). ต้อง explicit `cd /c/dev/custom-api-usage/` ใน prompt ทุกครั้ง
5. **Refresh timer leak on deactivate** — Staggered `setTimeout` ใน `rebuildFromDisk` ไม่ได้ register ใน `context.subscriptions`. Leaks briefly ตอน deactivate แต่ short-circuit ที่ `if (!item) return` หลัง `state.items.clear()`. ไม่ critical แต่ควรรู้ไว้

---

## 7. Pre-PR Checklist (ถ้าจะเปิด PR ภายหลัง)

ก่อนส่ง PR (หรือก่อน merge feature ใหม่) verify:

- [ ] `npm test` ผ่านทั้ง 30 tests
- [ ] `npm run package` ผลิต .vsix ได้
- [ ] `code --install-extension` + reload window แล้ว extension activate ได้
- [ ] `git status` clean
- [ ] Commit messages ตาม Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- [ ] ไม่มี "MiniMax" หรือ provider names เฉพาะเจาะจงใน code/docs (extension เป็น generic)
- [ ] mappings.json ไม่ถูก commit (อยู่ใน home dir)

---

## 8. TL;DR — ถ้ามีเวลา 10 นาที

1. Push repo ขึ้น GitHub (Section 2.1)
2. ทดสอบกับ API จริง 1 ตัว (Section 2.2) — verify flow ทำงาน
3. ถ้าทำงาน → publish to marketplace (Section 2.3)

ถ้า flow ไม่ทำงาน → ดู Section 6 gotchas, debug, fix, commit, แล้วลองอีกครั้ง

**Status 2026-06-06:** v0.1.0 tagged และ tested locally — พร้อม push + publish เมื่อใดก็ได้
