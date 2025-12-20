import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('tool_execution_logs', {
    log_id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    message_id: {
      type: 'uuid',
      references: 'messages(message_id)',
      onDelete: 'CASCADE',
    },
    conversation_id: {
      type: 'uuid',
      notNull: true,
      references: 'conversations(conversation_id)',
      onDelete: 'CASCADE',
    },
    tool_use_id: {
      type: 'varchar(255)',
      comment: 'Agent SDK tool_use_id',
    },
    tool_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    tool_input: {
      type: 'jsonb',
      notNull: true,
    },
    tool_output: {
      type: 'text',
    },
    output_truncated: {
      type: 'boolean',
      default: false,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'pending'",
      check: "status IN ('pending', 'running', 'success', 'error', 'cancelled', 'timeout')",
    },
    error_message: {
      type: 'text',
    },
    error_code: {
      type: 'varchar(50)',
    },
    execution_time_ms: {
      type: 'integer',
    },
    started_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    completed_at: {
      type: 'timestamp',
    },
    approval_required: {
      type: 'boolean',
      default: false,
    },
    approval_status: {
      type: 'varchar(20)',
      check: "approval_status IS NULL OR approval_status IN ('pending', 'approved', 'denied')",
    },
    approved_by: {
      type: 'uuid',
      references: 'users(user_id)',
      onDelete: 'SET NULL',
    },
    metadata: {
      type: 'jsonb',
      default: "'{}'::jsonb",
    },
  });

  // Create indexes for tool log queries
  pgm.createIndex('tool_execution_logs', 'message_id', {
    name: 'idx_tool_logs_message',
  });
  pgm.createIndex('tool_execution_logs', 'conversation_id', {
    name: 'idx_tool_logs_conversation',
  });
  pgm.createIndex('tool_execution_logs', ['conversation_id', 'tool_name'], {
    name: 'idx_tool_logs_conv_tool',
  });
  pgm.createIndex('tool_execution_logs', ['conversation_id', 'status'], {
    name: 'idx_tool_logs_conv_status',
  });
  pgm.createIndex('tool_execution_logs', 'started_at', {
    name: 'idx_tool_logs_started',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('tool_execution_logs');
}
