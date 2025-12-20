import { config } from 'dotenv';
import { openRouterConfig } from './openrouter';

config();

// Agent SDK Configuration for use with OpenRouter
export const agentSdkConfig = {
  // Default allowed tools
  defaultAllowedTools: [
    'Read',
    'Write',
    'Edit',
    'Bash',
    'Glob',
    'Grep',
    'WebSearch',
    'WebFetch',
  ],

  // Tool categories for permission management
  toolCategories: {
    readOnly: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    write: ['Write', 'Edit'],
    execute: ['Bash'],
    all: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
  },

  // Default permission mode (auto-approve all as requested by user)
  defaultPermissionMode: 'bypassPermissions' as const,

  // Default query options
  defaultQueryOptions: {
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    permissionMode: 'bypassPermissions' as const,
    model: openRouterConfig.defaultModel,
  },

  // Workspace configuration
  workspace: {
    basePath: process.env.WORKSPACE_BASE_PATH || '../workspaces',
    maxSizeMB: parseInt(process.env.MAX_WORKSPACE_SIZE_MB || '500', 10),
    cleanupIntervalMs: 3600000, // 1 hour
    maxFileSize: 10 * 1024 * 1024, // 10MB
  },

  // Session configuration
  session: {
    maxDurationMs: 3600000, // 1 hour
    idleTimeoutMs: 600000, // 10 minutes
    maxConcurrentSessions: 10,
  },

  // Streaming configuration
  streaming: {
    enabled: true,
    heartbeatIntervalMs: 30000, // 30 seconds
    maxBufferSize: 1024 * 1024, // 1MB
  },

  // Rate limiting for agent queries
  rateLimit: {
    maxQueriesPerMinute: 20,
    maxQueriesPerHour: 200,
    maxTokensPerDay: 1000000,
  },

  // Safety configuration
  safety: {
    maxOutputLength: 100000,
    maxToolExecutions: 50,
    dangerousCommands: [
      'rm -rf /',
      'format c:',
      'dd if=/dev/zero',
      'mkfs',
      ':(){ :|:& };:',
    ],
    blockedPaths: [
      '/etc/passwd',
      '/etc/shadow',
      '~/.ssh',
      '~/.aws',
    ],
  },
};

// Get agent options for a specific use case
export const getAgentOptions = (
  customOptions?: Partial<typeof agentSdkConfig.defaultQueryOptions>
) => {
  return {
    ...agentSdkConfig.defaultQueryOptions,
    ...customOptions,
  };
};

// Check if a tool is allowed
export const isToolAllowed = (tool: string, allowedTools: string[] = agentSdkConfig.defaultAllowedTools): boolean => {
  return allowedTools.includes(tool);
};

// Get tools by category
export const getToolsByCategory = (category: keyof typeof agentSdkConfig.toolCategories): string[] => {
  return agentSdkConfig.toolCategories[category] || [];
};

// Validate command safety
export const isCommandSafe = (command: string): boolean => {
  const lowerCommand = command.toLowerCase();
  return !agentSdkConfig.safety.dangerousCommands.some(
    dangerous => lowerCommand.includes(dangerous.toLowerCase())
  );
};

// Validate path safety
export const isPathSafe = (path: string): boolean => {
  return !agentSdkConfig.safety.blockedPaths.some(
    blocked => path.includes(blocked.replace('~', process.env.HOME || ''))
  );
};

export default agentSdkConfig;
