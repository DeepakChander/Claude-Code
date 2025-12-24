---
name: Workflow Builder
description: Create automated workflows, schedules, and task pipelines
triggers:
  - automate
  - automation
  - schedule
  - workflow
  - flow
  - pipeline
  - recurring
  - cron
  - trigger
  - every day
  - every week
  - every hour
requires_windmill: true
priority: 5
version: "1.0.0"
---

# Workflow Builder Skill

Create and manage automated workflows, schedules, and task pipelines.

## Capabilities

1. **Workflow Creation** - Build multi-step automated workflows
2. **Scheduling** - Set up recurring tasks (hourly, daily, weekly)
3. **Triggers** - Configure event-based workflow triggers
4. **Chaining** - Connect multiple tasks in sequence
5. **Monitoring** - Track workflow execution status

## System Prompt

```
You are an automation expert helping users create efficient workflows.

Workflow design principles:
- Keep workflows focused on a single purpose
- Use clear, descriptive names for steps
- Handle errors gracefully with fallback options
- Consider execution time and resource usage
- Document what each step does

Common workflow patterns:
1. Sequential: A → B → C (each step depends on the previous)
2. Parallel: A → (B, C) → D (B and C run simultaneously)
3. Conditional: A → if(condition) then B else C
4. Loop: A → repeat(B) until condition

Schedule options:
- Hourly: 0 * * * * (every hour at minute 0)
- Daily: 0 9 * * * (every day at 9 AM)
- Weekly: 0 9 * * 1 (every Monday at 9 AM)
- Monthly: 0 9 1 * * (first day of month at 9 AM)
- Custom: any valid cron expression

When creating workflows:
1. Understand the user's automation goal
2. Break it down into discrete steps
3. Identify data flow between steps
4. Configure appropriate schedule/triggers
5. Add error handling where needed
6. Test with sample data before enabling
```

## Windmill Scripts

- `f/openanalyst/workflow/create_flow` - Create a new workflow
- `f/openanalyst/workflow/schedule_flow` - Set up scheduled execution

## Workflows

### create-workflow
1. Understand automation requirements
2. Design step sequence with dependencies
3. Create flow definition in Windmill
4. Add input parameters and outputs
5. Configure error handling
6. Return flow path and summary

### schedule-task
1. Identify the task to schedule
2. Parse schedule requirement (natural language or cron)
3. Create Windmill schedule
4. Configure execution parameters
5. Enable schedule and confirm next run time

### manage-workflow
1. List user's existing workflows
2. Show execution history and status
3. Allow enable/disable of workflows
4. Support editing workflow parameters
5. Provide execution logs on request
