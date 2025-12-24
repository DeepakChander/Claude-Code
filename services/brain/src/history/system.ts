// History System (UOCS Pattern)
// Unified Object Context Storage - Records all interactions for learning

import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { ResearchResult } from '../eval/types';

interface SessionRecord {
  taskId: string;
  userId: string;
  type: string;
  status: 'success' | 'failed' | 'pending';
  input: unknown;
  output: unknown;
  error?: string;
  duration: number;
  researchApplied?: boolean;
  timestamp?: number;
}

interface SuccessRecord {
  taskId: string;
  userId: string;
  type: string;
  approach: string;
  duration: number;
  timestamp: number;
}

interface FailureRecord {
  taskId: string;
  userId: string;
  type: string;
  error: string;
  attempts: number;
  timestamp: number;
}

interface LearningRecord {
  id: string;
  taskId: string;
  userId: string;
  type: string;
  source: 'success' | 'failure' | 'research';
  content: string;
  tags: string[];
  timestamp: number;
}

interface ResearchRecord {
  taskId: string;
  userId: string;
  query: string;
  findings: string[];
  recommendations: string[];
  timestamp: number;
}

class HistorySystem {
  private historyDir: string;
  private inMemoryStore: {
    sessions: SessionRecord[];
    successes: SuccessRecord[];
    failures: FailureRecord[];
    learnings: LearningRecord[];
    research: ResearchRecord[];
  };

  constructor(historyDir?: string) {
    this.historyDir = historyDir || path.join(process.cwd(), 'history');
    this.inMemoryStore = {
      sessions: [],
      successes: [],
      failures: [],
      learnings: [],
      research: [],
    };

    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = ['sessions', 'successes', 'failures', 'learnings'];
    for (const dir of dirs) {
      const fullPath = path.join(this.historyDir, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }
  }

  // Record a session (any task execution)
  async recordSession(session: SessionRecord): Promise<void> {
    const record: SessionRecord = {
      ...session,
      timestamp: Date.now(),
    };

    this.inMemoryStore.sessions.push(record);

    // Keep only last 1000 sessions in memory
    if (this.inMemoryStore.sessions.length > 1000) {
      this.inMemoryStore.sessions = this.inMemoryStore.sessions.slice(-1000);
    }

    // Also record as success or failure
    if (session.status === 'success') {
      await this.recordSuccess(session);
    } else if (session.status === 'failed') {
      await this.recordFailure(session);
    }

    logger.debug('Session recorded', { taskId: session.taskId, status: session.status });
  }

  // Record a successful task execution
  private async recordSuccess(session: SessionRecord): Promise<void> {
    const record: SuccessRecord = {
      taskId: session.taskId,
      userId: session.userId,
      type: session.type,
      approach: this.extractApproach(session),
      duration: session.duration,
      timestamp: Date.now(),
    };

    this.inMemoryStore.successes.push(record);

    // Extract and store learning from success
    await this.extractLearning(session, 'success');
  }

  // Record a failed task execution
  private async recordFailure(session: SessionRecord): Promise<void> {
    const record: FailureRecord = {
      taskId: session.taskId,
      userId: session.userId,
      type: session.type,
      error: session.error || 'Unknown error',
      attempts: 1,
      timestamp: Date.now(),
    };

    this.inMemoryStore.failures.push(record);

    // Extract and store learning from failure
    await this.extractLearning(session, 'failure');
  }

  // Record research results
  async recordResearch(taskId: string, userId: string, research: ResearchResult): Promise<void> {
    const record: ResearchRecord = {
      taskId,
      userId,
      query: research.query,
      findings: research.findings,
      recommendations: research.recommendations,
      timestamp: Date.now(),
    };

    this.inMemoryStore.research.push(record);

    // Store learnings from research
    for (const finding of research.findings) {
      await this.addLearning({
        taskId,
        userId,
        type: 'research',
        source: 'research',
        content: finding,
        tags: this.extractTags(finding),
      });
    }

    logger.debug('Research recorded', { taskId, query: research.query });
  }

  // Add a learning
  async addLearning(learning: Omit<LearningRecord, 'id' | 'timestamp'>): Promise<void> {
    const record: LearningRecord = {
      ...learning,
      id: `learn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };

    this.inMemoryStore.learnings.push(record);

    // Keep only last 500 learnings in memory
    if (this.inMemoryStore.learnings.length > 500) {
      this.inMemoryStore.learnings = this.inMemoryStore.learnings.slice(-500);
    }
  }

  // Extract learning from a session
  private async extractLearning(session: SessionRecord, source: 'success' | 'failure'): Promise<void> {
    let content: string;
    let tags: string[];

    if (source === 'success') {
      content = `${session.type}: Successful approach - ${this.extractApproach(session)}`;
      tags = [session.type, 'success'];
    } else {
      content = `${session.type}: Failed due to - ${session.error}`;
      tags = [session.type, 'failure', 'error'];
    }

    await this.addLearning({
      taskId: session.taskId,
      userId: session.userId,
      type: session.type,
      source,
      content,
      tags,
    });
  }

  // Extract approach description from session
  private extractApproach(session: SessionRecord): string {
    if (typeof session.output === 'string') {
      return session.output.slice(0, 100);
    }
    return session.type;
  }

  // Extract tags from content
  private extractTags(content: string): string[] {
    const tags: string[] = [];
    const words = content.toLowerCase().split(/\s+/);

    const keywords = ['error', 'success', 'api', 'database', 'auth', 'validation', 'timeout'];
    for (const word of words) {
      if (keywords.includes(word)) {
        tags.push(word);
      }
    }

    return tags;
  }

  // Query methods

  async getRecentSessions(userId: string, limit: number = 20): Promise<SessionRecord[]> {
    return this.inMemoryStore.sessions
      .filter(s => s.userId === userId)
      .slice(-limit)
      .reverse();
  }

  async getSuccesses(userId: string, type?: string): Promise<SuccessRecord[]> {
    let results = this.inMemoryStore.successes.filter(s => s.userId === userId);
    if (type) {
      results = results.filter(s => s.type === type);
    }
    return results;
  }

  async getFailures(userId: string, type?: string): Promise<FailureRecord[]> {
    let results = this.inMemoryStore.failures.filter(f => f.userId === userId);
    if (type) {
      results = results.filter(f => f.type === type);
    }
    return results;
  }

  async getLearnings(userId: string, type?: string): Promise<LearningRecord[]> {
    let results = this.inMemoryStore.learnings.filter(l => l.userId === userId);
    if (type) {
      results = results.filter(l => l.type === type);
    }
    return results;
  }

  async searchLearnings(userId: string, query: string): Promise<LearningRecord[]> {
    const queryLower = query.toLowerCase();
    return this.inMemoryStore.learnings.filter(l =>
      l.userId === userId &&
      (l.content.toLowerCase().includes(queryLower) ||
       l.tags.some(t => t.includes(queryLower)))
    );
  }

  // Get relevant context for a new task
  async getRelevantContext(userId: string, taskType: string): Promise<{
    recentSuccesses: SuccessRecord[];
    recentFailures: FailureRecord[];
    learnings: LearningRecord[];
  }> {
    return {
      recentSuccesses: (await this.getSuccesses(userId, taskType)).slice(-5),
      recentFailures: (await this.getFailures(userId, taskType)).slice(-3),
      learnings: (await this.getLearnings(userId, taskType)).slice(-10),
    };
  }

  // Get stats
  getStats(): {
    sessions: number;
    successes: number;
    failures: number;
    learnings: number;
    research: number;
  } {
    return {
      sessions: this.inMemoryStore.sessions.length,
      successes: this.inMemoryStore.successes.length,
      failures: this.inMemoryStore.failures.length,
      learnings: this.inMemoryStore.learnings.length,
      research: this.inMemoryStore.research.length,
    };
  }
}

// Singleton instance
export const historySystem = new HistorySystem();

export default HistorySystem;
