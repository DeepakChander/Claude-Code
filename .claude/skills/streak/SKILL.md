---
name: streak
description: Universal challenge tracker with flexible cadence, intelligent insights, and cross-challenge learning detection. Use when user wants to track any personal challenge - learning, habits, building, fitness, creative, or custom. Supports daily, weekly, or N-day check-ins with type-adaptive preferences, backlog, and context files.
---

# Streak

A universal, flexible challenge tracking system for Claude Code. Track any personal challenge with intelligent insights and cross-challenge learning detection.

**Works for any challenge type:** Learning, Building, Fitness, Creative, Habit, or Custom.

---

## Quick Start
See available commands using `/help`.

**Trigger phrases -> Flows:**

| User Says | Flow |
|-----------|------|
| "new challenge", "start a streak", "track a goal" | Flow 1: New Challenge |
| "check in", "log progress", "update my streak" | Flow 2: Check-in |
| "list challenges", "show all challenges" | Flow 3: List |
| "switch to [name]", "change challenge" | Flow 4: Switch |
| "show stats", "my progress" | Flow 5: Statistics |
| "show insights", "cross-challenge" | Flow 6: Insights |
| "export calendar", "create reminders" | Flow 7: Calendar |
| "reset challenge", "start fresh" | Flow 8: Reset |
| "pause [name]", "put on hold" | Flow 9: Pause |
| "archive [name]", "shelve challenge" | Flow 10: Archive |
| "resume [name]", "reactivate" | Flow 11: Resume |

---

## Data Storage

All data in `.streak/` folder:

```
.streak/
├── config.md                     # Global settings
├── active.md                     # Current challenge pointer
└── challenges/
    └── [challenge-id]/
        ├── challenge-config.md   # Metadata, goal, progress
        ├── challenge-log.md      # Progress log with summary
        ├── today.md              # Today's session context
        ├── backlog.md            # Ideas to try
        ├── preferences.md        # Type-adaptive setup
        ├── context.md            # Linked resources
        ├── insights.md           # Auto-generated insights
        └── sessions/
            └── session-XXX/
                └── notes.md      # Session notes
```

**File templates:** See `.claude/skills/streak/references/file-templates.md`

---

## Challenge Types

| Type | Best For | Key Questions |
|------|----------|---------------|
| **Learning** | Courses, books, skills | "Any aha moments?", "Progress on milestones?" |
| **Building** | Projects, shipping | "What did you ship?", "Any blockers?" |
| **Fitness** | Workouts, health | "What exercises?", "How did body feel?" |
| **Creative** | Art, writing, music | "What did you create?", "Any inspiration?" |
| **Habit** | Routines, consistency | "Did you complete it?", "How did it feel?" |
| **Custom** | Anything else | User-defined questions |

**Type details:** See `.claude/skills/streak/references/types.md`

---

<!-- Full Flow Logic Omitted for Brevity - Agent should use Reference Files -->
## Logic Instructions

1. **Context Loading**: Always look for `.streak/active.md` to identify the current challenge.
2. **File Operations**: Use `Read`, `Write` tools to manage state. NEVER ask user to edit files manually.
3. **Paths**: Always use relative paths inside `.streak/`.
4. **Insights**: Generate insights after every 3 check-ins or when a pattern is detected.
