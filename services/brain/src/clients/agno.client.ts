// Agno Client - HTTP client for communicating with Agno Orchestrator

import logger from '../utils/logger';

export interface AgnoTaskRequest {
  user_id: string;
  session_id: string;
  content: string;
  conversation_id?: string;
  skill?: string;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AgnoTaskResponse {
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  execution_time_ms?: number;
  steps_completed?: number;
  total_steps?: number;
}

export interface AgnoHealthResponse {
  status: string;
  service: string;
  version: string;
  components: {
    windmill: string;
    agents: {
      coordinator: string;
      planner: string;
      executor: string;
    };
  };
}

class AgnoClient {
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.baseUrl = process.env.AGNO_URL || 'http://localhost:8001';
    this.timeout = 120000; // 2 minutes default timeout for task execution
  }

  /**
   * Execute a task through Agno orchestrator
   * This will route through Coordinator → Planner → Executor → Windmill
   */
  async executeTask(request: AgnoTaskRequest): Promise<AgnoTaskResponse> {
    const startTime = Date.now();

    logger.info('Sending task to Agno', {
      userId: request.user_id,
      skill: request.skill,
      contentPreview: request.content.substring(0, 100),
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Agno task execution failed', {
          status: response.status,
          error: errorText,
        });

        return {
          task_id: `error-${Date.now()}`,
          status: 'failed',
          error: `Agno returned ${response.status}: ${errorText}`,
          execution_time_ms: Date.now() - startTime,
        };
      }

      const result = await response.json() as AgnoTaskResponse;

      logger.info('Agno task completed', {
        taskId: result.task_id,
        status: result.status,
        executionTime: result.execution_time_ms,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Agno client error', {
        error: errorMessage,
        baseUrl: this.baseUrl,
      });

      return {
        task_id: `error-${Date.now()}`,
        status: 'failed',
        error: `Failed to communicate with Agno: ${errorMessage}`,
        execution_time_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute a Windmill script directly through Agno
   */
  async runScript(
    scriptPath: string,
    args: Record<string, unknown>,
    userId: string
  ): Promise<AgnoTaskResponse> {
    logger.info('Running Windmill script via Agno', {
      scriptPath,
      userId,
    });

    try {
      const response = await fetch(`${this.baseUrl}/api/scripts/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          script_path: scriptPath,
          args,
          user_id: userId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          task_id: `script-error-${Date.now()}`,
          status: 'failed',
          error: `Script execution failed: ${errorText}`,
        };
      }

      return await response.json() as AgnoTaskResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        task_id: `script-error-${Date.now()}`,
        status: 'failed',
        error: `Failed to run script: ${errorMessage}`,
      };
    }
  }

  /**
   * Create user workspace in Windmill
   */
  async createUserWorkspace(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/users/${userId}/workspace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: errorText };
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check Agno service health
   */
  async healthCheck(): Promise<AgnoHealthResponse | null> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json() as AgnoHealthResponse;
    } catch (error) {
      logger.warn('Agno health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Check if Agno is available
   */
  async isAvailable(): Promise<boolean> {
    const health = await this.healthCheck();
    return health !== null && health.status === 'healthy';
  }
}

// Singleton instance
export const agnoClient = new AgnoClient();

export default AgnoClient;
