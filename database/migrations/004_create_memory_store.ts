import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('memory_store', {
    memory_id: {
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
      onDelete: 'CASCADE',
      comment: 'NULL for user-level memories',
    },
    memory_type: {
      type: 'varchar(50)',
      notNull: true,
      check: "memory_type IN ('short_term', 'long_term', 'workspace', 'preference', 'context')",
    },
    category: {
      type: 'varchar(100)',
      comment: 'e.g., file_context, user_preference, project_knowledge',
    },
    key: {
      type: 'varchar(255)',
      notNull: true,
    },
    value: {
      type: 'text',
      notNull: true,
    },
    value_type: {
      type: 'varchar(50)',
      default: "'text'",
      comment: 'text, json, code, etc.',
    },
    importance_score: {
      type: 'decimal(3, 2)',
      default: 0.5,
      comment: 'Relevance score 0.00-1.00',
    },
    access_count: {
      type: 'integer',
      default: 0,
    },
    last_accessed_at: {
      type: 'timestamp',
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    expires_at: {
      type: 'timestamp',
      comment: 'NULL for permanent memories',
    },
    source: {
      type: 'varchar(100)',
      comment: 'Where this memory came from (user_input, extracted, system)',
    },
    metadata: {
      type: 'jsonb',
      default: "'{}'::jsonb",
    },
  });

  // Create unique constraint for user + conversation + key
  pgm.addConstraint('memory_store', 'unique_user_conv_key', {
    unique: ['user_id', 'conversation_id', 'key'],
  });

  // Create indexes for memory lookups
  pgm.createIndex('memory_store', ['user_id', 'conversation_id'], {
    name: 'idx_memory_user_conv',
  });
  pgm.createIndex('memory_store', ['user_id', 'memory_type'], {
    name: 'idx_memory_user_type',
  });
  pgm.createIndex('memory_store', 'expires_at', {
    name: 'idx_memory_expires',
    where: 'expires_at IS NOT NULL',
  });
  pgm.createIndex('memory_store', ['user_id', 'importance_score'], {
    name: 'idx_memory_importance',
  });
  pgm.createIndex('memory_store', 'category');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('memory_store');
}
