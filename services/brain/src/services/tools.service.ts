import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger';

const execAsync = promisify(exec);

// Anthropic tool definitions for Claude API
export const toolDefinitions = [
  {
    name: 'Read',
    description: 'Read the contents of a file from the filesystem',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'The path to the file to read (absolute or relative to workspace)',
        },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'Write',
    description: 'Create a new file or overwrite an existing file with the provided content',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'The path where the file should be written',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['file_path', 'content'],
    },
  },
  {
    name: 'Edit',
    description: 'Edit an existing file by replacing a specific string with new content',
    input_schema: {
      type: 'object' as const,
      properties: {
        file_path: {
          type: 'string',
          description: 'The path to the file to edit',
        },
        old_string: {
          type: 'string',
          description: 'The exact string to find and replace',
        },
        new_string: {
          type: 'string',
          description: 'The string to replace it with',
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'Bash',
    description: 'Execute a shell command in the workspace directory',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'Glob',
    description: 'Find files matching a glob pattern',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'The glob pattern to match files (e.g., "**/*.ts", "src/*.js")',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'Grep',
    description: 'Search for a pattern in files',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'The regex pattern to search for',
        },
        path: {
          type: 'string',
          description: 'Optional path to search in (defaults to workspace)',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'TodoWrite',
    description: 'Create or update a task list to track progress on multi-step tasks. Use this BEFORE starting any task that involves multiple steps.',
    input_schema: {
      type: 'object' as const,
      properties: {
        todos: {
          type: 'array',
          description: 'Array of todo items',
          items: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Description of the task to do (e.g., "Create package.json")',
              },
              activeForm: {
                type: 'string',
                description: 'Present continuous form of the task (e.g., "Creating package.json")',
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed'],
                description: 'Current status of the task',
              },
            },
            required: ['content', 'activeForm', 'status'],
          },
        },
      },
      required: ['todos'],
    },
  },
];

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Resolve a file path, ensuring it stays within the workspace
 */
const resolvePath = (filePath: string, workspacePath: string): string => {
  const normalizedWorkspace = path.resolve(workspacePath);

  // Resolve the full path
  const resolved = path.resolve(workspacePath, filePath);

  // Security Check: Ensure the resolved path starts with the workspace path
  if (!resolved.startsWith(normalizedWorkspace)) {
    throw new Error(`Security Error: Access denied to path outside workspace: ${filePath}`);
  }

  return resolved;
};

/**
 * Validate that a path doesn't escape the workspace (basic security)
 */
export const isPathSafe = (filePath: string, workspacePath: string): boolean => {
  const resolved = path.resolve(workspacePath, filePath);
  const normalizedWorkspace = path.resolve(workspacePath);
  return resolved.startsWith(normalizedWorkspace);
};

/**
 * Execute a tool and return the result
 */
export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  workspacePath: string
): Promise<ToolResult> {
  logger.info('Executing tool', { toolName, toolInput, workspacePath });

  try {
    switch (toolName) {
      case 'Read': {
        const filePath = resolvePath(toolInput.file_path as string, workspacePath);

        if (!fs.existsSync(filePath)) {
          return { success: false, output: '', error: `File not found: ${filePath}` };
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        logger.info('Read file', { filePath, size: content.length });
        return { success: true, output: content };
      }

      case 'Write': {
        const filePath = resolvePath(toolInput.file_path as string, workspacePath);
        const content = toolInput.content as string;

        // Create directory if it doesn't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, content, 'utf-8');
        logger.info('Wrote file', { filePath, size: content.length });
        return { success: true, output: `Successfully wrote ${content.length} bytes to ${filePath}` };
      }

      case 'Edit': {
        const filePath = resolvePath(toolInput.file_path as string, workspacePath);
        const oldString = toolInput.old_string as string;
        const newString = toolInput.new_string as string;

        if (!fs.existsSync(filePath)) {
          return { success: false, output: '', error: `File not found: ${filePath}` };
        }

        let content = fs.readFileSync(filePath, 'utf-8');

        if (!content.includes(oldString)) {
          return { success: false, output: '', error: `String not found in file: "${oldString.substring(0, 50)}..."` };
        }

        content = content.replace(oldString, newString);
        fs.writeFileSync(filePath, content, 'utf-8');
        logger.info('Edited file', { filePath });
        return { success: true, output: `Successfully edited ${filePath}` };
      }

      case 'Bash': {
        const command = toolInput.command as string;

        // Basic command safety check
        const dangerousCommands = ['rm -rf /', 'mkfs', 'dd if=', ':(){:|:&};:'];
        for (const dangerous of dangerousCommands) {
          if (command.includes(dangerous)) {
            return { success: false, output: '', error: `Dangerous command blocked: ${dangerous}` };
          }
        }

        try {
          // SECURITY: Sanitize environment variables to prevent leaking secrets
          // via commands like 'env' or 'printenv'
          const sanitizedEnv = { ...process.env };
          const sensitiveKeys = [
            'OPENROUTER_API_KEY',
            'JWT_SECRET',
            'SAFE_JWT_SECRET',
            'DATABASE_URL',
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY'
          ];

          sensitiveKeys.forEach(key => delete sanitizedEnv[key]);

          // Add useful non-sensitive vars
          sanitizedEnv.WORKSPACE_PATH = workspacePath;

          const { stdout, stderr } = await execAsync(command, {
            cwd: workspacePath,
            env: sanitizedEnv, // explicitly pass sanitized env
            timeout: 60000,
            maxBuffer: 10 * 1024 * 1024,
          });

          const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
          logger.info('Executed command', { command, outputLength: output.length });
          return { success: true, output };
        } catch (execError: unknown) {
          const error = execError as { stdout?: string; stderr?: string; message?: string };
          const output = (error.stdout || '') + (error.stderr || '');
          logger.error('Command failed', { command, error: error.message });
          return { success: false, output, error: error.message };
        }
      }

      case 'Glob': {
        const pattern = toolInput.pattern as string;

        try {
          // Use find command for glob matching (cross-platform fallback)
          const { stdout } = await execAsync(
            process.platform === 'win32'
              ? `dir /s /b "${pattern}" 2>nul || echo ""`
              : `find . -name "${pattern}" -type f 2>/dev/null | head -100`,
            { cwd: workspacePath, timeout: 30000 }
          );

          const files = stdout.trim().split('\n').filter(Boolean);
          logger.info('Glob search', { pattern, matchCount: files.length });
          return { success: true, output: files.join('\n') || 'No files found' };
        } catch {
          return { success: true, output: 'No files found' };
        }
      }

      case 'Grep': {
        const pattern = toolInput.pattern as string;
        const searchPath = toolInput.path ? resolvePath(toolInput.path as string, workspacePath) : workspacePath;

        try {
          const { stdout } = await execAsync(
            process.platform === 'win32'
              ? `findstr /s /n /r "${pattern}" * 2>nul || echo ""`
              : `grep -rn "${pattern}" "${searchPath}" 2>/dev/null | head -50`,
            { cwd: workspacePath, timeout: 30000 }
          );

          logger.info('Grep search', { pattern, resultLength: stdout.length });
          return { success: true, output: stdout.trim() || 'No matches found' };
        } catch {
          return { success: true, output: 'No matches found' };
        }
      }

      case 'TodoWrite': {
        // TodoWrite is handled specially - we just acknowledge it here
        // The actual tracking is done by the task-progress.service.ts via WebSocket
        const todos = toolInput.todos as Array<{ content: string; activeForm: string; status: string }>;

        if (!todos || !Array.isArray(todos)) {
          return { success: false, output: '', error: 'Invalid todos array' };
        }

        const todoSummary = todos.map((t, i) => {
          const statusIcon = t.status === 'completed' ? '✅' : t.status === 'in_progress' ? '⏳' : '[ ]';
          return `${i + 1}. ${statusIcon} ${t.content}`;
        }).join('\n');

        logger.info('TodoWrite called', { todoCount: todos.length });
        return {
          success: true,
          output: `Task list updated:\n${todoSummary}`
        };
      }

      default:
        return { success: false, output: '', error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Tool execution error', { toolName, error: errorMessage });
    return { success: false, output: '', error: errorMessage };
  }
}

export default {
  toolDefinitions,
  executeTool,
};
