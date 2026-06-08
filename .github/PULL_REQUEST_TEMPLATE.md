## Description

<!-- What does this PR do? Link the issue it closes (if any): "Closes #123" -->

## Motivation & Context

<!-- Why is this change needed? What problem does it solve? -->

## Type of Change

<!-- Mark the relevant option with [x] -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Refactor (no functional change)
- [ ] Test addition or improvement

## How Has This Been Tested?

<!-- Describe the tests you ran. Include manual integration test results if applicable. -->

- [ ] `npm test` — all 30 unit tests pass
- [ ] Manual: ran extension in Extension Development Host
- [ ] Manual: tested scenario from README § Manual Integration Tests #__ (if applicable)

## Checklist

- [ ] My code follows the module boundaries in `CLAUDE.md` (no HTTP in `providers.js`, no FS in `fetcher.js`, no direct file IO in `extension.js`)
- [ ] I added/updated tests for my change (`npm test` still passes)
- [ ] I did NOT add any hardcoded API keys, tokens, or real URLs
- [ ] I updated `CHANGELOG.md` under the `[Unreleased]` section
- [ ] I updated `README.md` / `CLAUDE.md` if user-facing behavior changed

## Screenshots (if applicable)

<!-- For status bar / webview changes, paste before/after. -->
