# File Templates Reference

Complete file templates for all Streak challenge files. Claude generates these during challenge creation.

---

## Global Files

### config.md

```markdown
# Streak Configuration

Global settings for all challenges.

---

## Settings
- **Default cadence:** daily
- **Achievements:** enabled
- **Auto-insights:** enabled

## Preferences
- **Preferred check-in time:** [morning/afternoon/evening]
```

---

### active.md

```markdown
# Active Challenge

Points to the currently active challenge.

---

## Current Challenge

**Name:** [Challenge Name]
**Path:** `challenges/[challenge-id]`
**Type:** [learning|building|fitness|creative|habit|custom]
**Started:** [YYYY-MM-DD]
**Goal:** [One sentence goal]
```

---

## Per-Challenge Files

### challenge-config.md

```markdown
# Challenge Config

Metadata for this challenge.

---

## Challenge Info

**Name:** [Challenge Name]
**Type:** [learning|building|fitness|creative|habit|custom]
**Goal:** [One sentence goal]
**Cadence:** Every [X] [days/weeks]
**Started:** [YYYY-MM-DD]
**Priority:** [0-100, higher = shown first in list, default 0]

---

## Progress

**Check-ins:** [X]
**Current Streak:** [X] days
**Longest Streak:** [X] days
**Status:** [active|paused|archived|completed]
```

### challenge-log.md

```markdown
# [Challenge Name] Progress Log

**Goal:** [goal]
**Started:** [date]

---

## Summary

| # | Date | Summary | Streak | Key Learning |
|---|------|---------|--------|--------------|

---

## Detailed Log

### Session [X] - [Date]
**Summary:** [what was done]
**Reflection:** [how it went]
**Next:** [what's planned next]
**Key Learning:** [main takeaway]
```

### today.md

```markdown
# Today's Session

## Date
[YYYY-MM-DD]

---

## Energy & Time
[low ~30min | normal ~1hr | high 2hr+]

## Today's Focus
[specific thing to work on, or "open to suggestions"]

## Constraints
[any limitations today]

## Notes
[anything else relevant]
```

### backlog.md

```markdown
# Backlog

Ideas and things to try for this challenge.

---

## High Priority
- [ ] [Item] - [Why/Notes]

## Medium Priority
- [ ] [Item] - [Why/Notes]

## Someday/Maybe
- [ ] [Item] - [Why/Notes]

## Completed
- [x] [Item] - [Done on Session X]
```

### preferences.md

```markdown
# My Preferences

## Challenge Type
[auto-filled: learning | building | fitness | creative | habit | custom]

---

## [Primary Section - varies by type]
<!-- See type-specific reference files for details -->

---

## [Secondary Section - varies by type]

---

## Session Preferences
- **Preferred time:** [morning / afternoon / evening / flexible]
- **Typical duration:** [15min / 30min / 1hr / 2hr+]
- **Energy approach:** [low-key / moderate / intense]
```
