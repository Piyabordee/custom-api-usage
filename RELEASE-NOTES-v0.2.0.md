## Custom API Usage v0.2.0 — Companion Skill, One Click

A generic, multi-provider VSCode extension that displays token/quota usage from **any JSON API** in your status bar.

### What's new in v0.2.0

The headline feature is **one-click companion skill install**. v0.1.0 worked, but installing the analyzer skill required manually copying two files into `~/.claude/skills/` — easy to get wrong, and the first time you ran the skill the raw cache was empty. v0.2.0 fixes both:

- **Skill ships in the extension.** Run **Custom API Usage: Install Companion Skill**, pick *User* (all projects) or *This workspace*, and the extension copies `SKILL.md` + `mapping.schema.json` into your Claude Code skills slot. Overwrite is guarded by a confirmation prompt.
- **Raw cache primes automatically.** When you add a provider, the extension now fetches the API once so `~/.custom-api-usage/raw/<id>.json` is populated. The skill finds data immediately. If the fetch fails (bad key, network down), the provider is still saved and surfaced as "Needs analyze" — Refresh retries later.
- **Status bar click → provider menu.** Clicking the status bar now opens a quick-pick with per-provider and global actions. No more guessing which command palette entry to run.

### Why?

The v0.1.0 flow had two rough edges that only became obvious after marketplace users actually tried it:

1. *"Where do I put the skill files?"* — the README said to copy from `.claude/skills/custom-api-usage-analyze/` in the repo, but marketplace users don't have the repo. Now the files ship inside the extension.
2. *"Why does the skill say raw file not found?"* — because nothing had fetched the API yet. Now `addProvider` fetches once on save.

### Highlights

| | |
|---|---|
| 🪄 | **One-click skill install** — User or workspace scope, overwrite guard |
| 🔁 | **Raw cache auto-primes** on `Add Provider` — skill finds data on first run |
| 🛠 | **Status bar click → Provider Menu** — quick-pick with 8 per-provider + 4 global actions |
| 📦 | **Leaner VSIX** — `.claude/**` and `docs/**` excluded (~340 KB → marketplace users get only the runtime) |
| 🧪 | **37 unit tests** (up from 30) — covers `installSkill` and `primeRawCache` |

### Commands (10 total)

| Command | Action |
|---|---|
| `Custom API Usage: Add Provider` | Wizard: label, URL, API key → saves + auto-primes raw cache |
| `Custom API Usage: Set API Key` | Replace stored API key for a provider |
| `Custom API Usage: Refresh` | Force re-fetch all providers immediately |
| `Custom API Usage: Show Details` | Open webview panel with usage cards + progress bars |
| `Custom API Usage: Reorder Providers` | Quick pick to reorder providers |
| `Custom API Usage: Remove Provider` | Remove provider + delete its SecretStorage key |
| `Custom API Usage: Export Mappings` | Copy `mappings.json` to clipboard (no secrets) |
| `Custom API Usage: Import Mappings` | Paste `mappings.json` from clipboard (merges providers) |
| **`Custom API Usage: Install Companion Skill`** | **NEW** — copy bundled skill into Claude Code's skills slot |
| **`Custom API Usage: Provider Menu`** | **NEW** — quick-pick reachable from status bar click |

### Quick Start (updated)

1. **Cmd Palette** → `Custom API Usage: Add Provider` — first fetch happens automatically
2. **Cmd Palette** → `Custom API Usage: Install Companion Skill` — pick *User* or *This workspace*
3. **Restart Claude Code**, then run `/custom-api-usage-analyze <provider-id>` to generate the mapping
4. Status bar updates automatically — e.g. `⚡ OpenAI 45% (2h30m)`

### Install

**From VSCode Marketplace:** search for "Custom API Usage" in the Extensions panel.

**From VSIX (manual):** download `custom-api-usage-0.2.0.vsix` below, then:

```bash
code --install-extension custom-api-usage-0.2.0.vsix
```

Reload VSCode, then run **Custom API Usage: Add Provider** from the Command Palette.

### Security

- **API keys** are stored exclusively in VSCode SecretStorage under `customApiUsage.providers.<id>.apiKey`.
- **`mappings.json`** is plain JSON with **zero secrets** — safe to sync via dotfiles.
- **No telemetry**, no third-party API calls. The extension only talks to the URLs you configure.

### Known Limitations (v0.2.0)

- `POST` request bodies still not supported (planned for v0.3.0)
- Color thresholds still global 75% / 90% (per-provider overrides planned for v0.3.0)
- Single API key per provider (multi-account requires schema change, planned for v0.3.0)

### What's Next (v0.3.0 preview)

- `POST` request bodies with `${apiKey}` and `${timestamp}` template substitution
- Per-provider color thresholds (`display.colorThreshold` field in `mappings.json`)
- Custom status bar label templates

See [CHANGELOG.md](https://github.com/Piyabordee/custom-api-usage/blob/main/CHANGELOG.md) for full v0.2.0 details, [README.md](https://github.com/Piyabordee/custom-api-usage#readme) for full usage, and [docs/superpowers/specs/2026-06-06-custom-api-usage-design.md](https://github.com/Piyabordee/custom-api-usage/blob/main/docs/superpowers/specs/2026-06-06-custom-api-usage-design.md) for design rationale.

### Upgrade Notes

- **No breaking changes** — `mappings.json` schema is unchanged from v0.1.0. All v0.1.0 providers continue to work.
- **Skill installation is opt-in** — existing users who already have the skill installed at `~/.claude/skills/custom-api-usage-analyze/` will be prompted before any overwrite.
- **The bundled skill is identical to the development copy** at `.claude/skills/custom-api-usage-analyze/` in the repo. If you develop on the repo and the install command would overwrite your edits, you'll be warned first.

### License

MIT © 2026 Piyabordee
