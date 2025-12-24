# Phase 4: Eval Loop & Memory System

## Objective
Implement the evaluation loop from Task 1 plan and the history/memory system from PAI architecture.

## Eval Loop Architecture (from Task 1)
```
Do Coding → Output → Eval (expected + output compare)
    ↓
  Yes → User sees Output (image/audio/report/pdf/schedule)
        → Asset on web app, ask user to save/deploy
    ↓
  No → Goes to step 2, check what was done, update existing code in Sandbox
        → Max 3 iterations
        → After max → Stop, ask user for clarifying questions
```

## Tasks

### 4.1 Eval Engine Implementation
**File**: `services/brain/src/eval/engine.ts`

```typescript
import { WebSearchClient } from '../tools/web-search';
import { HistorySystem } from '../history/system';

interface EvalResult {
  success: boolean;
  output: unknown;
  expectedMatch: boolean;
  errors: string[];
  retryCount: number;
}

interface EvalConfig {
  maxRetries: number;
  enableWebSearch: boolean;
  saveToHistory: boolean;
}

export class EvalEngine {
  private webSearch: WebSearchClient;
  private history: HistorySystem;
  private config: EvalConfig;

  constructor(
    webSearch: WebSearchClient,
    history: HistorySystem,
    config: EvalConfig = { maxRetries: 3, enableWebSearch: true, saveToHistory: true }
  ) {
    this.webSearch = webSearch;
    this.history = history;
    this.config = config;
  }

  async evaluate(
    taskId: string,
    expectedOutput: unknown,
    executeFn: () => Promise<unknown>,
    context: Record<string, unknown>
  ): Promise<EvalResult> {
    let retryCount = 0;
    let lastError: Error | null = null;
    let lastOutput: unknown = null;

    while (retryCount < this.config.maxRetries) {
      try {
        // Execute the task
        const output = await executeFn();
        lastOutput = output;

        // Compare with expected
        const matches = this.compareOutput(expectedOutput, output);

        if (matches) {
          // Success - save to history
          if (this.config.saveToHistory) {
            await this.history.saveSuccess(taskId, {
              output,
              context,
              retryCount
            });
          }

          return {
            success: true,
            output,
            expectedMatch: true,
            errors: [],
            retryCount
          };
        }

        // Output doesn't match - retry with adjustments
        retryCount++;
        
        if (retryCount < this.config.maxRetries) {
          // Log retry attempt
          console.log(`Eval: Retry ${retryCount}/${this.config.maxRetries} for task ${taskId}`);
        }

      } catch (error) {
        lastError = error as Error;
        retryCount++;
        
        if (retryCount < this.config.maxRetries) {
          console.log(`Eval: Error on attempt ${retryCount}, retrying...`);
        }
      }
    }

    // Max retries reached - trigger research protocol
    if (this.config.enableWebSearch) {
      console.log(`Eval: Max retries reached. Initiating research protocol...`);
      const researchResult = await this.researchAndRetry(taskId, lastError, context);
      
      if (researchResult.success) {
        return researchResult;
      }
    }

    // Final failure
    await this.history.saveFailure(taskId, {
      lastOutput,
      lastError: lastError?.message,
      context,
      retryCount
    });

    return {
      success: false,
      output: lastOutput,
      expectedMatch: false,
      errors: [lastError?.message || 'Max retries exceeded'],
      retryCount
    };
  }

  private compareOutput(expected: unknown, actual: unknown): boolean {
    // Deep comparison with flexibility for AI outputs
    if (expected === null || expected === undefined) {
      return actual !== null && actual !== undefined;
    }

    if (typeof expected === 'object' && typeof actual === 'object') {
      return this.deepCompare(expected as object, actual as object);
    }

    return expected === actual;
  }

  private deepCompare(expected: object, actual: object): boolean {
    const expectedKeys = Object.keys(expected);
    
    for (const key of expectedKeys) {
      if (!(key in actual)) return false;
      
      const expVal = (expected as Record<string, unknown>)[key];
      const actVal = (actual as Record<string, unknown>)[key];
      
      // Allow partial matches for strings (AI might add extra text)
      if (typeof expVal === 'string' && typeof actVal === 'string') {
        if (!actVal.includes(expVal) && expVal !== actVal) {
          return false;
        }
      } else if (typeof expVal === 'object' && typeof actVal === 'object') {
        if (!this.deepCompare(expVal as object, actVal as object)) {
          return false;
        }
      } else if (expVal !== actVal) {
        return false;
      }
    }
    
    return true;
  }

  private async researchAndRetry(
    taskId: string,
    error: Error | null,
    context: Record<string, unknown>
  ): Promise<EvalResult> {
    // Search for best practices
    const searchQuery = this.buildSearchQuery(error, context);
    const searchResults = await this.webSearch.search(searchQuery);

    // Save research to learnings
    await this.history.saveLearning(taskId, {
      query: searchQuery,
      results: searchResults,
      context
    });

    // TODO: Re-execute with new knowledge
    // This would involve sending the research back to Agno
    // to generate a new approach

    return {
      success: false,
      output: null,
      expectedMatch: false,
      errors: ['Research completed but re-execution not implemented'],
      retryCount: this.config.maxRetries + 1
    };
  }

  private buildSearchQuery(error: Error | null, context: Record<string, unknown>): string {
    const taskType = context.taskType as string || 'workflow';
    const errorMsg = error?.message || '';
    
    // Build search query based on error and context
    const queries = [
      `${taskType} best practices 2025`,
      errorMsg ? `how to fix "${errorMsg}"` : '',
      context.technology ? `${context.technology} tutorial 2025` : ''
    ].filter(Boolean);

    return queries[0]; // Start with most relevant
  }
}
```

### 4.2 History System (UOCS Pattern)
**File**: `services/brain/src/history/system.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';

interface HistoryEntry {
  id: string;
  timestamp: number;
  type: 'session' | 'learning' | 'success' | 'failure';
  data: Record<string, unknown>;
}

export class HistorySystem {
  private historyDir: string;
  private userId: string;

  constructor(historyDir: string, userId: string) {
    this.historyDir = historyDir;
    this.userId = userId;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = [
      'sessions',
      'learnings', 
      'successes',
      'failures',
      'research'
    ];

    for (const dir of dirs) {
      const fullPath = path.join(this.historyDir, this.userId, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
  }

  async saveSession(sessionId: string, data: Record<string, unknown>): Promise<void> {
    const entry: HistoryEntry = {
      id: sessionId,
      timestamp: Date.now(),
      type: 'session',
      data
    };

    const filePath = path.join(
      this.historyDir, 
      this.userId, 
      'sessions', 
      `${sessionId}.json`
    );

    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  }

  async saveLearning(taskId: string, data: Record<string, unknown>): Promise<void> {
    const entry: HistoryEntry = {
      id: `learning-${taskId}-${Date.now()}`,
      timestamp: Date.now(),
      type: 'learning',
      data
    };

    const filePath = path.join(
      this.historyDir,
      this.userId,
      'learnings',
      `${entry.id}.json`
    );

    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));

    // Also append to learnings index for quick lookup
    await this.appendToIndex('learnings', entry);
  }

  async saveSuccess(taskId: string, data: Record<string, unknown>): Promise<void> {
    const entry: HistoryEntry = {
      id: `success-${taskId}-${Date.now()}`,
      timestamp: Date.now(),
      type: 'success',
      data
    };

    const filePath = path.join(
      this.historyDir,
      this.userId,
      'successes',
      `${entry.id}.json`
    );

    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  }

  async saveFailure(taskId: string, data: Record<string, unknown>): Promise<void> {
    const entry: HistoryEntry = {
      id: `failure-${taskId}-${Date.now()}`,
      timestamp: Date.now(),
      type: 'failure',
      data
    };

    const filePath = path.join(
      this.historyDir,
      this.userId,
      'failures',
      `${entry.id}.json`
    );

    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
  }

  async getRecentLearnings(limit: number = 10): Promise<HistoryEntry[]> {
    const indexPath = path.join(
      this.historyDir,
      this.userId,
      'learnings',
      '_index.jsonl'
    );

    if (!fs.existsSync(indexPath)) return [];

    const lines = fs.readFileSync(indexPath, 'utf-8')
      .split('\n')
      .filter(Boolean);

    return lines
      .slice(-limit)
      .map(line => JSON.parse(line))
      .reverse();
  }

  async searchHistory(
    query: string, 
    type?: HistoryEntry['type']
  ): Promise<HistoryEntry[]> {
    const results: HistoryEntry[] = [];
    const searchDirs = type ? [type + 's'] : ['sessions', 'learnings', 'successes', 'failures'];

    for (const dir of searchDirs) {
      const dirPath = path.join(this.historyDir, this.userId, dir);
      if (!fs.existsSync(dirPath)) continue;

      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
        const entry = JSON.parse(content) as HistoryEntry;
        
        if (this.matchesQuery(entry, query)) {
          results.push(entry);
        }
      }
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  private matchesQuery(entry: HistoryEntry, query: string): boolean {
    const searchStr = JSON.stringify(entry.data).toLowerCase();
    return searchStr.includes(query.toLowerCase());
  }

  private async appendToIndex(type: string, entry: HistoryEntry): Promise<void> {
    const indexPath = path.join(
      this.historyDir,
      this.userId,
      type,
      '_index.jsonl'
    );

    fs.appendFileSync(indexPath, JSON.stringify(entry) + '\n');
  }
}
```

### 4.3 Memory Manager (User Context)
**File**: `services/brain/src/context/memory.ts`

```typescript
import { HistorySystem } from '../history/system';

interface UserMemory {
  preferences: Record<string, unknown>;
  recentTasks: string[];
  learnings: string[];
  customInstructions: string[];
}

export class MemoryManager {
  private history: HistorySystem;
  private memory: UserMemory;
  private memoryPath: string;

  constructor(history: HistorySystem, memoryPath: string) {
    this.history = history;
    this.memoryPath = memoryPath;
    this.memory = this.loadMemory();
  }

  private loadMemory(): UserMemory {
    try {
      const content = require('fs').readFileSync(this.memoryPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {
        preferences: {},
        recentTasks: [],
        learnings: [],
        customInstructions: []
      };
    }
  }

  save(): void {
    require('fs').writeFileSync(
      this.memoryPath,
      JSON.stringify(this.memory, null, 2)
    );
  }

  setPreference(key: string, value: unknown): void {
    this.memory.preferences[key] = value;
    this.save();
  }

  getPreference(key: string): unknown {
    return this.memory.preferences[key];
  }

  addRecentTask(taskId: string): void {
    this.memory.recentTasks.unshift(taskId);
    // Keep only last 100
    this.memory.recentTasks = this.memory.recentTasks.slice(0, 100);
    this.save();
  }

  addLearning(learning: string): void {
    this.memory.learnings.push(learning);
    this.save();
  }

  addCustomInstruction(instruction: string): void {
    if (!this.memory.customInstructions.includes(instruction)) {
      this.memory.customInstructions.push(instruction);
      this.save();
    }
  }

  getContextString(): string {
    const prefs = Object.entries(this.memory.preferences)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');

    const instructions = this.memory.customInstructions
      .map(i => `- ${i}`)
      .join('\n');

    return `
## User Preferences
${prefs || 'None set'}

## Custom Instructions
${instructions || 'None set'}

## Recent Learnings
${this.memory.learnings.slice(-5).join('\n') || 'None'}
`.trim();
  }
}
```

### 4.4 Web Search Tool
**File**: `services/brain/src/tools/web-search.ts`

```typescript
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export class WebSearchClient {
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.enabled) {
      return [];
    }

    // For local dev, mock search results
    // In production, use actual search API
    console.log(`[WebSearch] Searching for: ${query}`);

    // Mock implementation - replace with actual search
    return [
      {
        title: `Best practices for ${query}`,
        url: 'https://example.com/best-practices',
        snippet: `Top recommendations for ${query} in 2025...`
      }
    ];
  }

  async fetchAndParse(url: string): Promise<string> {
    // Fetch URL content and extract relevant text
    // For local dev, mock the response
    return `Content from ${url}`;
  }
}
```

### 4.5 Integration with Agno
Update Agno to use the eval loop:

**File**: `services/agno/src/tools/eval_integration.py`

```python
from typing import Any, Callable
import httpx

class EvalIntegration:
    def __init__(self, brain_url: str):
        self.brain_url = brain_url
        self.client = httpx.AsyncClient()

    async def execute_with_eval(
        self,
        task_id: str,
        expected_output: dict,
        windmill_script: str,
        script_args: dict
    ) -> dict:
        """Execute a Windmill script through the eval engine"""
        response = await self.client.post(
            f"{self.brain_url}/eval/execute",
            json={
                "task_id": task_id,
                "expected_output": expected_output,
                "windmill_script": windmill_script,
                "script_args": script_args
            }
        )
        return response.json()

    async def get_learnings(self, query: str) -> list:
        """Retrieve relevant learnings from history"""
        response = await self.client.get(
            f"{self.brain_url}/history/search",
            params={"query": query, "type": "learning"}
        )
        return response.json()
```

## Testing

### Eval Engine Tests
```typescript
describe('EvalEngine', () => {
  it('should succeed on first try when output matches', async () => {
    const engine = new EvalEngine(mockWebSearch, mockHistory);
    const result = await engine.evaluate(
      'test-1',
      { status: 'ok' },
      async () => ({ status: 'ok' }),
      {}
    );
    expect(result.success).toBe(true);
    expect(result.retryCount).toBe(0);
  });

  it('should retry up to 3 times on failure', async () => {
    let attempts = 0;
    const engine = new EvalEngine(mockWebSearch, mockHistory);
    
    await engine.evaluate(
      'test-2',
      { status: 'ok' },
      async () => { attempts++; throw new Error('fail'); },
      {}
    );
    
    expect(attempts).toBe(3);
  });
});
```

## Checkpoint
Before proceeding to Phase 5:
- [ ] Eval engine running
- [ ] History system saving/loading
- [ ] Memory manager working
- [ ] 3-retry + research protocol tested
- [ ] Integration with Agno verified

## Next Phase
Proceed to [Phase 5: Frontend & User Interface](./PHASE-5-frontend.md)
