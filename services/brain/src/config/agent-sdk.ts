import { config } from 'dotenv';
import { openRouterConfig } from './openrouter';

config();

// Agent SDK Configuration for use with OpenRouter
export const agentSdkConfig = {
  // SECURITY: Default to safe read-only tools
  // Dangerous tools (Bash, Write, Edit) require explicit permission
  defaultAllowedTools: [
    'Read',
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
    // SECURITY: Safe tools that can be auto-approved
    safe: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    // SECURITY: Dangerous tools that require explicit approval
    dangerous: ['Write', 'Edit', 'Bash'],
  },

  // SECURITY: Changed from 'bypassPermissions' to 'default'
  // This requires explicit tool permissions instead of auto-approving everything
  defaultPermissionMode: 'default' as const,

  // Default query options - SECURITY: Only safe tools by default
  defaultQueryOptions: {
    allowedTools: ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'],
    permissionMode: 'default' as const,
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
    // SECURITY: Expanded dangerous command blocklist
    dangerousCommands: [
      // File system destruction
      'rm -rf /',
      'rm -rf /*',
      'rm -rf ~',
      'rm -rf .',
      'del /f /s /q',
      'format c:',
      'format d:',
      // Disk operations
      'dd if=/dev/zero',
      'dd if=/dev/random',
      'mkfs',
      'fdisk',
      'parted',
      // Fork bomb
      ':(){ :|:& };:',
      // Network attacks
      'nc -l',
      'ncat -l',
      'netcat',
      // Privilege escalation
      'sudo su',
      'sudo -i',
      'chmod 777',
      'chown root',
      // Crypto mining
      'xmrig',
      'minerd',
      'cryptonight',
      // Reverse shells
      'bash -i >& /dev/tcp',
      '/bin/bash -c',
      'python -c "import socket',
      'perl -e',
      // Credential theft
      'cat /etc/shadow',
      'cat ~/.ssh/id_rsa',
      'cat ~/.aws/credentials',
      // Environment exfiltration
      'printenv',
      'env | curl',
      'curl -d "$(env)"',
    ],
    // SECURITY: Expanded blocked paths
    blockedPaths: [
      '/etc/passwd',
      '/etc/shadow',
      '/etc/sudoers',
      '~/.ssh',
      '~/.aws',
      '~/.gnupg',
      '~/.config/gcloud',
      '/root',
      '/var/log',
      'C:\\Windows\\System32',
      'C:\\Users\\*\\AppData',
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
