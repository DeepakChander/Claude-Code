import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create function to update updated_at timestamp
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Create triggers for updated_at on all tables
  const tablesWithUpdatedAt = [
    'users',
    'conversations',
    'memory_store',
    'workspace_files',
  ];

  for (const table of tablesWithUpdatedAt) {
    pgm.sql(`
      CREATE TRIGGER update_${table}_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  // Create function to update conversation message count and last_message_at
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_conversation_stats()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE conversations
        SET
          message_count = message_count + 1,
          last_message_at = NEW.created_at,
          updated_at = NOW()
        WHERE conversation_id = NEW.conversation_id;
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE conversations
        SET
          message_count = GREATEST(0, message_count - 1),
          updated_at = NOW()
        WHERE conversation_id = OLD.conversation_id;
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$ language 'plpgsql';
  `);

  pgm.sql(`
    CREATE TRIGGER update_conversation_on_message
    AFTER INSERT OR DELETE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_stats();
  `);

  // Create function to update memory access count and last_accessed_at
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_memory_access()
    RETURNS TRIGGER AS $$
    BEGIN
      UPDATE memory_store
      SET
        access_count = access_count + 1,
        last_accessed_at = NOW()
      WHERE memory_id = NEW.memory_id;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  // Create function to clean expired memories
  pgm.sql(`
    CREATE OR REPLACE FUNCTION clean_expired_memories()
    RETURNS void AS $$
    BEGIN
      DELETE FROM memory_store
      WHERE expires_at IS NOT NULL AND expires_at < NOW();
    END;
    $$ language 'plpgsql';
  `);

  // Create full-text search indexes for messages
  pgm.sql(`
    CREATE INDEX idx_messages_content_fts
    ON messages
    USING gin(to_tsvector('english', content));
  `);

  // Create full-text search index for memory values
  pgm.sql(`
    CREATE INDEX idx_memory_value_fts
    ON memory_store
    USING gin(to_tsvector('english', value));
  `);

  // Create composite indexes for common query patterns
  pgm.createIndex('conversations', ['user_id', 'is_archived', 'updated_at'], {
    name: 'idx_conv_user_archived_updated',
  });

  pgm.createIndex('messages', ['conversation_id', 'role', 'created_at'], {
    name: 'idx_messages_conv_role_created',
  });

  pgm.createIndex('memory_store', ['user_id', 'memory_type', 'importance_score'], {
    name: 'idx_memory_user_type_importance',
  });

  // Create partial index for active conversations
  pgm.sql(`
    CREATE INDEX idx_active_conversations
    ON conversations(user_id, updated_at DESC)
    WHERE is_archived = false;
  `);

  // Create partial index for pending tool executions
  pgm.sql(`
    CREATE INDEX idx_pending_tool_executions
    ON tool_execution_logs(conversation_id, started_at)
    WHERE status = 'pending' OR status = 'running';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop triggers
  pgm.sql('DROP TRIGGER IF EXISTS update_users_updated_at ON users');
  pgm.sql('DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations');
  pgm.sql('DROP TRIGGER IF EXISTS update_memory_store_updated_at ON memory_store');
  pgm.sql('DROP TRIGGER IF EXISTS update_workspace_files_updated_at ON workspace_files');
  pgm.sql('DROP TRIGGER IF EXISTS update_conversation_on_message ON messages');

  // Drop functions
  pgm.sql('DROP FUNCTION IF EXISTS update_updated_at_column()');
  pgm.sql('DROP FUNCTION IF EXISTS update_conversation_stats()');
  pgm.sql('DROP FUNCTION IF EXISTS update_memory_access()');
  pgm.sql('DROP FUNCTION IF EXISTS clean_expired_memories()');

  // Drop indexes
  pgm.sql('DROP INDEX IF EXISTS idx_messages_content_fts');
  pgm.sql('DROP INDEX IF EXISTS idx_memory_value_fts');
  pgm.sql('DROP INDEX IF EXISTS idx_conv_user_archived_updated');
  pgm.sql('DROP INDEX IF EXISTS idx_messages_conv_role_created');
  pgm.sql('DROP INDEX IF EXISTS idx_memory_user_type_importance');
  pgm.sql('DROP INDEX IF EXISTS idx_active_conversations');
  pgm.sql('DROP INDEX IF EXISTS idx_pending_tool_executions');
}
