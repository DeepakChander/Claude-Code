import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Enable UUID extension
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  pgm.createTable('users', {
    user_id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    username: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    password_hash: {
      type: 'varchar(255)',
      notNull: true,
    },
    api_key_hash: {
      type: 'varchar(255)',
    },
    is_active: {
      type: 'boolean',
      default: true,
    },
    is_verified: {
      type: 'boolean',
      default: false,
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('NOW()'),
    },
    last_login_at: {
      type: 'timestamp',
    },
    settings: {
      type: 'jsonb',
      default: "'{}'::jsonb",
    },
  });

  // Create indexes for user lookups
  pgm.createIndex('users', 'email');
  pgm.createIndex('users', 'username');
  pgm.createIndex('users', 'api_key_hash');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('users');
}
