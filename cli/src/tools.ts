import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Resolve a file path relative to working directory
 */
const resolvePath = (filePath: string, workingDir: string): string => {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(workingDir, filePath);
};

/**
 * Execute a tool locally on the user's machine
 */
export async function executeToolLocally(
  toolName: string,
  toolInput: Record<string, unknown>,
  workingDir: string
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'Read': {
        const filePath = resolvePath(toolInput.file_path as string, workingDir);

        if (!fs.existsSync(filePath)) {
          return { success: false, output: '', error: `File not found: ${filePath}` };
        }

        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
          return { success: false, output: '', error: `Path is a directory: ${filePath}` };
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        return { success: true, output: content };
      }

      case 'Write': {
        const filePath = resolvePath(toolInput.file_path as string, workingDir);
        const content = toolInput.content as string;

        // Create directory if it doesn't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true, output: `File written: ${filePath}` };
      }

      case 'Edit': {
        const filePath = resolvePath(toolInput.file_path as string, workingDir);
        const oldString = toolInput.old_string as string;
        const newString = toolInput.new_string as string;

        if (!fs.existsSync(filePath)) {
          return { success: false, output: '', error: `File not found: ${filePath}` };
        }

        let content = fs.readFileSync(filePath, 'utf-8');

        if (!content.includes(oldString)) {
          return {
            success: false,
            output: '',
            error: `String not found in file: "${oldString.substring(0, 50)}..."`
          };
        }

        content = content.replace(oldString, newString);
        fs.writeFileSync(filePath, content, 'utf-8');
        return { success: true, output: `File edited: ${filePath}` };
      }

      case 'Bash': {
        const command = toolInput.command as string;

        // Basic safety check
        const dangerousPatterns = ['rm -rf /', 'format c:', 'del /f /s /q c:\\'];
        for (const pattern of dangerousPatterns) {
          if (command.toLowerCase().includes(pattern.toLowerCase())) {
            return { success: false, output: '', error: `Dangerous command blocked: ${pattern}` };
          }
        }

        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: workingDir,
            timeout: 60000, // 60 second timeout
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/bash',
          });

          const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
          return { success: true, output };
        } catch (execError: unknown) {
          const error = execError as { stdout?: string; stderr?: string; message?: string };
          const output = (error.stdout || '') + (error.stderr || '');
          return { success: false, output, error: error.message };
        }
      }

      case 'Glob': {
        const pattern = toolInput.pattern as string;

        try {
          // Use native commands for glob matching
          const { stdout } = await execAsync(
            process.platform === 'win32'
              ? `dir /s /b "${pattern}" 2>nul`
              : `find . -name "${pattern}" -type f 2>/dev/null | head -100`,
            { cwd: workingDir, timeout: 30000 }
          );

          const files = stdout.trim().split('\n').filter(Boolean);
          return { success: true, output: files.length > 0 ? files.join('\n') : 'No files found' };
        } catch {
          return { success: true, output: 'No files found' };
        }
      }

      case 'Grep': {
        const pattern = toolInput.pattern as string;
        const searchPath = toolInput.path
          ? resolvePath(toolInput.path as string, workingDir)
          : workingDir;

        try {
          const { stdout } = await execAsync(
            process.platform === 'win32'
              ? `findstr /s /n /r "${pattern}" * 2>nul`
              : `grep -rn "${pattern}" "${searchPath}" 2>/dev/null | head -50`,
            { cwd: workingDir, timeout: 30000 }
          );

          return { success: true, output: stdout.trim() || 'No matches found' };
        } catch {
          return { success: true, output: 'No matches found' };
        }
      }

      case 'ListDir': {
        const dirPath = toolInput.path
          ? resolvePath(toolInput.path as string, workingDir)
          : workingDir;

        if (!fs.existsSync(dirPath)) {
          return { success: false, output: '', error: `Directory not found: ${dirPath}` };
        }

        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        const output = items.map(item => {
          const prefix = item.isDirectory() ? '[DIR] ' : '      ';
          return `${prefix}${item.name}`;
        }).join('\n');

        return { success: true, output: output || '(empty directory)' };
      }

      case 'TodoWrite': {
        const todos = toolInput.todos as Array<{
          content: string;
          activeForm: string;
          status: 'pending' | 'in_progress' | 'completed';
        }>;

        if (!todos || !Array.isArray(todos)) {
          return { success: false, output: '', error: 'Invalid todos format' };
        }

        // Display checkbox-style progress
        console.log('\n\x1b[36m📋 Progress Updates:\x1b[0m');
        todos.forEach((todo, index) => {
          let statusIcon: string;
          let textStyle: string;

          switch (todo.status) {
            case 'completed':
              statusIcon = '\x1b[32m✓\x1b[0m'; // Green checkmark
              textStyle = '\x1b[90m'; // Gray text (completed)
              break;
            case 'in_progress':
              statusIcon = '\x1b[33m⟳\x1b[0m'; // Yellow spinner
              textStyle = '\x1b[37m'; // White text (active)
              break;
            default:
              statusIcon = '\x1b[90m○\x1b[0m'; // Gray circle
              textStyle = '\x1b[90m'; // Gray text (pending)
          }

          console.log(`  ${statusIcon} ${textStyle}${index + 1}. ${todo.content}\x1b[0m`);
        });
        console.log('');

        return { success: true, output: `Created ${todos.length} todo items` };
      }

      default:
        return { success: false, output: '', error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, output: '', error: errorMessage };
  }
}

/**
 * Get a human-readable description of what a tool does
 */
export function getToolDescription(toolName: string, toolInput: Record<string, unknown>): string {
  switch (toolName) {
    case 'Read':
      return `Reading file: ${toolInput.file_path}`;
    case 'Write':
      return `Writing file: ${toolInput.file_path}`;
    case 'Edit':
      return `Editing file: ${toolInput.file_path}`;
    case 'Bash':
      return `Running: ${(toolInput.command as string).substring(0, 50)}...`;
    case 'Glob':
      return `Finding files: ${toolInput.pattern}`;
    case 'Grep':
      return `Searching for: ${toolInput.pattern}`;
    case 'ListDir':
      return `Listing: ${toolInput.path || '.'}`;
    case 'TodoWrite':
      return `Creating todo list: ${(toolInput.todos as unknown[])?.length || 0} items`;
    default:
      return `${toolName}`;
  }
}

export default {
  executeToolLocally,
  getToolDescription,
};
