// Orchestration Service
// Routes requests to appropriate handlers based on skill requirements

import { skillRegistry } from '../skills/registry';
import { agnoClient, AgnoTaskRequest, AgnoTaskResponse } from '../clients';
import { evalEngine } from '../eval/engine';
import { Task, TaskResult, EvalResult } from '../eval/types';
import logger from '../utils/logger';
import { SkillMatch } from '../skills/types';

export interface OrchestrationRequest {
  userId: string;
  sessionId: string;
  prompt: string;
  conversationId?: string;
  context?: Record<string, unknown>;
}

export interface OrchestrationResult {
  routedTo: 'agno' | 'claude' | 'direct';
  skill?: string;
  skillMatch?: SkillMatch;
  agnoResponse?: AgnoTaskResponse;
  evalResult?: EvalResult;
  shouldUseClaude: boolean;
  systemPrompt?: string;
  windmillScripts?: string[];
}

class OrchestrationService {
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await skillRegistry.initialize();
    this.initialized = true;

    logger.info('Orchestration service initialized');
  }

  /**
   * Analyze a request and determine the routing strategy
   */
  async analyzeRequest(request: OrchestrationRequest): Promise<OrchestrationResult> {
    await this.initialize();

    // Match skill based on prompt
    const skillMatch = skillRegistry.match(request.prompt);

    if (!skillMatch) {
      logger.debug('No skill matched, using Claude directly', {
        prompt: request.prompt.substring(0, 100),
      });

      return {
        routedTo: 'claude',
        shouldUseClaude: true,
      };
    }

    const skill = skillMatch.skill;
    const requiresWindmill = skill.metadata.requires_windmill ?? false;

    logger.info('Skill matched', {
      skill: skill.metadata.name,
      requiresWindmill,
      confidence: skillMatch.confidence,
      triggers: skillMatch.matchedTriggers,
    });

    if (requiresWindmill) {
      // Route to Agno for Windmill execution
      return {
        routedTo: 'agno',
        skill: skill.metadata.name,
        skillMatch,
        shouldUseClaude: false,
        systemPrompt: skill.systemPrompt,
        windmillScripts: skill.windmillScripts,
      };
    } else {
      // Handle with Claude, but use skill's system prompt
      return {
        routedTo: 'claude',
        skill: skill.metadata.name,
        skillMatch,
        shouldUseClaude: true,
        systemPrompt: skill.systemPrompt,
      };
    }
  }

  /**
   * Execute a request through Agno when skill requires Windmill
   */
  async executeViaAgno(request: OrchestrationRequest, skillMatch: SkillMatch): Promise<AgnoTaskResponse> {
    const skill = skillMatch.skill;

    logger.info('Routing request to Agno', {
      userId: request.userId,
      skill: skill.metadata.name,
      windmillScripts: skill.windmillScripts,
    });

    const agnoRequest: AgnoTaskRequest = {
      user_id: request.userId,
      session_id: request.sessionId,
      content: request.prompt,
      conversation_id: request.conversationId,
      skill: skill.metadata.name,
      context: {
        ...request.context,
        windmillScripts: skill.windmillScripts,
        workflows: skill.workflows,
      },
      metadata: {
        skillVersion: skill.metadata.version,
        matchedTriggers: skillMatch.matchedTriggers,
        confidence: skillMatch.confidence,
      },
    };

    try {
      const response = await agnoClient.executeTask(agnoRequest);

      logger.info('Agno execution completed', {
        taskId: response.task_id,
        status: response.status,
        executionTime: response.execution_time_ms,
      });

      return response;
    } catch (error) {
      logger.error('Agno execution failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        skill: skill.metadata.name,
      });

      return {
        task_id: `error-${Date.now()}`,
        status: 'failed',
        error: `Failed to execute via Agno: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Execute a request through Agno with eval engine for self-correction
   */
  async executeWithEval(
    request: OrchestrationRequest,
    skillMatch: SkillMatch,
    expectedOutput?: unknown
  ): Promise<{ agnoResponse: AgnoTaskResponse; evalResult: EvalResult }> {
    const skill = skillMatch.skill;

    // Create task for eval engine
    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      userId: request.userId,
      type: skill.metadata.name,
      input: request.prompt,
      expected: expectedOutput,
      context: request.context,
      metadata: {
        sessionId: request.sessionId,
        conversationId: request.conversationId,
        skill: skill.metadata.name,
      },
    };

    logger.info('Executing with eval engine', {
      taskId: task.id,
      skill: skill.metadata.name,
      hasExpected: !!expectedOutput,
    });

    // Execute with eval engine's retry and research logic
    const evalResult = await evalEngine.executeWithEval(
      task,
      async (evalTask, context): Promise<TaskResult> => {
        const startTime = Date.now();

        // Build Agno request with any retry context
        const agnoRequest: AgnoTaskRequest = {
          user_id: request.userId,
          session_id: request.sessionId,
          content: request.prompt,
          conversation_id: request.conversationId,
          skill: skill.metadata.name,
          context: {
            ...request.context,
            windmillScripts: skill.windmillScripts,
            workflows: skill.workflows,
            ...(context as Record<string, unknown> || {}),
          },
          metadata: {
            skillVersion: skill.metadata.version,
            matchedTriggers: skillMatch.matchedTriggers,
            confidence: skillMatch.confidence,
            taskId: evalTask.id,
          },
        };

        try {
          const response = await agnoClient.executeTask(agnoRequest);

          return {
            success: response.status === 'completed',
            output: response.result,
            error: response.error,
            duration: Date.now() - startTime,
          };
        } catch (error) {
          return {
            success: false,
            output: null,
            error: error instanceof Error ? error.message : 'Unknown error',
            duration: Date.now() - startTime,
          };
        }
      }
    );

    logger.info('Eval execution completed', {
      taskId: task.id,
      success: evalResult.success,
      retryCount: evalResult.retryCount,
      researchApplied: evalResult.researchApplied,
    });

    // Construct final Agno response
    const agnoResponse: AgnoTaskResponse = {
      task_id: task.id,
      status: evalResult.success ? 'completed' : 'failed',
      result: evalResult.result,
      error: evalResult.needsClarification
        ? evalResult.questions?.join('\n')
        : undefined,
    };

    return { agnoResponse, evalResult };
  }

  /**
   * Full orchestration flow - analyze and execute
   * Uses eval engine for self-correction when routing to Agno
   */
  async orchestrate(
    request: OrchestrationRequest,
    options: { useEval?: boolean; expectedOutput?: unknown } = {}
  ): Promise<{
    result: OrchestrationResult;
    agnoResponse?: AgnoTaskResponse;
    evalResult?: EvalResult;
  }> {
    const { useEval = true, expectedOutput } = options;
    const analysis = await this.analyzeRequest(request);

    if (analysis.routedTo === 'agno' && analysis.skillMatch) {
      if (useEval) {
        // Use eval engine for self-correction
        const { agnoResponse, evalResult } = await this.executeWithEval(
          request,
          analysis.skillMatch,
          expectedOutput
        );

        return {
          result: {
            ...analysis,
            agnoResponse,
            evalResult,
          },
          agnoResponse,
          evalResult,
        };
      } else {
        // Direct execution without eval
        const agnoResponse = await this.executeViaAgno(request, analysis.skillMatch);
        return {
          result: {
            ...analysis,
            agnoResponse,
          },
          agnoResponse,
        };
      }
    }

    return { result: analysis };
  }

  /**
   * Check if Agno service is available
   */
  async isAgnoAvailable(): Promise<boolean> {
    return agnoClient.isAvailable();
  }

  /**
   * Get all available skills
   */
  getAvailableSkills(): { name: string; requiresWindmill: boolean; description: string }[] {
    return skillRegistry.getAllSkills().map(skill => ({
      name: skill.metadata.name,
      requiresWindmill: skill.metadata.requires_windmill ?? false,
      description: skill.metadata.description,
    }));
  }
}

// Singleton instance
export const orchestrationService = new OrchestrationService();

export default OrchestrationService;
