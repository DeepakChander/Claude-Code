# Phase 3: Skill System Implementation

## Objective
Implement the skill-based architecture (following PAI/Claude Code patterns) that enables the Brain to route requests intelligently.

## Skill Architecture (from Task 1 Plan)
```
User → Brain → KB + Memory (Sandbox) → Windmill
         ↓
    [Intent → Tools Available → Plan + Reason → Tasks using Skills → Eval]
         ↓
    Skill prompts / Workflow + Agno Prompt
```

## Skill Structure

### Directory Layout
```
services/brain/skills/
├── CORE/
│   ├── SKILL.md              # Core routing and orchestration
│   └── workflows/
│       ├── route-request.md
│       └── error-recovery.md
├── SOCIAL_MEDIA/
│   ├── SKILL.md              # Social media automation
│   └── workflows/
│       ├── create-post.md
│       ├── schedule-content.md
│       └── analyze-performance.md
├── ANALYTICS/
│   ├── SKILL.md              # Analytics and reporting
│   └── workflows/
│       ├── generate-report.md
│       └── aggregate-metrics.md
├── WORKFLOW_BUILDER/
│   ├── SKILL.md              # Create Windmill workflows
│   └── workflows/
│       ├── create-script.md
│       └── create-flow.md
└── USER_MANAGEMENT/
    ├── SKILL.md              # User context and memory
    └── workflows/
        ├── store-preference.md
        └── recall-context.md
```

## Tasks

### 3.1 Create CORE Skill
**File**: `services/brain/skills/CORE/SKILL.md`

```markdown
---
name: Core
description: Core orchestration and routing capabilities for OpenAnalyst
triggers:
  - "help"
  - "start"
  - "status"
  - "what can you do"
  - "list capabilities"
always_load: true
---

# Core Orchestration Skill

## Purpose
Route user requests to appropriate skills and coordinate responses.

## Capabilities
1. **Intent Detection**: Analyze user request to determine intent
2. **Skill Routing**: Route to appropriate specialized skill
3. **Error Recovery**: Handle failures with retry + research protocol
4. **Context Management**: Maintain conversation state

## Routing Rules
- Social media keywords → SOCIAL_MEDIA skill
- Analytics/metrics/report → ANALYTICS skill
- Create/build/workflow → WORKFLOW_BUILDER skill
- Remember/preference/setting → USER_MANAGEMENT skill
- Unknown → Ask clarifying questions

## Workflows
- route-request.md: Main request routing logic
- error-recovery.md: 3-retry + research protocol

## Windmill Scripts
- f/openanalyst/core/log_activity
- f/openanalyst/core/send_ws_message
- f/openanalyst/core/error_handler
```

### 3.2 Create SOCIAL_MEDIA Skill
**File**: `services/brain/skills/SOCIAL_MEDIA/SKILL.md`

```markdown
---
name: Social Media
description: Social media content creation, scheduling, and analytics
triggers:
  - "post"
  - "social media"
  - "twitter"
  - "linkedin"
  - "schedule"
  - "content"
  - "engagement"
platforms:
  - twitter
  - linkedin
  - instagram
  - facebook
---

# Social Media Automation Skill

## Purpose
Automate social media management tasks via Windmill workflows.

## Capabilities
1. **Content Creation**: Generate post content with AI
2. **Scheduling**: Schedule posts across platforms
3. **Analytics**: Track engagement and performance
4. **Optimization**: Suggest best posting times

## Windmill Scripts
- f/openanalyst/social/create_post
- f/openanalyst/social/schedule_post
- f/openanalyst/social/analyze_engagement
- f/openanalyst/social/get_best_times

## Workflows
### create-post.md
Steps:
1. Analyze request for platform and content type
2. Generate content using AI
3. Format for target platform
4. Return draft for approval or auto-post

### schedule-content.md
Steps:
1. Parse scheduling parameters
2. Validate platform connections
3. Queue in Windmill scheduler
4. Confirm with user

## Required Resources
- Platform OAuth tokens (via Windmill resources)
- User preferences for tone/style

## Error Handling
- Missing credentials → Guide user to connect platform
- Rate limits → Queue and retry with backoff
- Content rejection → Suggest modifications
```

### 3.3 Create WORKFLOW_BUILDER Skill
**File**: `services/brain/skills/WORKFLOW_BUILDER/SKILL.md`

```markdown
---
name: Workflow Builder
description: Create and manage Windmill scripts, flows, and apps
triggers:
  - "create script"
  - "build workflow"
  - "make flow"
  - "automate"
  - "create app"
  - "build api"
---

# Workflow Builder Skill

## Purpose
Enable users to create custom Windmill workflows through natural language.

## Capabilities
1. **Script Creation**: Generate Windmill scripts in any supported language
2. **Flow Building**: Create multi-step workflow DAGs
3. **App Generation**: Build simple UIs for scripts
4. **API Creation**: Turn scripts into webhooks

## Agno Coordination
This skill heavily relies on Agno for:
- Deciding script language based on task
- Breaking complex requests into flow steps
- Validating generated code

## Windmill Integration

### Creating a Script
```typescript
// Agno decides parameters, Brain formats request
{
  action: "create_script",
  params: {
    path: "f/openanalyst/user_scripts/{user_id}/{script_name}",
    language: "typescript", // or python, go, bash
    code: "...", // Generated by Agno
    description: "User description",
    schema: { /* input schema */ }
  }
}
```

### Creating a Flow
```typescript
{
  action: "create_flow",
  params: {
    path: "f/openanalyst/user_flows/{user_id}/{flow_name}",
    modules: [
      { id: "a", script: "path/to/script1", inputs: {...} },
      { id: "b", script: "path/to/script2", inputs: {...}, depends: ["a"] }
    ]
  }
}
```

## Workflows
### create-script.md
1. Parse user request
2. Send to Agno for code generation
3. Validate generated code
4. Deploy to Windmill
5. Test execution
6. Return result/link

### create-flow.md
1. Break down user request into steps
2. Identify existing scripts or need for new ones
3. Define DAG structure
4. Create flow in Windmill
5. Run test execution
6. Return result

## Eval Loop (from Task 1)
After creation:
1. Execute the script/flow
2. Compare expected vs actual output
3. If failed and retries < 3: adjust and retry
4. If failed 3 times: research best practices, implement, retry
5. Store successful patterns for future reference
```

### 3.4 Skill Loader Implementation
**File**: `services/brain/src/skills/loader.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

interface SkillMetadata {
  name: string;
  description: string;
  triggers: string[];
  always_load?: boolean;
}

interface Skill {
  metadata: SkillMetadata;
  content: string;
  workflows: Map<string, string>;
  path: string;
}

export class SkillLoader {
  private skills: Map<string, Skill> = new Map();
  private skillsDir: string;

  constructor(skillsDir: string) {
    this.skillsDir = skillsDir;
  }

  async loadAll(): Promise<void> {
    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await this.loadSkill(entry.name);
      }
    }
  }

  private async loadSkill(skillName: string): Promise<void> {
    const skillPath = path.join(this.skillsDir, skillName, 'SKILL.md');
    
    if (!fs.existsSync(skillPath)) return;

    const content = fs.readFileSync(skillPath, 'utf-8');
    const { metadata, body } = this.parseSkillMd(content);
    
    // Load workflows
    const workflows = new Map<string, string>();
    const workflowsDir = path.join(this.skillsDir, skillName, 'workflows');
    
    if (fs.existsSync(workflowsDir)) {
      const workflowFiles = fs.readdirSync(workflowsDir);
      for (const file of workflowFiles) {
        const workflowContent = fs.readFileSync(
          path.join(workflowsDir, file), 
          'utf-8'
        );
        workflows.set(file.replace('.md', ''), workflowContent);
      }
    }

    this.skills.set(skillName, {
      metadata,
      content: body,
      workflows,
      path: skillPath
    });
  }

  private parseSkillMd(content: string): { metadata: SkillMetadata; body: string } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (frontmatterMatch) {
      const metadata = yaml.parse(frontmatterMatch[1]) as SkillMetadata;
      return { metadata, body: frontmatterMatch[2] };
    }
    
    return { 
      metadata: { name: 'unknown', description: '', triggers: [] }, 
      body: content 
    };
  }

  findSkillForRequest(request: string): Skill | null {
    const lowerRequest = request.toLowerCase();
    
    for (const [name, skill] of this.skills) {
      for (const trigger of skill.metadata.triggers) {
        if (lowerRequest.includes(trigger.toLowerCase())) {
          return skill;
        }
      }
    }
    
    // Default to CORE skill
    return this.skills.get('CORE') || null;
  }

  getAlwaysLoadSkills(): Skill[] {
    return Array.from(this.skills.values())
      .filter(s => s.metadata.always_load);
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }
}
```

### 3.5 Skill Registry
**File**: `services/brain/src/skills/registry.ts`

```typescript
import { SkillLoader, Skill } from './loader';

export class SkillRegistry {
  private loader: SkillLoader;
  private initialized: boolean = false;

  constructor(skillsDir: string) {
    this.loader = new SkillLoader(skillsDir);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loader.loadAll();
    this.initialized = true;
  }

  getContextForRequest(request: string): string {
    const alwaysLoad = this.loader.getAlwaysLoadSkills();
    const matchedSkill = this.loader.findSkillForRequest(request);
    
    let context = '';
    
    // Add always-load skills
    for (const skill of alwaysLoad) {
      context += `\n## Skill: ${skill.metadata.name}\n${skill.content}\n`;
    }
    
    // Add matched skill if different
    if (matchedSkill && !alwaysLoad.includes(matchedSkill)) {
      context += `\n## Skill: ${matchedSkill.metadata.name}\n${matchedSkill.content}\n`;
    }
    
    return context;
  }

  getWorkflow(skillName: string, workflowName: string): string | null {
    const skill = this.loader.getSkill(skillName);
    return skill?.workflows.get(workflowName) || null;
  }
}
```

## Testing

### Unit Tests
```typescript
// tests/skills/loader.test.ts
describe('SkillLoader', () => {
  it('should load all skills from directory', async () => {
    const loader = new SkillLoader('./test-skills');
    await loader.loadAll();
    expect(loader.getSkill('CORE')).toBeDefined();
  });

  it('should match request to correct skill', async () => {
    const loader = new SkillLoader('./skills');
    await loader.loadAll();
    
    const skill = loader.findSkillForRequest('create a twitter post');
    expect(skill?.metadata.name).toBe('Social Media');
  });
});
```

## Checkpoint
Before proceeding to Phase 4:
- [ ] All skill SKILL.md files created
- [ ] Skill loader working
- [ ] Routing matches requests to skills
- [ ] Workflows accessible
- [ ] Context injection working

## Next Phase
Proceed to [Phase 4: Eval Loop & Memory](./PHASE-4-eval-memory.md)
