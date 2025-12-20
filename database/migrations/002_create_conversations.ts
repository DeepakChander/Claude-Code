import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('conversations', {
    conversation_id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(user_id)',
      onDelete: 'CASCADE',
    },
    title: {
      type: 'varchar(500)',
    },
    description: {
      type: 'text',
    },
    workspace_path: {
      type: 'text',
    },
    session_id: {
      type: 'varchar(255)',
      comment: 'Agent SDK session ID for resuming conversations',
    },
    model_used: {
      type: 'varchar(100)',
      default: "'anthropic/claude-sonnet-4.5'",
    },
    is_archived: {
      type: 'boolean',
      default: false,
    },
    is_pinned: {
      type: 'boolean',
      default: false,
    },
    total_tokens_used: {
      type: 'integer',
      default: 0,
    },
    total_cost_usd: {
      type: 'decimal(10, 6)',
      default: 0,
    },
    message_count: {
      type: 'integer',
      default: 0,
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    last_message_at: {
      type: 'timestamp',
    },
    metadata: {
      type: 'jsonb',
      default: "'{}'::jsonb",
    },
    tags: {
      type: 'text[]',
      default: "'{}'::text[]",
    },
  });

  // Create indexes for conversation queries
  pgm.createIndex('conversations', ['user_id', 'updated_at'], {
    name: 'idx_conversations_user_updated',
  });
  pgm.createIndex('conversations', ['user_id', 'is_archived'], {
    name: 'idx_conversations_user_archived',
  });
  pgm.createIndex('conversations', 'session_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('conversations');
}
