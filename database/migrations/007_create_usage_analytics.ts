import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('usage_analytics', {
    analytics_id: {
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
    conversation_id: {
      type: 'uuid',
      references: 'conversations(conversation_id)',
      onDelete: 'SET NULL',
    },
    message_id: {
      type: 'uuid',
      references: 'messages(message_id)',
      onDelete: 'SET NULL',
    },
    event_type: {
      type: 'varchar(50)',
      notNull: true,
      comment: 'query, tool_use, error, login, conversation_created, etc.',
    },
    event_subtype: {
      type: 'varchar(50)',
      comment: 'More specific event categorization',
    },
    tokens_input: {
      type: 'integer',
      default: 0,
    },
    tokens_output: {
      type: 'integer',
      default: 0,
    },
    tokens_total: {
      type: 'integer',
      default: 0,
    },
    cost_usd: {
      type: 'decimal(10, 6)',
      default: 0,
    },
    model_used: {
      type: 'varchar(100)',
    },
    latency_ms: {
      type: 'integer',
    },
    tool_name: {
      type: 'varchar(100)',
    },
    success: {
      type: 'boolean',
      default: true,
    },
    error_type: {
      type: 'varchar(100)',
    },
    ip_address: {
      type: 'varchar(45)',
      comment: 'IPv4 or IPv6 address',
    },
    user_agent: {
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

  // Create indexes for analytics queries
  pgm.createIndex('usage_analytics', ['user_id', 'created_at'], {
    name: 'idx_analytics_user_date',
  });
  pgm.createIndex('usage_analytics', 'conversation_id', {
    name: 'idx_analytics_conversation',
  });
  pgm.createIndex('usage_analytics', ['user_id', 'event_type'], {
    name: 'idx_analytics_user_event',
  });
  pgm.createIndex('usage_analytics', ['created_at', 'event_type'], {
    name: 'idx_analytics_date_event',
  });
  pgm.createIndex('usage_analytics', ['user_id', 'model_used'], {
    name: 'idx_analytics_user_model',
  });

  // Create a view for daily usage summary
  pgm.sql(`
    CREATE OR REPLACE VIEW daily_usage_summary AS
    SELECT
      user_id,
      DATE(created_at) as usage_date,
      COUNT(*) as total_events,
      COUNT(CASE WHEN event_type = 'query' THEN 1 END) as query_count,
      SUM(tokens_input) as total_tokens_input,
      SUM(tokens_output) as total_tokens_output,
      SUM(tokens_total) as total_tokens,
      SUM(cost_usd) as total_cost_usd,
      AVG(latency_ms) as avg_latency_ms,
      COUNT(CASE WHEN success = false THEN 1 END) as error_count
    FROM usage_analytics
    GROUP BY user_id, DATE(created_at)
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP VIEW IF EXISTS daily_usage_summary');
  pgm.dropTable('usage_analytics');
}
