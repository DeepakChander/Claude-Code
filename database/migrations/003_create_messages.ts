import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('messages', {
    message_id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    conversation_id: {
      type: 'uuid',
      notNull: true,
      references: 'conversations(conversation_id)',
      onDelete: 'CASCADE',
    },
    parent_message_id: {
      type: 'uuid',
      references: 'messages(message_id)',
      onDelete: 'SET NULL',
      comment: 'For threading/branching conversations',
    },
    role: {
      type: 'varchar(20)',
      notNull: true,
      check: "role IN ('user', 'assistant', 'system')",
    },
    content: {
      type: 'text',
      notNull: true,
    },
    content_type: {
      type: 'varchar(50)',
      default: "'text'",
      comment: 'text, code, markdown, etc.',
    },
    tool_calls: {
      type: 'jsonb',
      comment: 'Array of tool calls made by assistant',
    },
    tool_results: {
      type: 'jsonb',
      comment: 'Results from tool executions',
    },
    tokens_input: {
      type: 'integer',
    },
    tokens_output: {
      type: 'integer',
    },
    model_used: {
      type: 'varchar(100)',
    },
    cost_usd: {
      type: 'decimal(10, 6)',
    },
    latency_ms: {
      type: 'integer',
      comment: 'Response time in milliseconds',
    },
    is_error: {
      type: 'boolean',
      default: false,
    },
    error_message: {
      type: 'text',
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    metadata: {
      type: 'jsonb',
      default: "'{}'::jsonb",
    },
  });

  // Create indexes for message queries
  pgm.createIndex('messages', ['conversation_id', 'created_at'], {
    name: 'idx_messages_conversation_created',
  });
  pgm.createIndex('messages', ['conversation_id', 'role'], {
    name: 'idx_messages_conversation_role',
  });
  pgm.createIndex('messages', 'parent_message_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('messages');
}
