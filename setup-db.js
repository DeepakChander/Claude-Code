require('dotenv').config({ path: './backend/.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const createTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        username VARCHAR(255) UNIQUE,
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('app_users table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        title VARCHAR(500),
        workspace_path TEXT,
        session_id VARCHAR(255),
        model_used VARCHAR(100) DEFAULT 'anthropic/claude-sonnet-4',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('conversations table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID REFERENCES conversations(conversation_id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        tokens_input INTEGER,
        tokens_output INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('messages table created');

    await pool.query(`
      INSERT INTO app_users (username, email, password_hash)
      VALUES ('testuser', 'test@example.com', 'dummy')
      ON CONFLICT (email) DO NOTHING
    `);
    console.log('test user created');

    console.log('Database setup complete!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
};

createTables();
