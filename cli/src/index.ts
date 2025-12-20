#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import Conf from 'conf';
import fetch from 'node-fetch';
import ora from 'ora';
import inquirer from 'inquirer';

const config = new Conf({ projectName: 'openanalyst' });
const program = new Command();

// Helper to get API URL
const getApiUrl = (): string => {
  const url = config.get('apiUrl') as string;
  if (!url) {
    console.error(chalk.red('API URL not configured. Run: openanalyst config set-url <url>'));
    process.exit(1);
  }
  return url;
};

// Helper to get token
const getToken = (): string => {
  const token = config.get('token') as string;
  if (!token) {
    console.error(chalk.red('Not authenticated. Run: openanalyst auth login'));
    process.exit(1);
  }
  return token;
};

// Make authenticated request
const apiRequest = async (
  endpoint: string,
  options: { method?: string; body?: object; stream?: boolean } = {}
) => {
  const url = `${getApiUrl()}${endpoint}`;
  const token = getToken();

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!options.stream) {
    return response.json();
  }

  return response;
};

program
  .name('openanalyst')
  .description('CLI for OpenAnalyst API - Claude Code on AWS')
  .version('1.0.0');

// Config commands
const configCmd = program.command('config').description('Manage configuration');

configCmd
  .command('set-url <url>')
  .description('Set the API URL')
  .action((url: string) => {
    config.set('apiUrl', url.replace(/\/$/, ''));
    console.log(chalk.green(`API URL set to: ${url}`));
  });

configCmd
  .command('show')
  .description('Show current configuration')
  .action(() => {
    console.log(chalk.bold('Configuration:'));
    console.log(`  API URL: ${config.get('apiUrl') || chalk.gray('(not set)')}`);
    console.log(`  Token: ${config.get('token') ? chalk.green('(set)') : chalk.gray('(not set)')}`);
    console.log(`  User ID: ${config.get('userId') || chalk.gray('(not set)')}`);
    console.log(`  Project: ${config.get('project') || 'default'}`);
  });

configCmd
  .command('set-project <project>')
  .description('Set default project ID')
  .action((project: string) => {
    config.set('project', project);
    console.log(chalk.green(`Default project set to: ${project}`));
  });

configCmd
  .command('clear')
  .description('Clear all configuration')
  .action(async () => {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'Clear all configuration including token?',
      default: false,
    }]);

    if (confirm) {
      config.clear();
      console.log(chalk.green('Configuration cleared'));
    }
  });

// Auth commands
const authCmd = program.command('auth').description('Authentication');

authCmd
  .command('login')
  .description('Login and get API token')
  .option('-u, --user-id <id>', 'User ID (UUID format)')
  .option('-e, --email <email>', 'Email address')
  .action(async (options) => {
    const apiUrl = config.get('apiUrl') as string;
    if (!apiUrl) {
      console.error(chalk.red('API URL not set. Run: openanalyst config set-url <url>'));
      return;
    }

    let userId = options.userId;
    let email = options.email;

    if (!userId) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'userId',
          message: 'Enter User ID (UUID format):',
          validate: (input) => {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            return uuidRegex.test(input) || 'Please enter a valid UUID';
          },
        },
        {
          type: 'input',
          name: 'email',
          message: 'Enter email (optional):',
        },
      ]);
      userId = answers.userId;
      email = answers.email;
    }

    const spinner = ora('Authenticating...').start();

    try {
      const response = await fetch(`${apiUrl}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email }),
      });

      const data = await response.json() as { success: boolean; data?: { token: string; expiresAt: string }; error?: { message: string } };

      if (data.success && data.data) {
        config.set('token', data.data.token);
        config.set('userId', userId);
        spinner.succeed(chalk.green('Authenticated successfully'));
        console.log(`  Token expires: ${data.data.expiresAt}`);
      } else {
        spinner.fail(chalk.red(`Authentication failed: ${data.error?.message}`));
      }
    } catch (error) {
      spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

authCmd
  .command('logout')
  .description('Clear authentication token')
  .action(() => {
    config.delete('token');
    console.log(chalk.green('Logged out successfully'));
  });

authCmd
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    const token = config.get('token') as string;
    if (!token) {
      console.log(chalk.yellow('Not authenticated'));
      return;
    }

    const apiUrl = config.get('apiUrl') as string;
    const spinner = ora('Checking token...').start();

    try {
      const response = await fetch(`${apiUrl}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json() as { success: boolean; data?: { valid: boolean; userId?: string; expiresAt?: string } };

      if (data.success && data.data?.valid) {
        spinner.succeed(chalk.green('Authenticated'));
        console.log(`  User ID: ${data.data.userId}`);
        console.log(`  Expires: ${data.data.expiresAt}`);
      } else {
        spinner.warn(chalk.yellow('Token invalid or expired'));
      }
    } catch (error) {
      spinner.fail(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

// Run command
program
  .command('run <prompt>')
  .description('Run Claude Code with a prompt')
  .option('-p, --project <id>', 'Project ID')
  .option('-m, --model <model>', 'Model to use')
  .option('-s, --sync', 'Wait for complete response (no streaming)')
  .option('--sdk', 'Use SDK mode instead of CLI')
  .option('-t, --tools <tools>', 'Comma-separated list of allowed tools')
  .action(async (prompt: string, options) => {
    const project = options.project || config.get('project') || 'default';
    const endpoint = options.sdk
      ? (options.sync ? '/api/agent/sdk/run-sync' : '/api/agent/sdk/run')
      : (options.sync ? '/api/agent/run-sync' : '/api/agent/run');

    const body: Record<string, unknown> = {
      prompt,
      projectId: project,
    };

    if (options.model) body.model = options.model;
    if (options.tools) body.allowedTools = options.tools.split(',');

    if (options.sync) {
      const spinner = ora('Running...').start();
      try {
        const data = await apiRequest(endpoint, { method: 'POST', body }) as {
          success: boolean;
          data?: { result: string };
          error?: { message: string };
        };

        if (data.success && data.data) {
          spinner.succeed('Complete');
          console.log('\n' + chalk.cyan('Response:'));
          console.log(data.data.result);
        } else {
          spinner.fail(chalk.red(data.error?.message || 'Unknown error'));
        }
      } catch (error) {
        spinner.fail(chalk.red((error as Error).message));
      }
    } else {
      // Streaming mode
      console.log(chalk.cyan('Starting Claude Code...\n'));

      try {
        const response = await apiRequest(endpoint, { method: 'POST', body, stream: true }) as { body: NodeJS.ReadableStream };

        const reader = response.body;
        let buffer = '';

        reader.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                handleStreamMessage(data);
              } catch {
                // Ignore parse errors
              }
            }
          }
        });

        reader.on('end', () => {
          console.log(chalk.green('\n\nComplete'));
        });

        reader.on('error', (err: Error) => {
          console.error(chalk.red(`\nError: ${err.message}`));
        });
      } catch (error) {
        console.error(chalk.red((error as Error).message));
      }
    }
  });

// Handle stream messages
function handleStreamMessage(data: { type: string; content?: string; tool_name?: string; exitCode?: number }) {
  switch (data.type) {
    case 'text':
      process.stdout.write(data.content || '');
      break;
    case 'tool_use':
      console.log(chalk.yellow(`\n[Tool: ${data.tool_name}]`));
      break;
    case 'error':
      console.error(chalk.red(`\nError: ${data.content}`));
      break;
    case 'done':
      if (data.exitCode !== 0) {
        console.log(chalk.yellow(`\nExit code: ${data.exitCode}`));
      }
      break;
  }
}

// Continue command
program
  .command('continue <prompt>')
  .description('Continue the previous conversation')
  .option('-p, --project <id>', 'Project ID')
  .option('--sdk', 'Use SDK mode instead of CLI (required for localhost)')
  .option('-s, --sync', 'Wait for complete response (no streaming)')
  .action(async (prompt: string, options) => {
    const project = options.project || config.get('project') || 'default';

    // Use SDK by default for localhost since CLI mode requires Claude on same machine
    const useSdk = options.sdk || true; // Default to SDK mode
    const endpoint = useSdk
      ? (options.sync ? '/api/agent/sdk/continue-sync' : '/api/agent/sdk/continue')
      : '/api/agent/continue';

    if (options.sync) {
      const spinner = ora('Continuing...').start();
      try {
        const data = await apiRequest(endpoint, {
          method: 'POST',
          body: { prompt, projectId: project }
        }) as {
          success: boolean;
          data?: { result: string };
          error?: { message: string };
        };

        if (data.success && data.data) {
          spinner.succeed('Complete');
          console.log('\n' + chalk.cyan('Response:'));
          console.log(data.data.result);
        } else {
          spinner.fail(chalk.red(data.error?.message || 'Unknown error'));
        }
      } catch (error) {
        spinner.fail(chalk.red((error as Error).message));
      }
    } else {
      console.log(chalk.cyan('Continuing conversation...\n'));

      try {
        const response = await apiRequest(endpoint, {
          method: 'POST',
          body: { prompt, projectId: project },
          stream: true,
        }) as { body: NodeJS.ReadableStream };

        const reader = response.body;
        let buffer = '';

        reader.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                handleStreamMessage(data);
              } catch {
                // Ignore
              }
            }
          }
        });

        reader.on('end', () => {
          console.log(chalk.green('\n\nComplete'));
        });
      } catch (error) {
        console.error(chalk.red((error as Error).message));
      }
    }
  });

// Conversations command
program
  .command('conversations')
  .description('List your conversations')
  .option('-l, --limit <n>', 'Number of results', '10')
  .action(async (options) => {
    const spinner = ora('Loading conversations...').start();

    try {
      const data = await apiRequest(`/api/agent/conversations?limit=${options.limit}`) as {
        success: boolean;
        data?: Array<{
          conversation_id: string;
          title: string;
          message_count: number;
          total_cost_usd: number;
          updated_at: string;
        }>;
      };

      spinner.stop();

      if (data.success && data.data) {
        if (data.data.length === 0) {
          console.log(chalk.yellow('No conversations found'));
          return;
        }

        console.log(chalk.bold('Your Conversations:\n'));
        for (const conv of data.data) {
          const cost = typeof conv.total_cost_usd === 'number' ? conv.total_cost_usd.toFixed(4) : '0.0000';
          console.log(`  ${chalk.cyan(conv.conversation_id.slice(0, 8))}  ${conv.title || '(untitled)'}`);
          console.log(`    Messages: ${conv.message_count || 0}  Cost: $${cost}  Updated: ${new Date(conv.updated_at).toLocaleDateString()}`);
          console.log();
        }
      }
    } catch (error) {
      spinner.fail(chalk.red((error as Error).message));
    }
  });

// Health check command
program
  .command('health')
  .description('Check API health')
  .action(async () => {
    const apiUrl = config.get('apiUrl') as string;
    if (!apiUrl) {
      console.error(chalk.red('API URL not set'));
      return;
    }

    const spinner = ora('Checking API health...').start();

    try {
      const response = await fetch(`${apiUrl}/health`);
      const data = await response.json() as { status: string; database: string; environment: string };

      if (data.status === 'ok') {
        spinner.succeed(chalk.green('API is healthy'));
        console.log(`  Database: ${data.database}`);
        console.log(`  Environment: ${data.environment}`);
      } else {
        spinner.warn(chalk.yellow('API returned non-ok status'));
      }
    } catch (error) {
      spinner.fail(chalk.red(`API unreachable: ${(error as Error).message}`));
    }
  });

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Start interactive mode')
  .option('-p, --project <id>', 'Project ID')
  .option('-m, --model <model>', 'Model to use')
  .action(async (options) => {
    let currentProject = options.project || config.get('project') || 'default';
    let currentModel = options.model || '';
    let useSdk = true; // Default to SDK mode (works from localhost without local Claude)
    let currentTools: string[] = [];
    let disallowedTools: string[] = [];
    let permissionMode: string = 'default';
    let sessionStats = { tokensInput: 0, tokensOutput: 0, costUsd: 0, messages: 0 };
    let customAgents: Record<string, { description: string; prompt: string; model?: string }> = {};
    let mcpServers: Record<string, { command: string; args?: string[] }> = {};
    let hooks: { preMessage?: string; postMessage?: string; onError?: string } = {};

    // Available tools in Claude Code
    const ALL_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Task', 'TodoWrite', 'NotebookEdit'];

    console.log(chalk.cyan.bold('\n╭─────────────────────────────────────────╮'));
    console.log(chalk.cyan.bold('│') + '       OpenAnalyst Interactive Mode      ' + chalk.cyan.bold('│'));
    console.log(chalk.cyan.bold('╰─────────────────────────────────────────╯\n'));
    console.log(chalk.gray('Type /help for commands, or enter prompts to run Claude.\n'));
    console.log(`  ${chalk.bold('Project:')} ${chalk.cyan(currentProject)}`);
    console.log(`  ${chalk.bold('Mode:')} ${useSdk ? chalk.green('SDK') : chalk.yellow('CLI')}`);
    console.log(`  ${chalk.bold('Model:')} ${currentModel || chalk.gray('default')}`);
    console.log('');

    let lastWasContinue = false;

    while (true) {
      const { input } = await inquirer.prompt([{
        type: 'input',
        name: 'input',
        message: lastWasContinue ? chalk.yellow('continue>') : chalk.green('>'),
        prefix: '',
      }]);

      // Help command - matches Claude Code's /help
      if (input === '/help' || input === '/h' || input === '/?') {
        console.log(chalk.cyan('\n╭─────────────────────────────────────────╮'));
        console.log(chalk.cyan('│') + chalk.bold('           Available Commands           ') + chalk.cyan('│'));
        console.log(chalk.cyan('╰─────────────────────────────────────────╯\n'));

        console.log(chalk.bold.yellow(' Session Control:'));
        console.log(`  ${chalk.cyan('/continue, /c')}         Continue previous conversation`);
        console.log(`  ${chalk.cyan('/clear')}                Clear screen and reset display`);
        console.log(`  ${chalk.cyan('/compact')}              Summarize conversation to save context`);
        console.log(`  ${chalk.cyan('/exit, /quit, /q')}      Exit interactive mode`);
        console.log('');

        console.log(chalk.bold.yellow(' Configuration:'));
        console.log(`  ${chalk.cyan('/config')}               View current configuration`);
        console.log(`  ${chalk.cyan('/config set <k> <v>')}   Set a configuration value`);
        console.log(`  ${chalk.cyan('/model <name>')}         Switch AI model`);
        console.log(`  ${chalk.cyan('/project <name>')}       Switch to a different project`);
        console.log(`  ${chalk.cyan('/sdk')}                  Toggle SDK/CLI mode`);
        console.log('');

        console.log(chalk.bold.yellow(' Tools & Permissions:'));
        console.log(`  ${chalk.cyan('/tools')}                List available tools`);
        console.log(`  ${chalk.cyan('/tools <list>')}         Set allowed tools (comma-separated)`);
        console.log(`  ${chalk.cyan('/tools reset')}          Reset to all tools`);
        console.log(`  ${chalk.cyan('/permissions')}          View/manage tool permissions`);
        console.log(`  ${chalk.cyan('/permissions <mode>')}   Set mode: default|plan|acceptEdits|bypass`);
        console.log('');

        console.log(chalk.bold.yellow(' Advanced Features:'));
        console.log(`  ${chalk.cyan('/agents')}               List configured subagents`);
        console.log(`  ${chalk.cyan('/agents add <n> <d>')}   Add a subagent`);
        console.log(`  ${chalk.cyan('/mcp')}                  List MCP servers`);
        console.log(`  ${chalk.cyan('/mcp add <name>')}       Add an MCP server`);
        console.log(`  ${chalk.cyan('/hooks')}                View automation hooks`);
        console.log('');

        console.log(chalk.bold.yellow(' Monitoring:'));
        console.log(`  ${chalk.cyan('/status')}               Show session status`);
        console.log(`  ${chalk.cyan('/cost')}                 Show token usage and cost`);
        console.log(`  ${chalk.cyan('/doctor')}               Run diagnostic health checks`);
        console.log(`  ${chalk.cyan('/history')}              Show recent conversation history`);
        console.log('');

        console.log(chalk.gray('Type any text to send as a prompt to Claude.\n'));
        continue;
      }

      if (input === '/exit' || input === '/quit' || input === '/q') {
        console.log(chalk.gray('Goodbye!'));
        break;
      }

      if (input === '/continue' || input === '/c') {
        lastWasContinue = true;
        console.log(chalk.yellow('Continuing conversation. Type your follow-up prompt:'));
        continue;
      }

      if (input.startsWith('/project ')) {
        const newProject = input.slice(9).trim();
        if (newProject) {
          currentProject = newProject;
          config.set('project', newProject);
          console.log(chalk.green(`Switched to project: ${newProject}`));
        } else {
          console.log(chalk.yellow(`Current project: ${currentProject}`));
        }
        continue;
      }

      if (input === '/status') {
        console.log(chalk.cyan('\n╭─────────────────────────────────────────╮'));
        console.log(chalk.cyan('│') + chalk.bold('            Session Status              ') + chalk.cyan('│'));
        console.log(chalk.cyan('╰─────────────────────────────────────────╯\n'));

        console.log(chalk.bold('  Connection:'));
        console.log(`    API URL:       ${config.get('apiUrl') || chalk.gray('(not set)')}`);
        console.log(`    Authenticated: ${config.get('token') ? chalk.green('Yes ✓') : chalk.red('No ✗')}`);
        console.log(`    User ID:       ${config.get('userId') || chalk.gray('(not set)')}`);
        console.log('');

        console.log(chalk.bold('  Session:'));
        console.log(`    Project:       ${chalk.cyan(currentProject)}`);
        console.log(`    Mode:          ${useSdk ? chalk.green('SDK (OpenRouter)') : chalk.yellow('CLI (local)')}`);
        console.log(`    Model:         ${currentModel || chalk.gray('default')}`);
        console.log(`    Permission:    ${permissionMode}`);
        console.log('');

        console.log(chalk.bold('  Tools:'));
        if (currentTools.length > 0) {
          console.log(`    Allowed:       ${currentTools.join(', ')}`);
        } else {
          console.log(`    Allowed:       ${chalk.gray('all (' + ALL_TOOLS.length + ' tools)')}`);
        }
        if (disallowedTools.length > 0) {
          console.log(`    Disallowed:    ${disallowedTools.join(', ')}`);
        }
        console.log('');

        console.log(chalk.bold('  Advanced:'));
        console.log(`    Agents:        ${Object.keys(customAgents).length > 0 ? Object.keys(customAgents).join(', ') : chalk.gray('none')}`);
        console.log(`    MCP Servers:   ${Object.keys(mcpServers).length > 0 ? Object.keys(mcpServers).join(', ') : chalk.gray('none')}`);
        console.log(`    Hooks:         ${(hooks.preMessage || hooks.postMessage || hooks.onError) ? chalk.green('configured') : chalk.gray('none')}`);
        console.log('');

        console.log(chalk.bold('  Statistics (session):'));
        console.log(`    Messages:      ${sessionStats.messages}`);
        console.log(`    Tokens used:   ${(sessionStats.tokensInput + sessionStats.tokensOutput).toLocaleString()}`);
        console.log(`    Est. cost:     ${chalk.green('$' + sessionStats.costUsd.toFixed(4))}`);
        console.log('');
        continue;
      }

      if (input === '/clear') {
        console.clear();
        console.log(chalk.cyan.bold('\n╭─────────────────────────────────────────╮'));
        console.log(chalk.cyan.bold('│') + '       OpenAnalyst Interactive Mode      ' + chalk.cyan.bold('│'));
        console.log(chalk.cyan.bold('╰─────────────────────────────────────────╯\n'));
        console.log(`  ${chalk.bold('Project:')} ${chalk.cyan(currentProject)}`);
        console.log(`  ${chalk.bold('Mode:')} ${useSdk ? chalk.green('SDK') : chalk.yellow('CLI')}`);
        if (currentModel) console.log(`  ${chalk.bold('Model:')} ${currentModel}`);
        console.log('');
        continue;
      }

      // ==================== /cost ====================
      if (input === '/cost') {
        console.log(chalk.cyan('\n╭─────────────────────────────────────────╮'));
        console.log(chalk.cyan('│') + chalk.bold('          Token Usage & Cost            ') + chalk.cyan('│'));
        console.log(chalk.cyan('╰─────────────────────────────────────────╯\n'));

        // Try to fetch from server
        const spinner = ora('Fetching usage data...').start();
        try {
          const data = await apiRequest(`/api/agent/usage?projectId=${currentProject}`) as {
            success: boolean;
            data?: {
              tokensInput: number;
              tokensOutput: number;
              costUsd: number;
              messageCount: number;
            };
          };

          spinner.stop();

          if (data.success && data.data) {
            const d = data.data;
            console.log(chalk.bold('  Session Usage:'));
            console.log(`    Input tokens:  ${chalk.cyan(d.tokensInput.toLocaleString())}`);
            console.log(`    Output tokens: ${chalk.cyan(d.tokensOutput.toLocaleString())}`);
            console.log(`    Total tokens:  ${chalk.cyan((d.tokensInput + d.tokensOutput).toLocaleString())}`);
            console.log(`    Messages:      ${chalk.cyan(d.messageCount.toString())}`);
            console.log('');
            console.log(chalk.bold('  Cost:'));
            console.log(`    Total cost:    ${chalk.green('$' + d.costUsd.toFixed(4))}`);
          } else {
            // Show local stats
            console.log(chalk.bold('  Session Usage (local):'));
            console.log(`    Input tokens:  ${chalk.cyan(sessionStats.tokensInput.toLocaleString())}`);
            console.log(`    Output tokens: ${chalk.cyan(sessionStats.tokensOutput.toLocaleString())}`);
            console.log(`    Messages:      ${chalk.cyan(sessionStats.messages.toString())}`);
            console.log(`    Est. cost:     ${chalk.green('$' + sessionStats.costUsd.toFixed(4))}`);
          }
        } catch {
          spinner.stop();
          console.log(chalk.bold('  Session Usage (local):'));
          console.log(`    Input tokens:  ${chalk.cyan(sessionStats.tokensInput.toLocaleString())}`);
          console.log(`    Output tokens: ${chalk.cyan(sessionStats.tokensOutput.toLocaleString())}`);
          console.log(`    Messages:      ${chalk.cyan(sessionStats.messages.toString())}`);
          console.log(`    Est. cost:     ${chalk.green('$' + sessionStats.costUsd.toFixed(4))}`);
        }
        console.log('');
        continue;
      }

      // ==================== /doctor ====================
      if (input === '/doctor') {
        console.log(chalk.cyan('\n╭─────────────────────────────────────────╮'));
        console.log(chalk.cyan('│') + chalk.bold('           Diagnostic Check             ') + chalk.cyan('│'));
        console.log(chalk.cyan('╰─────────────────────────────────────────╯\n'));

        const apiUrl = config.get('apiUrl') as string;

        // Check API URL configured
        if (apiUrl) {
          console.log(chalk.green('  ✓') + ' API URL configured: ' + chalk.gray(apiUrl));
        } else {
          console.log(chalk.red('  ✗') + ' API URL not configured');
        }

        // Check token
        const token = config.get('token') as string;
        if (token) {
          console.log(chalk.green('  ✓') + ' Authentication token set');
        } else {
          console.log(chalk.red('  ✗') + ' Not authenticated');
        }

        // Check API health
        if (apiUrl) {
          const spinner = ora('Checking API health...').start();
          try {
            const response = await fetch(`${apiUrl}/health`);
            const data = await response.json() as { status: string; database: string; environment: string };
            spinner.stop();

            if (data.status === 'ok') {
              console.log(chalk.green('  ✓') + ' API is healthy');
              console.log(chalk.green('  ✓') + ` Database: ${data.database}`);
            } else {
              console.log(chalk.yellow('  ⚠') + ' API returned non-ok status');
            }
          } catch (error) {
            spinner.stop();
            console.log(chalk.red('  ✗') + ` API unreachable: ${(error as Error).message}`);
          }
        }

        // Check OpenRouter connection (via backend)
        if (apiUrl && token) {
          const spinner = ora('Checking OpenRouter connection...').start();
          try {
            const response = await fetch(`${apiUrl}/api/agent/health`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json() as { success: boolean; data?: { openrouter: string } };
            spinner.stop();

            if (data.success && data.data?.openrouter === 'connected') {
              console.log(chalk.green('  ✓') + ' OpenRouter connected');
            } else {
              console.log(chalk.yellow('  ⚠') + ' OpenRouter status unknown');
            }
          } catch {
            spinner.stop();
            console.log(chalk.gray('  -') + ' OpenRouter check skipped');
          }
        }

        // Show mode
        console.log(chalk.green('  ✓') + ` Mode: ${useSdk ? 'SDK (OpenRouter API)' : 'CLI (local Claude)'}`);

        console.log('');
        continue;
      }

      // ==================== /config ====================
      if (input === '/config') {
        console.log(chalk.cyan('\n╭─────────────────────────────────────────╮'));
        console.log(chalk.cyan('│') + chalk.bold('          Current Configuration         ') + chalk.cyan('│'));
        console.log(chalk.cyan('╰─────────────────────────────────────────╯\n'));

        console.log(chalk.bold('  Connection:'));
        console.log(`    API URL:    ${config.get('apiUrl') || chalk.gray('(not set)')}`);
        console.log(`    User ID:    ${config.get('userId') || chalk.gray('(not set)')}`);
        console.log(`    Token:      ${config.get('token') ? chalk.green('(set)') : chalk.gray('(not set)')}`);
        console.log('');
        console.log(chalk.bold('  Session:'));
        console.log(`    Project:    ${chalk.cyan(currentProject)}`);
        console.log(`    Model:      ${currentModel || chalk.gray('default')}`);
        console.log(`    Mode:       ${useSdk ? 'SDK' : 'CLI'}`);
        console.log(`    Permission: ${permissionMode}`);
        console.log('');
        console.log(chalk.bold('  Tools:'));
        console.log(`    Allowed:    ${currentTools.length > 0 ? currentTools.join(', ') : chalk.gray('all')}`);
        console.log(`    Disallowed: ${disallowedTools.length > 0 ? disallowedTools.join(', ') : chalk.gray('none')}`);
        console.log('');
        console.log(chalk.gray('  Use /config set <key> <value> to change settings'));
        console.log('');
        continue;
      }

      if (input.startsWith('/config set ')) {
        const parts = input.slice(12).trim().split(' ');
        if (parts.length >= 2) {
          const key = parts[0];
          const value = parts.slice(1).join(' ');

          switch (key) {
            case 'model':
              currentModel = value;
              console.log(chalk.green(`Model set to: ${value}`));
              break;
            case 'project':
              currentProject = value;
              config.set('project', value);
              console.log(chalk.green(`Project set to: ${value}`));
              break;
            case 'permission':
              if (['default', 'plan', 'acceptEdits', 'bypassPermissions'].includes(value)) {
                permissionMode = value;
                console.log(chalk.green(`Permission mode set to: ${value}`));
              } else {
                console.log(chalk.yellow('Invalid permission mode. Use: default, plan, acceptEdits, or bypassPermissions'));
              }
              break;
            default:
              console.log(chalk.yellow(`Unknown config key: ${key}`));
              console.log(chalk.gray('Available keys: model, project, permission'));
          }
        } else {
          console.log(chalk.yellow('Usage: /config set <key> <value>'));
        }
        continue;
      }

      // ==================== /permissions ====================
      if (input === '/permissions') {
        console.log(chalk.cyan('\n╭─────────────────────────────────────────╮'));
        console.log(chalk.cyan('│') + chalk.bold('           Tool Permissions             ') + chalk.cyan('│'));
        console.log(chalk.cyan('╰─────────────────────────────────────────╯\n'));

        console.log(chalk.bold('  Permission Mode:') + ` ${chalk.cyan(permissionMode)}`);
        console.log('');
        console.log(chalk.bold('  Available Modes:'));
        console.log(`    ${chalk.cyan('default')}           - Prompt for risky operations`);
        console.log(`    ${chalk.cyan('plan')}              - Plan mode, no execution`);
        console.log(`    ${chalk.cyan('acceptEdits')}       - Auto-accept file edits`);
        console.log(`    ${chalk.cyan('bypassPermissions')} - Skip all prompts (dangerous)`);
        console.log('');
        console.log(chalk.bold('  Allowed Tools:'));
        if (currentTools.length > 0) {
          for (const tool of currentTools) {
            console.log(`    ${chalk.green('✓')} ${tool}`);
          }
        } else {
          for (const tool of ALL_TOOLS) {
            const isDisallowed = disallowedTools.includes(tool);
            console.log(`    ${isDisallowed ? chalk.red('✗') : chalk.green('✓')} ${tool}`);
          }
        }
        console.log('');
        console.log(chalk.gray('  Use /permissions <mode> to change permission mode'));
        console.log('');
        continue;
      }

      if (input.startsWith('/permissions ')) {
        const mode = input.slice(13).trim();
        if (['default', 'plan', 'acceptEdits', 'bypassPermissions'].includes(mode)) {
          permissionMode = mode;
          console.log(chalk.green(`Permission mode set to: ${mode}`));
          if (mode === 'bypassPermissions') {
            console.log(chalk.yellow('⚠️  Warning: All permission prompts will be skipped!'));
          }
        } else {
          console.log(chalk.yellow('Invalid mode. Use: default, plan, acceptEdits, or bypassPermissions'));
        }
        continue;
      }

      // ==================== /agents ====================
      if (input === '/agents') {
        console.log(chalk.cyan('\n╭─────────────────────────────────────────╮'));
        console.log(chalk.cyan('│') + chalk.bold('          Configured Subagents          ') + chalk.cyan('│'));
        console.log(chalk.cyan('╰─────────────────────────────────────────╯\n'));

        const agentKeys = Object.keys(customAgents);
        if (agentKeys.length === 0) {
          console.log(chalk.gray('  No custom agents configured.'));
          console.log('');
          console.log(chalk.gray('  Built-in agents:'));
          console.log(`    ${chalk.cyan('Explore')}  - Fast codebase exploration`);
          console.log(`    ${chalk.cyan('Plan')}     - Software architect for planning`);
          console.log('');
        } else {
          console.log(chalk.bold('  Custom Agents:'));
          for (const name of agentKeys) {
            const agent = customAgents[name];
            console.log(`    ${chalk.cyan(name)}`);
            console.log(`      Description: ${agent.description}`);
            console.log(`      Model: ${agent.model || 'default'}`);
          }
          console.log('');
        }
        console.log(chalk.gray('  Use /agents add <name> <description> to add a custom agent'));
        console.log(chalk.gray('  Use /agents remove <name> to remove an agent'));
        console.log('');
        continue;
      }

      if (input.startsWith('/agents add ')) {
        const rest = input.slice(12).trim();
        const firstSpace = rest.indexOf(' ');
        if (firstSpace > 0) {
          const name = rest.slice(0, firstSpace);
          const description = rest.slice(firstSpace + 1);

          const { prompt: agentPrompt } = await inquirer.prompt([{
            type: 'input',
            name: 'prompt',
            message: 'Enter agent system prompt:',
          }]);

          customAgents[name] = { description, prompt: agentPrompt };
          console.log(chalk.green(`Agent '${name}' added successfully`));
        } else {
          console.log(chalk.yellow('Usage: /agents add <name> <description>'));
        }
        continue;
      }

      if (input.startsWith('/agents remove ')) {
        const name = input.slice(15).trim();
        if (customAgents[name]) {
          delete customAgents[name];
          console.log(chalk.green(`Agent '${name}' removed`));
        } else {
          console.log(chalk.yellow(`Agent '${name}' not found`));
        }
        continue;
      }

      // ==================== /mcp ====================
      if (input === '/mcp') {
        console.log(chalk.cyan('\n╭─────────────────────────────────────────╮'));
        console.log(chalk.cyan('│') + chalk.bold('            MCP Servers                 ') + chalk.cyan('│'));
        console.log(chalk.cyan('╰─────────────────────────────────────────╯\n'));

        const mcpKeys = Object.keys(mcpServers);
        if (mcpKeys.length === 0) {
          console.log(chalk.gray('  No MCP servers configured.'));
        } else {
          console.log(chalk.bold('  Configured Servers:'));
          for (const name of mcpKeys) {
            const server = mcpServers[name];
            console.log(`    ${chalk.cyan(name)}: ${server.command} ${server.args?.join(' ') || ''}`);
          }
        }
        console.log('');
        console.log(chalk.gray('  Use /mcp add <name> <command> to add a server'));
        console.log(chalk.gray('  Use /mcp remove <name> to remove a server'));
        console.log('');
        continue;
      }

      if (input.startsWith('/mcp add ')) {
        const rest = input.slice(9).trim();
        const parts = rest.split(' ');
        if (parts.length >= 2) {
          const name = parts[0];
          const command = parts[1];
          const args = parts.slice(2);
          mcpServers[name] = { command, args: args.length > 0 ? args : undefined };
          console.log(chalk.green(`MCP server '${name}' added`));
        } else {
          console.log(chalk.yellow('Usage: /mcp add <name> <command> [args...]'));
        }
        continue;
      }

      if (input.startsWith('/mcp remove ')) {
        const name = input.slice(12).trim();
        if (mcpServers[name]) {
          delete mcpServers[name];
          console.log(chalk.green(`MCP server '${name}' removed`));
        } else {
          console.log(chalk.yellow(`Server '${name}' not found`));
        }
        continue;
      }

      // ==================== /hooks ====================
      if (input === '/hooks') {
        console.log(chalk.cyan('\n╭─────────────────────────────────────────╮'));
        console.log(chalk.cyan('│') + chalk.bold('          Automation Hooks              ') + chalk.cyan('│'));
        console.log(chalk.cyan('╰─────────────────────────────────────────╯\n'));

        console.log(chalk.bold('  Configured Hooks:'));
        console.log(`    Pre-message:  ${hooks.preMessage || chalk.gray('(none)')}`);
        console.log(`    Post-message: ${hooks.postMessage || chalk.gray('(none)')}`);
        console.log(`    On error:     ${hooks.onError || chalk.gray('(none)')}`);
        console.log('');
        console.log(chalk.gray('  Use /hooks set <type> <command> to configure'));
        console.log(chalk.gray('  Types: pre, post, error'));
        console.log('');
        continue;
      }

      if (input.startsWith('/hooks set ')) {
        const parts = input.slice(11).trim().split(' ');
        if (parts.length >= 2) {
          const hookType = parts[0];
          const command = parts.slice(1).join(' ');

          switch (hookType) {
            case 'pre':
              hooks.preMessage = command;
              console.log(chalk.green(`Pre-message hook set to: ${command}`));
              break;
            case 'post':
              hooks.postMessage = command;
              console.log(chalk.green(`Post-message hook set to: ${command}`));
              break;
            case 'error':
              hooks.onError = command;
              console.log(chalk.green(`Error hook set to: ${command}`));
              break;
            default:
              console.log(chalk.yellow('Invalid hook type. Use: pre, post, or error'));
          }
        } else {
          console.log(chalk.yellow('Usage: /hooks set <type> <command>'));
        }
        continue;
      }

      // ==================== /compact ====================
      if (input === '/compact') {
        const spinner = ora('Compacting conversation...').start();
        try {
          const data = await apiRequest('/api/agent/compact', {
            method: 'POST',
            body: { projectId: currentProject }
          }) as { success: boolean; data?: { summary: string; tokensSaved: number } };

          spinner.stop();

          if (data.success && data.data) {
            console.log(chalk.green('\n  Conversation compacted!'));
            console.log(`  Tokens saved: ${chalk.cyan(data.data.tokensSaved.toLocaleString())}`);
            if (data.data.summary) {
              console.log(`\n  Summary: ${chalk.gray(data.data.summary.slice(0, 200))}...`);
            }
          } else {
            console.log(chalk.yellow('\n  Could not compact conversation (no data or not supported)'));
          }
        } catch {
          spinner.stop();
          console.log(chalk.yellow('\n  Compact feature requires server support'));
        }
        console.log('');
        continue;
      }

      // ==================== /history ====================
      if (input === '/history') {
        const spinner = ora('Loading history...').start();
        try {
          const data = await apiRequest(`/api/agent/conversations/${currentProject}/messages?limit=10`) as {
            success: boolean;
            data?: Array<{ role: string; content: string; created_at: string }>;
          };

          spinner.stop();

          if (data.success && data.data && data.data.length > 0) {
            console.log(chalk.cyan('\n  Recent Messages:\n'));
            for (const msg of data.data.slice(-10)) {
              const role = msg.role === 'user' ? chalk.green('You') : chalk.cyan('Claude');
              const content = msg.content.length > 100 ? msg.content.slice(0, 100) + '...' : msg.content;
              console.log(`  ${role}: ${content}`);
              console.log('');
            }
          } else {
            console.log(chalk.gray('\n  No messages in history.\n'));
          }
        } catch {
          spinner.stop();
          console.log(chalk.gray('\n  Could not load history.\n'));
        }
        continue;
      }

      // Model command
      if (input.startsWith('/model ')) {
        const newModel = input.slice(7).trim();
        if (newModel) {
          currentModel = newModel;
          console.log(chalk.green(`Model set to: ${newModel}`));
        } else {
          console.log(chalk.yellow('Usage: /model <model-name>'));
          console.log(chalk.gray('Example: /model anthropic/claude-sonnet-4'));
        }
        continue;
      }

      // SDK toggle
      if (input === '/sdk') {
        useSdk = !useSdk;
        console.log(chalk.green(`Mode: ${useSdk ? 'SDK (API calls via OpenRouter)' : 'CLI (spawns local Claude)'}`));
        if (!useSdk) {
          console.log(chalk.yellow('⚠️  CLI mode requires Claude Code installed on the server'));
        }
        continue;
      }

      // Tools command
      if (input === '/tools') {
        if (currentTools.length > 0) {
          console.log(chalk.cyan(`Current tools: ${currentTools.join(', ')}`));
        } else {
          console.log(chalk.gray('Using default tools (all enabled)'));
        }
        console.log(chalk.gray('Use /tools <list> to set, or /tools reset to clear'));
        continue;
      }

      if (input === '/tools reset') {
        currentTools = [];
        console.log(chalk.green('Tools reset to default (all enabled)'));
        continue;
      }

      if (input.startsWith('/tools ')) {
        const toolList = input.slice(7).trim();
        if (toolList && toolList !== 'reset') {
          currentTools = toolList.split(',').map((t: string) => t.trim());
          console.log(chalk.green(`Tools set to: ${currentTools.join(', ')}`));
        }
        continue;
      }

      // Handle unknown commands
      if (input.startsWith('/')) {
        console.log(chalk.yellow(`Unknown command: ${input}`));
        console.log(chalk.gray('Type /help for available commands.\n'));
        continue;
      }

      if (!input.trim()) continue;

      // Determine endpoint based on mode and continue flag
      let endpoint: string;
      if (lastWasContinue) {
        // Use SDK continue when in SDK mode
        endpoint = useSdk ? '/api/agent/sdk/continue' : '/api/agent/continue';
      } else if (useSdk) {
        endpoint = '/api/agent/sdk/run';
      } else {
        endpoint = '/api/agent/run';
      }

      // Build request body with all options
      const requestBody: Record<string, unknown> = {
        prompt: input,
        projectId: currentProject,
      };
      if (currentModel) requestBody.model = currentModel;
      if (currentTools.length > 0) requestBody.allowedTools = currentTools;
      if (disallowedTools.length > 0) requestBody.disallowedTools = disallowedTools;
      if (permissionMode !== 'default') requestBody.permissionMode = permissionMode;
      if (Object.keys(customAgents).length > 0) requestBody.agents = customAgents;
      if (Object.keys(mcpServers).length > 0) requestBody.mcpServers = mcpServers;

      try {
        const response = await apiRequest(endpoint, {
          method: 'POST',
          body: requestBody,
          stream: true,
        }) as { body: NodeJS.ReadableStream };

        process.stdout.write('\n');

        const reader = response.body;
        let buffer = '';

        await new Promise<void>((resolve) => {
          reader.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  handleStreamMessage(data);

                  // Update session stats from usage data
                  if (data.type === 'usage' && data.tokensInput) {
                    sessionStats.tokensInput += data.tokensInput || 0;
                    sessionStats.tokensOutput += data.tokensOutput || 0;
                    sessionStats.costUsd += data.costUsd || 0;
                  }
                  if (data.type === 'done') {
                    sessionStats.messages++;
                  }
                } catch {
                  // Ignore
                }
              }
            }
          });

          reader.on('end', () => {
            console.log('\n');
            resolve();
          });
        });
      } catch (error) {
        console.error(chalk.red((error as Error).message));
      }

      lastWasContinue = false;
    }
  });

program.parse();
