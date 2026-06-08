---
name: Bug Report
about: Something isn't working as documented
title: "[Bug]: "
labels: bug
---

## Summary

<!-- One-sentence description of the bug. -->

## Steps to Reproduce

1.
2.
3.

## Expected Behavior

<!-- What should happen? -->

## Actual Behavior

<!-- What actually happens? Include the exact status bar text. -->

## Environment

- VSCode version: <!-- Help → About -->
- Extension version: <!-- bottom of "Show Details" webview, or `code --list-extensions --show-versions` -->
- OS: <!-- Windows 11 / macOS 14 / Ubuntu 24.04 / etc. -->
- Node version (if running tests): <!-- `node --version` -->

## Configuration

<!-- Paste the relevant `mappings.json` provider block (NOT your API key) -->
```json
{
  "id": "...",
  "url": "...",
  "method": "...",
  "headers": { "...": "..." },
  "mapping": { "...": "..." }
}
```

## API Response Shape

<!-- Paste a redacted sample of the raw API response (remove API keys, account IDs, etc.) -->
```json
{
  "data": { "...": "..." }
}
```

## Logs

<!-- Open "Output → Extension Host" and select "Custom API Usage" channel. Paste relevant lines. -->

```

```

## Checklist

- [ ] I removed my API key from all pasted snippets
- [ ] I tried **Custom API Usage: Refresh** to rule out a transient error
- [ ] I checked the [Troubleshooting / FAQ](#) in README
