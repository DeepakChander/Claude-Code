// Eval Engine
// Self-correcting system with 3-retry + research protocol

import { Task, TaskResult, EvalResult, ComparisonResult, ResearchResult, EvalConfig } from './types';
import { historySystem } from '../history/system';
import logger from '../utils/logger';

const DEFAULT_CONFIG: EvalConfig = {
  maxRetries: 3,
  similarityThreshold: 0.7,
  enableWebResearch: true,
  researchTimeout: 30000,
};

class EvalEngine {
  private config: EvalConfig;

  constructor(config: Partial<EvalConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async executeWithEval(
    task: Task,
    executor: (task: Task, context?: unknown) => Promise<TaskResult>
  ): Promise<EvalResult> {
    let retryCount = 0;
    let lastResult: TaskResult | null = null;
    let lastDifferences: string[] = [];

    logger.info('Starting eval loop', { taskId: task.id, type: task.type });

    while (retryCount <= this.config.maxRetries) {
      try {
        // Execute the task
        const result = await executor(task, retryCount > 0 ? { retryHint: lastDifferences } : undefined);
        lastResult = result;

        // If no expected output, consider success
        if (!task.expected) {
          if (result.success) {
            await this.recordSuccess(task, result);
            return {
              success: true,
              result: result.output,
              retryCount,
              researchApplied: false,
              needsClarification: false,
            };
          }
        } else {
          // Compare expected vs actual
          const comparison = this.compare(task.expected, result.output);

          if (comparison.match) {
            await this.recordSuccess(task, result);
            return {
              success: true,
              result: result.output,
              retryCount,
              researchApplied: false,
              needsClarification: false,
            };
          }

          lastDifferences = comparison.differences;
        }

        // Comparison failed or task failed
        if (retryCount === this.config.maxRetries) {
          // Max retries reached - trigger research
          logger.info('Max retries reached, triggering research', { taskId: task.id });

          if (this.config.enableWebResearch) {
            const research = await this.performResearch(task, lastDifferences);

            if (research.recommendations.length > 0) {
              // Re-execute with researched knowledge
              const researchedResult = await executor(task, {
                research: research.recommendations,
                learnings: research.findings,
              });

              if (researchedResult.success) {
                await this.recordSuccess(task, researchedResult, research);
                return {
                  success: true,
                  result: researchedResult.output,
                  retryCount: retryCount + 1,
                  researchApplied: true,
                  needsClarification: false,
                  learnings: research.findings,
                };
              }
            }
          }

          // Still failed - ask user for clarification
          await this.recordFailure(task, lastResult!, lastDifferences);
          return {
            success: false,
            result: lastResult?.output,
            retryCount,
            researchApplied: true,
            needsClarification: true,
            questions: this.generateQuestions(task, lastDifferences),
          };
        }

        await this.recordRetry(task, retryCount, lastDifferences);

      } catch (error) {
        logger.error('Task execution error', {
          taskId: task.id,
          error: (error as Error).message,
          retryCount,
        });

        lastResult = {
          success: false,
          output: null,
          error: (error as Error).message,
          duration: 0,
        };
        lastDifferences = [(error as Error).message];
      }

      retryCount++;
    }

    // Should not reach here, but handle gracefully
    return {
      success: false,
      result: lastResult?.output,
      retryCount,
      researchApplied: false,
      needsClarification: true,
      questions: ['Could you please clarify your request?'],
    };
  }

  private compare(expected: unknown, actual: unknown): ComparisonResult {
    // Handle different types of comparison
    if (typeof expected === 'string' && typeof actual === 'string') {
      const similarity = this.calculateStringSimilarity(expected, actual);
      return {
        match: similarity >= this.config.similarityThreshold,
        score: similarity,
        differences: similarity < this.config.similarityThreshold
          ? [`String similarity: ${(similarity * 100).toFixed(1)}% (threshold: ${this.config.similarityThreshold * 100}%)`]
          : [],
      };
    }

    if (typeof expected === 'object' && typeof actual === 'object') {
      return this.compareObjects(expected as Record<string, unknown>, actual as Record<string, unknown>);
    }

    // Direct comparison for primitives
    const match = expected === actual;
    return {
      match,
      score: match ? 1 : 0,
      differences: match ? [] : [`Expected ${expected}, got ${actual}`],
    };
  }

  private compareObjects(
    expected: Record<string, unknown>,
    actual: Record<string, unknown>
  ): ComparisonResult {
    const differences: string[] = [];
    let matchCount = 0;
    let totalFields = 0;

    for (const key in expected) {
      totalFields++;
      if (!(key in actual)) {
        differences.push(`Missing field: ${key}`);
      } else if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key])) {
        differences.push(`Field "${key}" differs`);
      } else {
        matchCount++;
      }
    }

    const score = totalFields > 0 ? matchCount / totalFields : 1;
    return {
      match: score >= this.config.similarityThreshold,
      score,
      differences,
    };
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    // Simple word overlap similarity
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));

    let overlap = 0;
    for (const word of words1) {
      if (words2.has(word)) overlap++;
    }

    return (2 * overlap) / (words1.size + words2.size);
  }

  private async performResearch(task: Task, failures: string[]): Promise<ResearchResult> {
    const query = `${task.type} best practices 2025 ${failures.join(' ')}`;

    logger.info('Performing web research', { taskId: task.id, query });

    // In production, this would use a web search API
    // For now, return structured placeholder
    const result: ResearchResult = {
      query,
      sources: [],
      findings: [
        `Best practice for ${task.type}: Ensure proper error handling`,
        'Consider edge cases and validation',
      ],
      recommendations: [
        'Retry with more specific parameters',
        'Validate input data before processing',
      ],
    };

    // Store research in history
    await historySystem.recordResearch(task.id, task.userId, result);

    return result;
  }

  private generateQuestions(_task: Task, differences: string[]): string[] {
    const questions: string[] = [];

    if (differences.length > 0) {
      questions.push('I encountered some issues. Could you clarify:');
      for (const diff of differences.slice(0, 3)) {
        questions.push(`- ${diff}`);
      }
    } else {
      questions.push('Could you provide more details about what you need?');
    }

    questions.push('Would you like me to try a different approach?');

    return questions;
  }

  private async recordSuccess(task: Task, result: TaskResult, research?: ResearchResult): Promise<void> {
    await historySystem.recordSession({
      taskId: task.id,
      userId: task.userId,
      type: task.type,
      status: 'success',
      input: task.input,
      output: result.output,
      duration: result.duration,
      researchApplied: !!research,
    });
  }

  private async recordFailure(task: Task, result: TaskResult, differences: string[]): Promise<void> {
    await historySystem.recordSession({
      taskId: task.id,
      userId: task.userId,
      type: task.type,
      status: 'failed',
      input: task.input,
      output: result.output,
      error: differences.join('; '),
      duration: result.duration,
    });
  }

  private async recordRetry(task: Task, retryCount: number, differences: string[]): Promise<void> {
    logger.debug('Recording retry', { taskId: task.id, retryCount, differences });
  }
}

// Singleton instance
export const evalEngine = new EvalEngine();

export default EvalEngine;
