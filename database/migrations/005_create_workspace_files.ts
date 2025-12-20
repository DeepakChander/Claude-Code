import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('workspace_files', {
    file_id: {
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
    file_path: {
      type: 'text',
      notNull: true,
    },
    file_name: {
      type: 'varchar(255)',
      notNull: true,
    },
    file_extension: {
      type: 'varchar(50)',
    },
    file_content: {
      type: 'text',
      comment: 'Cached file content for context',
    },
    file_hash: {
      type: 'varchar(64)',
      comment: 'SHA-256 hash for change detection',
    },
    file_size_bytes: {
      type: 'bigint',
    },
    mime_type: {
      type: 'varchar(100)',
    },
    is_binary: {
      type: 'boolean',
      default: false,
    },
    line_count: {
      type: 'integer',
    },
    language: {
      type: 'varchar(50)',
      comment: 'Detected programming language',
    },
    last_modified: {
      type: 'timestamp',
    },
    last_accessed: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    access_count: {
      type: 'integer',
      default: 1,
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    metadata: {
      type: 'jsonb',
      default: "'{}'::jsonb",
      comment: 'Additional file metadata (imports, exports, dependencies)',
    },
  });

  // Create unique constraint for conversation + file_path
  pgm.addConstraint('workspace_files', 'unique_conv_filepath', {
    unique: ['conversation_id', 'file_path'],
  });

  // Create indexes for file lookups
  pgm.createIndex('workspace_files', 'conversation_id', {
    name: 'idx_workspace_files_conv',
  });
  pgm.createIndex('workspace_files', 'file_path', {
    name: 'idx_workspace_files_path',
  });
  pgm.createIndex('workspace_files', ['conversation_id', 'file_extension'], {
    name: 'idx_workspace_files_ext',
  });
  pgm.createIndex('workspace_files', ['conversation_id', 'language'], {
    name: 'idx_workspace_files_lang',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('workspace_files');
}
