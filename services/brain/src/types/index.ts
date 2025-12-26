// ============================================
// TYPE DEFINITIONS
// ============================================

// User Types
export interface User {
  user_id: string;
  username: string;
  email: string;
  password_hash: string;
  api_key_hash?: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  settings: UserSettings;
}

export interface UserSettings {
  theme?: 'light' | 'dark';
  defaultModel?: string;
  allowedTools?: string[];
  notifications?: boolean;
  [key: string]: unknown;
}

export interface UserCreateInput {
  username: string;
  email: string;
  password: string;
}

export interface UserLoginInput {
  email: string;
  password: string;
}

export interface UserPublic {
  user_id: string;
  username: string;
  email: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: Date;
  settings: UserSettings;
}

// Conversation Types
export interface Conversation {
  conversation_id: string;
  user_id: string;
  title?: string;
  description?: string;
  workspace_path?: string;
  session_id?: string;
  model_used: string;
  is_archived: boolean;
  is_pinned: boolean;
  total_tokens_used: number;
  total_cost_usd: number;
  message_count: number;
  created_at: Date;
  updated_at: Date;
  last_message_at?: Date;
  metadata: Record<string, unknown>;
  tags: string[];
}

export interface ConversationCreateInput {
  title?: string;
  description?: string;
  workspace_path?: string;
  projectId?: string;
  model?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ConversationUpdateInput {
  title?: string;
  description?: string;
  is_archived?: boolean;
  is_pinned?: boolean;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

// Message Types
export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  message_id: string;
  conversation_id: string;
  parent_message_id?: string;
  role: MessageRole;
  content: string;
  content_type: string;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
  tokens_input?: number;
  tokens_output?: number;
  model_used?: string;
  cost_usd?: number;
  latency_ms?: number;
  is_error: boolean;
  error_message?: string;
  created_at: Date;
  metadata: Record<string, unknown>;
}

export interface MessageCreateInput {
  role: MessageRole;
  content: string;
  content_type?: string;
  parent_message_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  tool_use_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  output: string;
  is_error: boolean;
}

// Memory Types
export type MemoryType = 'short_term' | 'long_term' | 'workspace' | 'preference' | 'context';

export interface Memory {
  memory_id: string;
  user_id: string;
  conversation_id?: string;
  memory_type: MemoryType;
  category?: string;
  key: string;
  value: string;
  value_type: string;
  importance_score: number;
  access_count: number;
  last_accessed_at?: Date;
  created_at: Date;
  updated_at: Date;
  expires_at?: Date;
  source?: string;
  metadata: Record<string, unknown>;
}

export interface MemoryCreateInput {
  memory_type: MemoryType;
  category?: string;
  key: string;
  value: string;
  value_type?: string;
  importance_score?: number;
  expires_at?: Date;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryUpdateInput {
  value?: string;
  importance_score?: number;
  expires_at?: Date;
  metadata?: Record<string, unknown>;
}

// Workspace File Types
export interface WorkspaceFile {
  file_id: string;
  conversation_id: string;
  file_path: string;
  file_name: string;
  file_extension?: string;
  file_content?: string;
  file_hash?: string;
  file_size_bytes?: number;
  mime_type?: string;
  is_binary: boolean;
  line_count?: number;
  language?: string;
  last_modified?: Date;
  last_accessed: Date;
  access_count: number;
  created_at: Date;
  updated_at: Date;
  metadata: Record<string, unknown>;
}

// Tool Execution Log Types
export type ToolExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled' | 'timeout';
export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export interface ToolExecutionLog {
  log_id: string;
  message_id?: string;
  conversation_id: string;
  tool_use_id?: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output?: string;
  output_truncated: boolean;
  status: ToolExecutionStatus;
  error_message?: string;
  error_code?: string;
  execution_time_ms?: number;
  started_at: Date;
  completed_at?: Date;
  approval_required: boolean;
  approval_status?: ApprovalStatus;
  approved_by?: string;
  metadata: Record<string, unknown>;
}

// Usage Analytics Types
export interface UsageAnalytics {
  analytics_id: string;
  user_id: string;
  conversation_id?: string;
  message_id?: string;
  event_type: string;
  event_subtype?: string;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  cost_usd: number;
  model_used?: string;
  latency_ms?: number;
  tool_name?: string;
  success: boolean;
  error_type?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
  metadata: Record<string, unknown>;
}

// ============================================
// CLAUDE CODE CLI OPTIONS (Complete Reference)
// ============================================

// Agent/SDK Query Options - Matches Claude Code CLI flags
export interface AgentQueryOptions {
  // Core options
  allowedTools?: string[];                    // --tools, --allowedTools
  disallowedTools?: string[];                 // --disallowedTools
  permissionMode?: 'default' | 'bypassPermissions' | 'acceptEdits' | 'plan';  // --permission-mode
  model?: string;                             // --model (sonnet, opus, haiku, or full name)
  fallbackModel?: string;                     // --fallback-model

  // Prompt customization
  systemPrompt?: string;                      // --system-prompt (replaces default)
  appendSystemPrompt?: string;                // --append-system-prompt (adds to default)

  // Session management
  resume?: string;                            // --resume, -r (session ID or name)
  continue?: boolean;                         // --continue, -c
  sessionId?: string;                         // --session-id (explicit UUID)
  forkSession?: boolean;                      // --fork-session

  // Execution control
  maxTurns?: number;                          // --max-turns
  workingDirectory?: string;                  // working directory for agent
  addDirs?: string[];                         // --add-dir (additional directories)

  // Output options
  outputFormat?: 'text' | 'json' | 'stream-json';  // --output-format
  inputFormat?: 'text' | 'stream-json';            // --input-format
  verbose?: boolean;                               // --verbose
  includePartialMessages?: boolean;                // --include-partial-messages
  jsonSchema?: string;                             // --json-schema

  // Agents/Subagents
  agents?: Record<string, AgentDefinition>;   // --agents (custom subagents)
  agent?: string;                             // --agent (use specific agent)

  // MCP (Model Context Protocol)
  mcpServers?: Record<string, McpServerConfig>;  // --mcp-config
  strictMcpConfig?: boolean;                      // --strict-mcp-config

  // Integrations
  chrome?: boolean;                           // --chrome / --no-chrome
  ide?: boolean;                              // --ide

  // Permissions & Security
  dangerouslySkipPermissions?: boolean;       // --dangerously-skip-permissions
  permissionPromptTool?: string;              // --permission-prompt-tool

  // Advanced
  settings?: Record<string, unknown>;         // --settings
  settingSources?: ('user' | 'project' | 'local')[];  // --setting-sources
  pluginDirs?: string[];                      // --plugin-dir
  betas?: string[];                           // --betas
  debug?: string;                             // --debug
}

// Agent/Subagent definition (for --agents flag)
export interface AgentDefinition {
  description: string;                        // When to invoke this agent
  prompt: string;                             // System prompt for the agent
  tools?: string[];                           // Available tools (inherits all if omitted)
  model?: 'sonnet' | 'opus' | 'haiku';       // Model to use
}

// MCP Server configuration
export interface McpServerConfig {
  command: string;                            // Command to run
  args?: string[];                            // Command arguments
  env?: Record<string, string>;               // Environment variables
}

// Built-in tools available in Claude Code
export const CLAUDE_CODE_TOOLS = [
  'Read',           // Read any file
  'Write',          // Create new files
  'Edit',           // Make precise edits
  'Bash',           // Run terminal commands
  'Glob',           // Find files by pattern
  'Grep',           // Search file contents
  'WebSearch',      // Search the web
  'WebFetch',       // Fetch web content
  'Task',           // Spawn subagents
  'TodoWrite',      // Manage todo list
  'NotebookEdit',   // Edit Jupyter notebooks
] as const;

export type ClaudeCodeTool = typeof CLAUDE_CODE_TOOLS[number];

// Slash commands available in Claude Code interactive mode
export const CLAUDE_CODE_SLASH_COMMANDS = [
  '/help',              // Show all commands
  '/config',            // Configure settings
  '/allowed-tools',     // Configure tool permissions
  '/hooks',             // Configure automation hooks
  '/mcp',               // Manage MCP servers
  '/agents',            // Manage subagents
  '/vim',               // Enable vim mode
  '/terminal-setup',    // Install terminal shortcuts
  '/install-github-app', // GitHub Actions integration
  '/clear',             // Clear conversation
  '/status',            // Show status
  '/exit',              // Exit session
] as const;

export type ClaudeCodeSlashCommand = typeof CLAUDE_CODE_SLASH_COMMANDS[number];

export interface AgentMessage {
  type: 'system' | 'text' | 'tool_use' | 'tool_result' | 'error';
  subtype?: string;
  content?: string;
  session_id?: string;
  tool_use_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  is_error?: boolean;
  result?: string;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
}

// Authentication Types
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

// Pagination Types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// Search Types
export interface SearchParams extends PaginationParams {
  query?: string;
  filters?: Record<string, unknown>;
}

// WebSocket Types
export interface WsMessage {
  type: string;
  payload: unknown;
  conversationId?: string;
  timestamp: Date;
}
