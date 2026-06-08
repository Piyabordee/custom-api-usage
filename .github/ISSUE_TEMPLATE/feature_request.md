---
name: Feature Request
about: Suggest a new mapping field, command, or display option
title: "[Feature]: "
labels: enhancement
---

## Problem

<!-- What can't you do today? Be specific. "I want to track token usage for X provider" beats "I want more features". -->

## Proposed Solution

<!-- How would you like it to work? -->

### Example mapping (if proposing a new field)
```json
{
  "id": "...",
  "mapping": {
    "newField": { "path": "$.data.foo", "extraOption": "..." }
  }
}
```

### Example status bar output
```
⚡ Provider 45% (2h30m) [+5 req/min]
```

## Alternatives Considered

<!-- What other approaches did you think about? Why is this one better? -->

## Workaround

<!-- Is there a way to achieve this with the current version (e.g., hand-editing `mappings.json`)? -->

## Use Case

<!-- Real-world scenario where this would help. The more concrete, the better. -->
