import { spawn, ChildProcess } from 'child_process';
import { Response } from 'express';
import { config } from 'dotenv';
import logger from '../utils/logger';
import { openRouterConfig } from '../config/openrouter';
import { agentSdkConfig } from '../config/agent-sdk';

config();

export interface CliOptions {
  // Core options
  allowedTools?: string[];
  disallowedTools?: string[];
  model?: string;
  fallbackModel?: string;

  // Prompt customization
  systemPrompt?: string;
  systemPromptFile?: string;
  appendSystemPrompt?: string;

  // Session management
  continue?: boolean;
  resume?: string;
  sessionId?: string;
  forkSession?: boolean;

  // Execution control
  maxTurns?: number;
  addDirs?: string[];

  // Output options
  outputFormat?: 'stream-json' | 'json' | 'text';
  inputFormat?: 'text' | 'stream-json';
  verbose?: boolean;
  includePartialMessages?: boolean;
  jsonSchema?: string;

  // Agents/Subagents
  agents?: Record<string, {
    description: string;
    prompt: string;
    tools?: string[];
    model?: 'sonnet' | 'opus' | 'haiku';
  }>;
  agent?: string;

  // MCP
  mcpConfig?: string;
  strictMcpConfig?: boolean;

  // Integrations
  chrome?: boolean;
  ide?: boolean;

  // Permissions & Security
  permissionMode?: 'default' | 'plan' | 'bypassPermissions' | 'acceptEdits';
  dangerouslySkipPermissions?: boolean;
  permissionPromptTool?: string;

  // Advanced
  settings?: string;
  settingSources?: string;
  pluginDirs?: string[];
  betas?: string[];
  debug?: string;
}

export interface CliResult {
  success: boolean;
  output: string;
  exitCode: number | null;
  sessionId?: string;
}

/**
 * Get environment variables for Claude CLI
 */
const getClaudeEnv = (): NodeJS.ProcessEnv => {
  return {
    ...process.env,
    ANTHROPIC_BASE_URL: openRouterConfig.baseUrl,
    ANTHROPIC_AUTH_TOKEN: openRouterConfig.authToken,
    ANTHROPIC_API_KEY: '', // Must be empty when using OpenRouter
  };
};

/**
 * Build CLI arguments - supports all Claude Code CLI flags
 */
const buildCliArgs = (prompt: string, options: CliOptions): string[] => {
  const args: string[] = ['-p', prompt];

  // === Output options ===
  if (options.outputFormat) {
    args.push('--output-format', options.outputFormat);
  }
  if (options.inputFormat) {
    args.push('--input-format', options.inputFormat);
  }
  if (options.verbose) {
    args.push('--verbose');
  }
  if (options.includePartialMessages) {
    args.push('--include-partial-messages');
  }
  if (options.jsonSchema) {
    args.push('--json-schema', options.jsonSchema);
  }

  // === Model selection ===
  if (options.model) {
    args.push('--model', options.model);
  }
  if (options.fallbackModel) {
    args.push('--fallback-model', options.fallbackModel);
  }

  // === Tool permissions ===
  const tools = options.allowedTools || agentSdkConfig.defaultAllowedTools;
  if (tools.length > 0) {
    args.push('--allowedTools', ...tools);
  }
  if (options.disallowedTools && options.disallowedTools.length > 0) {
    args.push('--disallowedTools', ...options.disallowedTools);
  }

  // === Prompt customization ===
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt);
  }
  if (options.systemPromptFile) {
    args.push('--system-prompt-file', options.systemPromptFile);
  }
  if (options.appendSystemPrompt) {
    args.push('--append-system-prompt', options.appendSystemPrompt);
  }

  // === Session management ===
  if (options.continue) {
    args.push('--continue');
  }
  if (options.resume) {
    args.push('--resume', options.resume);
  }
  if (options.sessionId) {
    args.push('--session-id', options.sessionId);
  }
  if (options.forkSession) {
    args.push('--fork-session');
  }

  // === Execution control ===
  if (options.maxTurns) {
    args.push('--max-turns', options.maxTurns.toString());
  }
  if (options.addDirs && options.addDirs.length > 0) {
    args.push('--add-dir', ...options.addDirs);
  }

  // === Agents/Subagents ===
  if (options.agents) {
    args.push('--agents', JSON.stringify(options.agents));
  }
  if (options.agent) {
    args.push('--agent', options.agent);
  }

  // === MCP ===
  if (options.mcpConfig) {
    args.push('--mcp-config', options.mcpConfig);
  }
  if (options.strictMcpConfig) {
    args.push('--strict-mcp-config');
  }

  // === Integrations ===
  if (options.chrome === true) {
    args.push('--chrome');
  } else if (options.chrome === false) {
    args.push('--no-chrome');
  }
  if (options.ide) {
    args.push('--ide');
  }

  // === Permissions & Security ===
  if (options.permissionMode) {
    args.push('--permission-mode', options.permissionMode);
  }
  if (options.dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions');
  }
  if (options.permissionPromptTool) {
    args.push('--permission-prompt-tool', options.permissionPromptTool);
  }

  // === Advanced ===
  if (options.settings) {
    args.push('--settings', options.settings);
  }
  if (options.settingSources) {
    args.push('--setting-sources', options.settingSources);
  }
  if (options.pluginDirs && options.pluginDirs.length > 0) {
    for (const dir of options.pluginDirs) {
      args.push('--plugin-dir', dir);
    }
  }
  if (options.betas && options.betas.length > 0) {
    args.push('--betas', options.betas.join(','));
  }
  if (options.debug) {
    args.push('--debug', options.debug);
  }

  return args;
};

/**
 * Run Claude CLI with streaming output (SSE)
 */
export const runCliStreaming = (
  prompt: string,
  workspacePath: string,
  res: Response,
  options: CliOptions = {}
): ChildProcess => {
  const args = buildCliArgs(prompt, {
    ...options,
    outputFormat: 'stream-json',
  });

  logger.info('Running Claude CLI (streaming)', {
    workspacePath,
    args: args.join(' '),
  });

  const claude = spawn('claude', args, {
    cwd: workspacePath,
    env: getClaudeEnv(),
    shell: true,
  });

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  let sessionId: string | undefined;

  claude.stdout.on('data', (chunk: Buffer) => {
    const data = chunk.toString();

    // Try to extract session ID from system messages
    try {
      const lines = data.split('\n').filter(Boolean);
      for (const line of lines) {
        const parsed = JSON.parse(line);
        if (parsed.type === 'system' && parsed.session_id) {
          sessionId = parsed.session_id;
        }
      }
    } catch {
      // Not all chunks are valid JSON
    }

    res.write(`data: ${data}\n\n`);
  });

  claude.stderr.on('data', (chunk: Buffer) => {
    const errorMsg = chunk.toString();
    logger.warn('Claude CLI stderr', { error: errorMsg });

    res.write(`data: ${JSON.stringify({
      type: 'error',
      content: errorMsg,
    })}\n\n`);
  });

  claude.on('close', (code: number | null) => {
    logger.info('Claude CLI closed', { exitCode: code, sessionId });

    res.write(`data: ${JSON.stringify({
      type: 'done',
      exitCode: code,
      sessionId,
    })}\n\n`);
    res.end();
  });

  claude.on('error', (error: Error) => {
    logger.error('Claude CLI error', { error: error.message });

    res.write(`data: ${JSON.stringify({
      type: 'error',
      content: `Failed to spawn Claude CLI: ${error.message}`,
    })}\n\n`);
    res.end();
  });

  return claude;
};

/**
 * Run Claude CLI and wait for result (JSON)
 */
export const runCliSync = async (
  prompt: string,
  workspacePath: string,
  options: CliOptions = {}
): Promise<CliResult> => {
  return new Promise((resolve) => {
    const args = buildCliArgs(prompt, {
      ...options,
      outputFormat: 'json',
    });

    logger.info('Running Claude CLI (sync)', {
      workspacePath,
      args: args.join(' '),
    });

    const claude = spawn('claude', args, {
      cwd: workspacePath,
      env: getClaudeEnv(),
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    let sessionId: string | undefined;

    claude.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    claude.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    claude.on('close', (code: number | null) => {
      // Try to extract session ID
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.session_id) {
          sessionId = parsed.session_id;
        }
      } catch {
        // Output might not be JSON
      }

      logger.info('Claude CLI completed', {
        exitCode: code,
        sessionId,
        outputLength: stdout.length,
      });

      if (code === 0) {
        resolve({
          success: true,
          output: stdout,
          exitCode: code,
          sessionId,
        });
      } else {
        resolve({
          success: false,
          output: stderr || stdout || 'Claude CLI failed with no output',
          exitCode: code,
          sessionId,
        });
      }
    });

    claude.on('error', (error: Error) => {
      logger.error('Claude CLI spawn error', { error: error.message });

      resolve({
        success: false,
        output: `Failed to spawn Claude CLI: ${error.message}`,
        exitCode: null,
      });
    });
  });
};

/**
 * Continue a conversation using --continue flag
 */
export const continueConversation = (
  prompt: string,
  workspacePath: string,
  res: Response,
  options: CliOptions = {}
): ChildProcess => {
  return runCliStreaming(prompt, workspacePath, res, {
    ...options,
    continue: true,
  });
};

/**
 * Resume a specific session
 */
export const resumeSession = (
  prompt: string,
  workspacePath: string,
  sessionId: string,
  res: Response,
  options: CliOptions = {}
): ChildProcess => {
  return runCliStreaming(prompt, workspacePath, res, {
    ...options,
    resume: sessionId,
  });
};

/**
 * Kill a running Claude process
 */
export const killProcess = (process: ChildProcess): void => {
  if (process && !process.killed) {
    process.kill('SIGTERM');
    logger.info('Claude CLI process killed');
  }
};

/**
 * Execute Claude prompt and return parsed result (for Kafka worker)
 */
export const executeClaudePrompt = async (
  prompt: string,
  options: {
    model?: string;
    workingDirectory?: string;
    resume?: string;
    continue?: boolean;
    sessionId?: string;
    allowedTools?: string[];
  } = {}
): Promise<{
  content: string;
  sessionId?: string;
  tokensInput: number;
  tokensOutput: number;
}> => {
  const workspacePath = options.workingDirectory || process.cwd();

  const cliOptions: CliOptions = {
    model: options.model,
    resume: options.resume,
    continue: options.continue,
    sessionId: options.sessionId,
    allowedTools: options.allowedTools,
    outputFormat: 'json',
  };

  const result = await runCliSync(prompt, workspacePath, cliOptions);

  if (!result.success) {
    throw new Error(result.output);
  }

  // Parse the JSON output
  let parsedOutput: {
    result?: string;
    content?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
    session_id?: string;
  } = {};

  try {
    parsedOutput = JSON.parse(result.output);
  } catch {
    // If not JSON, treat output as plain text
    parsedOutput = { content: result.output };
  }

  return {
    content: parsedOutput.result || parsedOutput.content || result.output,
    sessionId: result.sessionId || parsedOutput.session_id,
    tokensInput: parsedOutput.usage?.input_tokens || 0,
    tokensOutput: parsedOutput.usage?.output_tokens || 0,
  };
};

/**
 * Resume a conversation by ID and execute a prompt
 */
export const resumeConversation = async (
  sessionId: string,
  prompt: string,
  workspacePath: string,
  options: CliOptions = {}
): Promise<{
  content: string;
  sessionId?: string;
  tokensInput: number;
  tokensOutput: number;
}> => {
  return executeClaudePrompt(prompt, {
    ...options,
    resume: sessionId,
    workingDirectory: workspacePath,
  });
};

export default {
  runCliStreaming,
  runCliSync,
  continueConversation,
  resumeSession,
  killProcess,
  executeClaudePrompt,
  resumeConversation,
};
