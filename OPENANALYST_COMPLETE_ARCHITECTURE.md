# OpenAnalyst - Complete Architecture & Implementation Guide

> AI-Powered SaaS Platform with Claude CLI, Agno Agent Orchestration, and Windmill Workflow Execution

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Component Deep Dive](#3-component-deep-dive)
4. [Data Flow & Communication](#4-data-flow--communication)
5. [Multi-Tenant Architecture](#5-multi-tenant-architecture)
6. [Skill System Design](#6-skill-system-design)
7. [Eval Loop & Retry Protocol](#7-eval-loop--retry-protocol)
8. [Windmill Integration for Per-User Apps](#8-windmill-integration-for-per-user-apps)
9. [Development Phases](#9-development-phases)
10. [Claude Code Instructions (CLAUDE.md)](#10-claude-code-instructions-claudemd)
11. [Troubleshooting & Error Recovery](#11-troubleshooting--error-recovery)
12. [Production Deployment Strategy](#12-production-deployment-strategy)

---

## 1. Executive Summary

### What is OpenAnalyst?

OpenAnalyst is a multi-tenant AI-powered SaaS platform that combines:

- **Claude CLI (Brain)**: The intelligent decision-making layer that processes user requests
- **Agno Agent Orchestrator**: Multi-agent framework that plans and coordinates task execution
- **Windmill**: Workflow engine that executes scripts, creates apps, and manages automations per user
- **PAI Skill System**: Modular capabilities loaded based on user intent
- **Eval Loop**: Self-correcting system with 3-retry + research protocol

### Core Value Proposition

Users interact with a natural language interface. The system:
1. Understands intent
2. Plans execution using available skills
3. Executes via Windmill (scripts, apps, workflows)
4. Evaluates output against expectations
5. Self-corrects or asks for clarification
6. Delivers results (reports, apps, scheduled tasks, etc.)

### Key Differentiators

- **Per-User Windmill Apps**: Each user gets isolated workspace with their own apps/workflows
- **Self-Correcting AI**: 3-retry with automatic web research for best practices
- **Skill-Based Architecture**: Modular, extensible capabilities
- **History System (UOCS)**: Learns from successes and failures

---

## 2. System Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER LAYER                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Web App (Next.js)  │  Mobile App  │  CLI Wrapper  │  API Clients      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket / HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COMMUNICATION LAYER                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                     WebSocket Hub (Node.js)                             ││
│  │  • Real-time bidirectional communication                                ││
│  │  • JWT Authentication                                                   ││
│  │  • Message routing between services                                     ││
│  │  • Per-user session management                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Redis Pub/Sub + Direct WS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BRAIN LAYER                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    Brain Service (Claude CLI)                           ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   ││
│  │  │   Intent    │  │   Skill     │  │   Memory    │  │   History   │   ││
│  │  │  Analyzer   │  │  Loader     │  │  Manager    │  │   (UOCS)    │   ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   ││
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │                        SKILL REGISTRY                            │   ││
│  │  │  CORE │ SOCIAL_MEDIA │ ANALYTICS │ WORKFLOW_BUILDER │ CUSTOM    │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │                         EVAL ENGINE                              │   ││
│  │  │  Execute → Compare → Retry (max 3) → Web Search → Re-execute    │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP + MCP
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATION LAYER                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    Agno Agent Orchestrator                              ││
│  │                                                                         ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                     ││
│  │  │ Coordinator │  │  Planner    │  │  Executor   │                     ││
│  │  │   Agent     │──│   Agent     │──│   Agent     │                     ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘                     ││
│  │         │                                  │                            ││
│  │         │         ┌─────────────┐         │                            ││
│  │         └─────────│ MCP Tools   │─────────┘                            ││
│  │                   └─────────────┘                                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ REST API + Webhooks
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXECUTION LAYER                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Windmill                                        ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────────┐  ││
│  │  │                    WORKSPACE: openanalyst                        │  ││
│  │  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │  ││
│  │  │  │  Scripts   │  │   Flows    │  │   Apps     │  │  Schedules │ │  ││
│  │  │  │ (per-user) │  │ (per-user) │  │ (per-user) │  │ (per-user) │ │  ││
│  │  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘ │  ││
│  │  └──────────────────────────────────────────────────────────────────┘  ││
│  │                                                                         ││
│  │  USER WORKSPACE ISOLATION:                                              ││
│  │  user_123/  │  user_456/  │  user_789/  │  ...                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            DATA LAYER                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ PostgreSQL  │  │   Redis     │  │     S3      │  │  User Apps  │        │
│  │ (metadata)  │  │  (cache)    │  │  (assets)   │  │  (hosted)   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Service Ports (Localhost Development)

| Service | Port | Purpose |
|---------|------|---------|
| Frontend | 3000 | User interface |
| Brain Service | 8080 | Claude CLI wrapper |
| Agno Orchestrator | 8001 | Multi-agent coordination |
| WebSocket Hub | 8002 | Real-time communication |
| Windmill | 8000 | Workflow execution |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Cache & pub/sub |

---

## 3. Component Deep Dive

### 3.1 Brain Service (Claude CLI Wrapper)

**Purpose**: The intelligent core that processes user requests, manages skills, and coordinates with Agno.

**Key Responsibilities**:
1. **Intent Analysis**: Understand what the user wants
2. **Skill Routing**: Match request to appropriate skill
3. **Context Management**: Maintain user memory and preferences
4. **History Recording**: Track all interactions (UOCS pattern)
5. **Eval Loop**: Self-correct on failures

**Directory Structure**:
```
services/brain/
├── src/
│   ├── index.ts              # Main entry point
│   ├── skills/
│   │   ├── loader.ts         # Loads SKILL.md files
│   │   └── registry.ts       # Routes to skills
│   ├── context/
│   │   └── memory.ts         # User memory management
│   ├── eval/
│   │   └── engine.ts         # Retry + research protocol
│   └── history/
│       └── system.ts         # UOCS implementation
├── skills/                   # Skill definitions (SKILL.md)
│   ├── CORE/
│   ├── SOCIAL_MEDIA/
│   ├── ANALYTICS/
│   └── WORKFLOW_BUILDER/
├── history/                  # Captured sessions/learnings
│   ├── sessions/
│   ├── learnings/
│   ├── successes/
│   └── failures/
└── package.json
```

### 3.2 Agno Agent Orchestrator

**Purpose**: Multi-agent system that plans and coordinates complex task execution.

**Agent Types**:

| Agent | Role |
|-------|------|
| **Coordinator** | Receives requests, decides which specialist to use |
| **Planner** | Creates execution plans with steps |
| **Executor** | Interfaces with Windmill to run tasks |
| **Researcher** | Web search when eval fails (future) |

**Key Features**:
- MCP (Model Context Protocol) support for tool integration
- Session management for multi-turn conversations
- Memory persistence across interactions
- FastAPI endpoints via AgentOS

**Directory Structure**:
```
services/agno/
├── main.py                   # FastAPI application
├── agents/
│   ├── coordinator.py        # Main routing agent
│   ├── planner.py           # Execution planner
│   └── executor.py          # Windmill interface
├── tools/
│   ├── windmill_client.py   # Windmill API client
│   └── mcp_tools.py         # MCP integrations
├── requirements.txt
└── Dockerfile
```

### 3.3 Windmill (Execution Engine)

**Purpose**: Execute scripts, create apps, manage workflows per user.

**Capabilities**:
- **Scripts**: Python, TypeScript, Go, Bash, SQL
- **Flows**: DAG-based workflow orchestration
- **Apps**: Auto-generated UIs from scripts
- **Schedules**: Cron-based task execution
- **Webhooks**: Trigger flows from external systems

**Multi-Tenant Structure**:
```
Workspace: openanalyst
├── f/openanalyst/           # Shared scripts
│   ├── core/
│   │   ├── send_ws_message.ts
│   │   └── log_activity.ts
│   ├── social/
│   │   ├── create_post.ts
│   │   └── schedule_post.ts
│   └── analytics/
│       ├── fetch_metrics.ts
│       └── generate_report.ts
│
├── u/user_123/              # User-specific
│   ├── scripts/
│   ├── flows/
│   └── apps/
│
└── u/user_456/              # Another user
    ├── scripts/
    ├── flows/
    └── apps/
```

### 3.4 WebSocket Hub

**Purpose**: Real-time communication between all services.

**Message Types**:
```
USER_REQUEST      → User sends message
ASSISTANT_TYPING  → Brain is processing
ASSISTANT_RESPONSE → Brain sends response
TASK_PROGRESS     → Windmill job progress
TASK_COMPLETE     → Job finished
TASK_ERROR        → Something failed
PING/PONG         → Heartbeat
```

---

## 4. Data Flow & Communication

### 4.1 Complete Request Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER REQUEST FLOW                                   │
└─────────────────────────────────────────────────────────────────────────────┘

1. USER INPUT
   └─→ "Create a Twitter post about AI trends and schedule it for tomorrow"

2. FRONTEND → WEBSOCKET HUB
   └─→ { type: "USER_REQUEST", payload: { content: "..." }, userId: "user_123" }

3. WEBSOCKET HUB → BRAIN (via Redis pub/sub)
   └─→ Enriches message with session context

4. BRAIN - Intent Analysis
   └─→ Extracts: intent="create_and_schedule", platform="twitter", topic="AI"

5. BRAIN - Skill Matching
   └─→ Matches SOCIAL_MEDIA skill (triggers: ["post", "twitter", "schedule"])

6. BRAIN - Context Loading
   └─→ Loads user preferences, recent tasks, custom instructions

7. BRAIN → AGNO (skill requires Windmill)
   └─→ {
         intent: "create_and_schedule",
         skill: "SOCIAL_MEDIA",
         context: { user_prefs, history },
         request: "Create a Twitter post..."
       }

8. AGNO - Coordinator Agent
   └─→ Analyzes request, delegates to Planner

9. AGNO - Planner Agent
   └─→ Creates plan:
       Step 1: Generate post content (f/openanalyst/social/create_post)
       Step 2: Schedule post (f/openanalyst/social/schedule_post)

10. AGNO - Executor Agent → WINDMILL
    └─→ Executes: POST /api/w/openanalyst/jobs/run/p/f/openanalyst/social/create_post

11. WINDMILL - Script Execution
    └─→ Runs TypeScript script, generates content

12. WINDMILL → AGNO (result)
    └─→ { content: "🚀 AI is transforming...", suggested_time: "2024-01-15T10:00:00Z" }

13. AGNO - Executor Agent → WINDMILL (Step 2)
    └─→ Schedules the post

14. AGNO → BRAIN (complete result)
    └─→ { response: "Created and scheduled post", metadata: { ... } }

15. BRAIN - Eval Loop
    └─→ Compare expected vs actual: ✓ Success

16. BRAIN - History Recording
    └─→ Save to sessions/, successes/

17. BRAIN → WEBSOCKET HUB → USER
    └─→ { type: "ASSISTANT_RESPONSE", payload: { content: "Done! Your post is scheduled..." } }
```

### 4.2 WebSocket Protocol

```typescript
// Message Structure
interface WSMessage {
  type: MessageType;
  userId: string;
  sessionId: string;
  payload: unknown;
  timestamp: number;
  messageId: string;
  correlationId?: string;  // Track request-response
}

// Example: User Request
{
  "type": "USER_REQUEST",
  "userId": "user_123",
  "sessionId": "sess_abc",
  "payload": {
    "content": "Create a Twitter post about AI",
    "attachments": []
  },
  "timestamp": 1703001234567,
  "messageId": "msg_xyz"
}

// Example: Assistant Response
{
  "type": "ASSISTANT_RESPONSE",
  "userId": "user_123",
  "sessionId": "sess_abc",
  "payload": {
    "messageId": "resp_123",
    "content": "Here's a draft post:\n\n🚀 AI is transforming...",
    "done": true,
    "metadata": {
      "skill": "SOCIAL_MEDIA",
      "duration": 2345,
      "windmillJob": "job_abc"
    }
  },
  "correlationId": "msg_xyz",
  "timestamp": 1703001236912
}
```

---

## 5. Multi-Tenant Architecture

### 5.1 User Isolation Strategy

Each user gets:

1. **Dedicated Windmill Folder**: `u/<user_id>/`
2. **Redis Namespace**: `openanalyst:context:<user_id>`
3. **Database Rows**: All tables have `user_id` column
4. **Session Isolation**: WebSocket connections per user

### 5.2 Windmill Per-User Apps

**Creating User Workspace**:
```python
# When new user signs up
async def create_user_workspace(user_id: str):
    # 1. Create folder in Windmill
    await windmill.create_folder(f"u/{user_id}")
    
    # 2. Create default scripts from templates
    templates = ["social_post", "analytics_report", "scheduler"]
    for template in templates:
        await windmill.copy_script(
            source=f"f/openanalyst/templates/{template}",
            dest=f"u/{user_id}/scripts/{template}"
        )
    
    # 3. Create default app
    await windmill.create_app(
        path=f"u/{user_id}/apps/dashboard",
        template="default_dashboard"
    )
```

**User App Hosting**:
```
User Dashboard URL: https://app.openanalyst.io/u/{user_id}/dashboard
User Custom Apps:   https://app.openanalyst.io/u/{user_id}/apps/{app_name}
```

### 5.3 Database Schema (Multi-Tenant)

```sql
-- All tables include user_id for isolation

CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    windmill_folder VARCHAR(255),  -- u/user_123
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    title VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_context (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) UNIQUE,
    preferences JSONB DEFAULT '{}',
    custom_instructions TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    windmill_job_id VARCHAR(255),
    status VARCHAR(50),
    input JSONB,
    output JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Row-level security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_conversations ON conversations
    FOR ALL USING (user_id = current_user_id());
```

---

## 6. Skill System Design

### 6.1 Skill Structure (PAI Pattern)

Each skill is a directory with:
```
skills/SKILL_NAME/
├── SKILL.md           # Main definition with frontmatter
├── workflows/         # Workflow definitions
│   ├── create.md
│   └── analyze.md
└── prompts/           # System prompts
    └── default.md
```

### 6.2 SKILL.md Format

```markdown
---
name: Social Media
description: Social media content creation, scheduling, and analytics
triggers:
  - post
  - tweet
  - social media
  - linkedin
  - twitter
  - instagram
  - schedule post
platforms:
  - twitter
  - linkedin
  - instagram
  - facebook
requires_windmill: true
priority: 5
---

# Social Media Skill

## Capabilities
1. **Content Creation** - Generate platform-optimized posts
2. **Scheduling** - Schedule posts for optimal times
3. **Analytics** - Analyze engagement metrics

## Windmill Scripts
- `f/openanalyst/social/create_post` - Generate content
- `f/openanalyst/social/schedule_post` - Schedule posting
- `f/openanalyst/social/analyze_engagement` - Get metrics

## System Prompt
```
You are a social media expert. Help users create engaging content.

Platform guidelines:
- Twitter: 280 chars, 2-3 hashtags, engaging hooks
- LinkedIn: Professional tone, industry hashtags
- Instagram: Visual-first, up to 30 hashtags
```

## Workflows

### create-post
1. Identify target platform
2. Analyze request for topic, tone
3. Generate platform-optimized content
4. Include hashtags and CTAs
5. Return draft for review

### schedule-post
1. Validate content
2. Determine optimal time
3. Create Windmill scheduled job
4. Return confirmation
```

### 6.3 Skill Loading Process

```typescript
// 1. On startup, load all SKILL.md files
const skills = await skillLoader.loadAll("./skills");

// 2. Parse frontmatter for triggers
skills.forEach(skill => {
  skill.triggers.forEach(trigger => {
    registry.register(trigger, skill);
  });
});

// 3. On request, match skill
const userRequest = "Create a Twitter post about AI";
const matched = registry.match(userRequest);
// Returns: { name: "Social Media", confidence: 0.9, triggers: ["twitter", "post"] }

// 4. Load skill context
const skillContext = await skillLoader.loadContext(matched.name);
// Returns: { systemPrompt, workflows, windmillScripts }
```

---

## 7. Eval Loop & Retry Protocol

### 7.1 The Eval Loop (From Your Handwritten Plan)

```
┌─────────────────────────────────────────────────────────────────┐
│                       EVAL LOOP                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐                     │
│  │ Execute │───▶│ Output  │───▶│ Compare │                     │
│  │  Task   │    │         │    │ Expected│                     │
│  └─────────┘    └─────────┘    │vs Actual│                     │
│                                 └────┬────┘                     │
│                                      │                          │
│                          ┌───────────┴───────────┐              │
│                          │                       │              │
│                    ┌─────▼─────┐          ┌─────▼─────┐        │
│                    │   YES     │          │    NO     │        │
│                    │  Success  │          │  Retry?   │        │
│                    └─────┬─────┘          └─────┬─────┘        │
│                          │                      │               │
│                    ┌─────▼─────┐          ┌─────▼─────┐        │
│                    │  Show to  │          │ Retry < 3 │        │
│                    │   User    │          │    ?      │        │
│                    └───────────┘          └─────┬─────┘        │
│                                                 │               │
│                                    ┌────────────┴────────────┐  │
│                                    │                         │  │
│                              ┌─────▼─────┐            ┌─────▼─────┐
│                              │   YES     │            │    NO     │
│                              │  Go to    │            │ Web Search│
│                              │  Step 2   │            │ Research  │
│                              └───────────┘            └─────┬─────┘
│                                                             │     │
│                                                       ┌─────▼─────┐
│                                                       │ Implement │
│                                                       │ Researched│
│                                                       │ Solution  │
│                                                       └─────┬─────┘
│                                                             │     │
│                                                       ┌─────▼─────┐
│                                                       │Still Fail?│
│                                                       │ Ask User  │
│                                                       │ Questions │
│                                                       └───────────┘
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Implementation

```typescript
class EvalEngine {
  private maxRetries = 3;

  async executeWithEval(task: Task): Promise<EvalResult> {
    let retryCount = 0;
    
    while (retryCount <= this.maxRetries) {
      try {
        // 1. Execute task
        const actual = await task.execute();
        
        // 2. Compare expected vs actual
        const isValid = this.compare(task.expected, actual);
        
        if (isValid) {
          // SUCCESS - Record and return
          await this.history.recordSuccess({ taskId: task.id, result: actual });
          return { success: true, result: actual };
        }
        
        // 3. Comparison failed
        const differences = this.findDifferences(task.expected, actual);
        
        // 4. After max retries, trigger research
        if (retryCount === this.maxRetries) {
          console.log("Max retries reached. Triggering web research...");
          const research = await this.webSearch(
            `2025 best practices ${task.type} ${differences.join(" ")}`
          );
          await this.history.recordResearch({ taskId: task.id, research });
          
          // Re-execute with researched knowledge
          const newResult = await task.executeWithContext(research);
          if (this.compare(task.expected, newResult)) {
            return { success: true, result: newResult, researchApplied: true };
          }
          
          // Still failed - ask user
          return {
            success: false,
            needsClarification: true,
            questions: this.generateQuestions(differences)
          };
        }
        
      } catch (err) {
        await this.history.recordFailure({ taskId: task.id, error: err });
      }
      
      retryCount++;
    }
  }
  
  private compare(expected: unknown, actual: unknown): boolean {
    // Flexible comparison for AI outputs
    if (typeof expected === "string" && typeof actual === "string") {
      // Check semantic similarity, not exact match
      const similarity = this.calculateSimilarity(expected, actual);
      return similarity > 0.7;
    }
    // ... other comparisons
  }
}
```

### 7.3 Web Research Protocol

```typescript
async function researchAndImplement(task: Task, failures: string[]): Promise<void> {
  // 1. Formulate search query
  const query = `${task.type} ${task.framework} best practices 2025 ${failures.join(" ")}`;
  
  // 2. Web search
  const results = await webSearch(query);
  
  // 3. Extract relevant information
  const relevantInfo = await claude.extract({
    content: results,
    prompt: "Extract actionable implementation steps"
  });
  
  // 4. Save to learnings
  await history.recordLearning({
    source: "web_research",
    content: relevantInfo,
    tags: [task.type, task.framework]
  });
  
  // 5. Re-execute with new knowledge
  const newContext = { ...task.context, learnings: relevantInfo };
  return task.execute(newContext);
}
```

---

## 8. Windmill Integration for Per-User Apps

### 8.1 Windmill API Integration

```typescript
class WindmillClient {
  private baseUrl: string;
  private token: string;
  private workspace = "openanalyst";

  // Run a script
  async runScript(path: string, args: Record<string, unknown>): Promise<JobResult> {
    const response = await fetch(
      `${this.baseUrl}/api/w/${this.workspace}/jobs/run/p/${path}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(args)
      }
    );
    
    const { id: jobId } = await response.json();
    return this.waitForJob(jobId);
  }

  // Create user-specific script
  async createUserScript(
    userId: string,
    scriptName: string,
    code: string,
    language: "typescript" | "python"
  ): Promise<void> {
    const path = `u/${userId}/scripts/${scriptName}`;
    
    await fetch(
      `${this.baseUrl}/api/w/${this.workspace}/scripts/create`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          path,
          content: code,
          language,
          summary: `User ${userId} script: ${scriptName}`
        })
      }
    );
  }

  // Create user-specific app
  async createUserApp(
    userId: string,
    appName: string,
    appDefinition: WindmillAppDefinition
  ): Promise<string> {
    const path = `u/${userId}/apps/${appName}`;
    
    await fetch(
      `${this.baseUrl}/api/w/${this.workspace}/apps/create`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          path,
          value: appDefinition,
          summary: `User ${userId} app: ${appName}`
        })
      }
    );
    
    // Return hosted URL
    return `${this.baseUrl}/apps/get/${path}`;
  }

  // Schedule a flow for user
  async scheduleUserFlow(
    userId: string,
    flowPath: string,
    schedule: string,  // cron expression
    args: Record<string, unknown>
  ): Promise<string> {
    const schedulePath = `u/${userId}/schedules/${Date.now()}`;
    
    const response = await fetch(
      `${this.baseUrl}/api/w/${this.workspace}/schedules/create`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          path: schedulePath,
          script_path: flowPath,
          schedule,
          args,
          enabled: true
        })
      }
    );
    
    return schedulePath;
  }
}
```

### 8.2 Example: Creating a User Dashboard App

```typescript
async function createUserDashboard(userId: string): Promise<string> {
  const windmill = new WindmillClient();
  
  // 1. Create analytics script for user
  const analyticsScript = `
    export async function main(userId: string) {
      // Fetch user-specific metrics
      const metrics = await fetchUserMetrics(userId);
      return {
        totalPosts: metrics.posts,
        engagement: metrics.engagement,
        followers: metrics.followers
      };
    }
  `;
  
  await windmill.createUserScript(userId, "fetch_analytics", analyticsScript, "typescript");
  
  // 2. Create dashboard app
  const dashboardApp = {
    type: "app",
    components: [
      {
        type: "text",
        content: "Your Analytics Dashboard"
      },
      {
        type: "chart",
        dataSource: `u/${userId}/scripts/fetch_analytics`,
        chartType: "bar"
      },
      {
        type: "button",
        label: "Refresh",
        action: "reload"
      }
    ]
  };
  
  const appUrl = await windmill.createUserApp(userId, "dashboard", dashboardApp);
  
  // 3. Return hosted URL
  return appUrl;  // https://windmill.openanalyst.io/apps/get/u/user_123/apps/dashboard
}
```

---

## 9. Development Phases

### Phase 0: Environment Setup (Day 1)

**Objective**: Get all infrastructure running locally

**Tasks**:
1. Create project structure
2. Set up Docker Compose with PostgreSQL, Redis, Windmill
3. Configure environment variables
4. Verify all services start

**Deliverables**:
- `docker-compose.yml`
- `.env.example`
- `scripts/health-check.sh`

**Checkpoint**: All services respond to health checks

---

### Phase 1: Core Services (Days 2-4)

**Objective**: Build WebSocket Hub, Brain Service skeleton, Agno skeleton

**Tasks**:
1. **WebSocket Hub** (Node.js/TypeScript)
   - Connection management
   - JWT authentication
   - Message routing
   - Redis pub/sub integration

2. **Brain Service** (Node.js/TypeScript)
   - Express server
   - Skill loading (basic)
   - Claude API integration
   - WebSocket client

3. **Agno Orchestrator** (Python/FastAPI)
   - Basic FastAPI endpoints
   - Coordinator agent
   - Windmill client

**Deliverables**:
- `services/websocket-hub/`
- `services/brain/`
- `services/agno/`

**Checkpoint**: Can send message from frontend → Brain → Agno → Windmill → back

---

### Phase 2: Windmill Integration (Days 5-6)

**Objective**: Set up Windmill workspace and core scripts

**Tasks**:
1. Create `openanalyst` workspace
2. Set up folder structure (`f/openanalyst/`, `u/` for users)
3. Create core scripts:
   - `f/openanalyst/core/send_ws_message.ts`
   - `f/openanalyst/social/create_post.ts`
   - `f/openanalyst/analytics/fetch_metrics.ts`
4. Create test flow
5. Integrate Agno → Windmill API

**Deliverables**:
- Windmill workspace configured
- Core scripts deployed
- Agno can execute scripts

**Checkpoint**: Agno successfully executes Windmill script

---

### Phase 3: Skill System (Days 7-9)

**Objective**: Implement full skill loading and routing

**Tasks**:
1. Create SKILL.md format parser
2. Implement SkillLoader class
3. Implement SkillRegistry class
4. Create initial skills:
   - CORE
   - SOCIAL_MEDIA
   - ANALYTICS
5. Integrate skill routing into Brain

**Deliverables**:
- `services/brain/src/skills/loader.ts`
- `services/brain/src/skills/registry.ts`
- `services/brain/skills/*.md`

**Checkpoint**: Brain correctly routes requests to skills

---

### Phase 4: Eval Loop & Memory (Days 10-12)

**Objective**: Implement self-correcting eval loop and user context

**Tasks**:
1. Implement EvalEngine with:
   - Execute → Compare → Retry logic
   - Web research after 3 failures
   - Question generation for clarification
2. Implement MemoryManager:
   - User preferences
   - Recent tasks
   - Learnings
3. Implement HistorySystem (UOCS):
   - Session recording
   - Success/failure tracking
   - Research storage

**Deliverables**:
- `services/brain/src/eval/engine.ts`
- `services/brain/src/context/memory.ts`
- `services/brain/src/history/system.ts`

**Checkpoint**: System retries failed tasks, performs web research

---

### Phase 5: Frontend (Days 13-15)

**Objective**: Build user interface

**Tasks**:
1. Next.js project setup
2. WebSocket client hook
3. Chat interface
4. Dashboard components
5. User settings

**Deliverables**:
- `frontend/` complete application

**Checkpoint**: End-to-end user flow works in browser

---

### Phase 6: Integration & Testing (Days 16-17)

**Objective**: Full system integration and testing

**Tasks**:
1. Integration tests for complete flow
2. Load testing
3. Error scenario testing
4. Performance optimization

**Deliverables**:
- Test suite
- Performance report

**Checkpoint**: All tests pass, system handles errors gracefully

---

### Phase 7: Production Prep (Days 18-20)

**Objective**: Prepare for AWS deployment

**Tasks**:
1. Terraform infrastructure
2. CI/CD pipeline
3. Monitoring setup
4. Security hardening
5. Documentation

**Deliverables**:
- `infrastructure/` Terraform files
- `.github/workflows/deploy.yml`
- Production documentation

**Checkpoint**: Ready for production deployment

---

## 10. Claude Code Instructions (CLAUDE.md)

This is the file you put in your project root for Claude Code to follow:

```markdown
# OpenAnalyst - Claude Code Instructions

## Project Overview
You are building OpenAnalyst, an AI-powered SaaS platform that combines:
- Claude CLI (Brain) for intelligent processing
- Agno for multi-agent orchestration  
- Windmill for workflow execution
- Per-user app hosting

## CRITICAL: Retry & Research Protocol

### When something fails:
1. First attempt: Try the straightforward approach
2. Second attempt: Check logs, adjust based on error
3. Third attempt: Different approach based on learnings
4. **AFTER 3 FAILURES**: STOP and do web search

### Web Search Protocol:
```bash
# When stuck after 3 retries:
1. Use web_search tool with query: "{technology} {problem} best practices 2025"
2. Read official documentation
3. Implement the researched solution
4. Document what you learned in docs/learnings/
```

### Example:
```
Task: Set up WebSocket with Redis pub/sub
Attempt 1: Basic implementation → Fails with connection error
Attempt 2: Add reconnection logic → Fails with serialization error
Attempt 3: Fix serialization → Fails with auth error
>>> TRIGGER WEB SEARCH <<<
Search: "ioredis websocket pub/sub authentication best practices 2025"
Read results, implement solution, document learning
```

## File Structure

```
openanalyst-project/
├── CLAUDE.md                    # This file
├── docker-compose.yml           # Services
├── .env                         # Environment (create from .env.example)
│
├── services/
│   ├── websocket-hub/           # Real-time communication
│   ├── brain/                   # Claude CLI wrapper
│   └── agno/                    # Multi-agent orchestrator
│
├── frontend/                    # Next.js application
│
├── docs/
│   ├── phases/                  # Development phase docs
│   ├── learnings/               # What you learn from research
│   └── architecture/            # System design docs
│
└── scripts/
    └── *.sh                     # Utility scripts
```

## Development Rules

### Before Starting Any Task:
1. Read the relevant phase document in `docs/phases/`
2. Check `docs/learnings/` for related solutions
3. Think through the approach before coding

### Code Style:
- TypeScript: Strict mode, async/await, proper types
- Python: Type hints, PEP 8, async where appropriate
- Always add error handling
- Always add logging

### After Completing Any Feature:
1. Test it works
2. Commit with conventional commit message
3. Update relevant documentation

## Commands

### Starting Services
```bash
docker compose up -d                    # Start all services
docker compose logs -f [service]        # View logs
./scripts/health-check.sh               # Verify health
```

### Testing
```bash
# Test Brain API
curl http://localhost:8080/health

# Test WebSocket
wscat -c ws://localhost:8002

# Test Agno
curl http://localhost:8001/health
```

## Current Phase
Check which phase you're on and follow its documentation:
- Phase 0: docs/phases/PHASE-0-environment.md
- Phase 1: docs/phases/PHASE-1-core-services.md
- etc.

## When You Get Stuck

1. Check error message carefully
2. Look in docs/learnings/ for similar issues
3. Try up to 3 different approaches
4. **After 3 failures**: Web search for 2025 best practices
5. Implement researched solution
6. Document the learning

## DO NOT:
- Retry the same approach more than 3 times
- Skip error handling
- Forget to document learnings
- Make assumptions without checking docs
```

---

## 11. Troubleshooting & Error Recovery

### Common Issues & Solutions

#### Docker Issues

| Problem | Solution |
|---------|----------|
| Port already in use | `lsof -i :PORT` then `kill -9 PID` |
| Container won't start | `docker compose logs [service]` |
| Out of disk space | `docker system prune -a` |

#### WebSocket Issues

| Problem | Solution |
|---------|----------|
| Connection refused | Check if WebSocket Hub is running |
| Auth failed | Verify JWT_SECRET matches |
| Messages not routing | Check Redis pub/sub subscription |

#### Brain Service Issues

| Problem | Solution |
|---------|----------|
| Anthropic API error | Verify ANTHROPIC_API_KEY |
| Skills not loading | Check SKILL.md format |
| Memory not persisting | Check Redis connection |

#### Windmill Issues

| Problem | Solution |
|---------|----------|
| Script execution failed | Check Windmill logs |
| Job timeout | Increase timeout in script |
| Permission denied | Check workspace permissions |

### Debug Commands

```bash
# Check all service health
./scripts/health-check.sh

# View specific service logs
docker compose logs -f brain
docker compose logs -f agno
docker compose logs -f windmill

# Connect to PostgreSQL
docker compose exec postgres psql -U openanalyst -d openanalyst

# Connect to Redis
docker compose exec redis redis-cli

# Test WebSocket manually
wscat -c ws://localhost:8002
```

---

## 12. Production Deployment Strategy

### AWS Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           AWS CLOUD                              │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                         VPC                                │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              Public Subnets                          │  │  │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │  │  │
│  │  │  │   ALB   │  │   ALB   │  │  NAT GW │             │  │  │
│  │  │  │ (HTTPS) │  │  (WS)   │  │         │             │  │  │
│  │  │  └────┬────┘  └────┬────┘  └─────────┘             │  │  │
│  │  └───────┼───────────┼────────────────────────────────┘  │  │
│  │          │           │                                    │  │
│  │  ┌───────┼───────────┼────────────────────────────────┐  │  │
│  │  │       │   Private Subnets                          │  │  │
│  │  │  ┌────▼────┐  ┌────▼────┐  ┌─────────┐            │  │  │
│  │  │  │   ECS   │  │   ECS   │  │   ECS   │            │  │  │
│  │  │  │Frontend │  │WS Hub   │  │  Brain  │            │  │  │
│  │  │  └─────────┘  └─────────┘  └────┬────┘            │  │  │
│  │  │                                  │                 │  │  │
│  │  │  ┌─────────┐  ┌─────────┐  ┌────▼────┐            │  │  │
│  │  │  │   ECS   │  │   RDS   │  │   ECS   │            │  │  │
│  │  │  │Windmill │  │Postgres │  │  Agno   │            │  │  │
│  │  │  └─────────┘  └─────────┘  └─────────┘            │  │  │
│  │  │                                                    │  │  │
│  │  │  ┌─────────┐  ┌─────────┐                         │  │  │
│  │  │  │ElastiC. │  │   S3    │                         │  │  │
│  │  │  │ Redis   │  │ Assets  │                         │  │  │
│  │  │  └─────────┘  └─────────┘                         │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Deployment Checklist

1. **Infrastructure**
   - [ ] VPC with public/private subnets
   - [ ] RDS PostgreSQL (multi-AZ)
   - [ ] ElastiCache Redis
   - [ ] ECS Fargate cluster
   - [ ] Application Load Balancers
   - [ ] S3 for static assets

2. **Security**
   - [ ] Secrets in AWS Secrets Manager
   - [ ] IAM roles for services
   - [ ] Security groups configured
   - [ ] SSL certificates

3. **CI/CD**
   - [ ] GitHub Actions workflow
   - [ ] ECR repositories
   - [ ] Automated testing
   - [ ] Blue/green deployment

4. **Monitoring**
   - [ ] CloudWatch dashboards
   - [ ] Alert policies
   - [ ] Log aggregation

---

## Summary

This document provides the complete architecture and implementation guide for OpenAnalyst. Key points:

1. **Architecture**: 4-layer system (User → Brain → Agno → Windmill)
2. **Multi-Tenant**: Per-user Windmill workspaces and apps
3. **Self-Correcting**: 3-retry + web research protocol
4. **Skill-Based**: Modular capabilities via SKILL.md files
5. **History**: UOCS pattern for learning from all interactions

**Next Steps**:
1. Set up the project with `CLAUDE.md` and phase documents
2. Start with Phase 0 (Environment Setup)
3. Progress through phases, using web research when stuck
4. Deploy to production when Phase 7 complete

---

*Document Version: 1.0*
*Last Updated: December 2024*
