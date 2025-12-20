-- Initialize database schema for OpenAnalyst API
-- Run with: psql $DATABASE_URL -f init.sql

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login_at TIMESTAMP,
    settings JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_api_key_hash ON users(api_key_hash);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title VARCHAR(500),
    description TEXT,
    workspace_path TEXT,
    session_id VARCHAR(255),
    model_used VARCHAR(100) DEFAULT 'anthropic/claude-sonnet-4',
    is_archived BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    total_tokens_used INTEGER DEFAULT 0,
    total_cost_usd DECIMAL(10, 6) DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_message_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    tags TEXT[] DEFAULT '{}'::text[]
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user_archived ON conversations(user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    parent_message_id UUID REFERENCES messages(message_id) ON DELETE SET NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text',
    tool_calls JSONB,
    tool_results JSONB,
    tokens_input INTEGER,
    tokens_output INTEGER,
    model_used VARCHAR(100),
    cost_usd DECIMAL(10, 6),
    latency_ms INTEGER,
    is_error BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_role ON messages(conversation_id, role);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_message_id);

-- Memory store table
CREATE TABLE IF NOT EXISTS memory_store (
    memory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    memory_type VARCHAR(50) NOT NULL CHECK (memory_type IN ('short_term', 'long_term', 'workspace', 'preference', 'context')),
    category VARCHAR(100),
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    value_type VARCHAR(50) DEFAULT 'text',
    importance_score DECIMAL(3, 2) DEFAULT 0.5,
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    source VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_memory_user_type ON memory_store(user_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_memory_user_key ON memory_store(user_id, key);
CREATE INDEX IF NOT EXISTS idx_memory_expires ON memory_store(expires_at) WHERE expires_at IS NOT NULL;

-- Workspace files table
CREATE TABLE IF NOT EXISTS workspace_files (
    file_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_extension VARCHAR(50),
    file_content TEXT,
    file_hash VARCHAR(64),
    file_size_bytes BIGINT,
    mime_type VARCHAR(100),
    is_binary BOOLEAN DEFAULT false,
    line_count INTEGER,
    language VARCHAR(50),
    last_modified TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT NOW(),
    access_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(conversation_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_workspace_files_conversation ON workspace_files(conversation_id);
CREATE INDEX IF NOT EXISTS idx_workspace_files_path ON workspace_files(file_path);

-- Tool execution logs table
CREATE TABLE IF NOT EXISTS tool_execution_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(message_id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    tool_use_id VARCHAR(255),
    tool_name VARCHAR(100) NOT NULL,
    tool_input JSONB NOT NULL,
    tool_output TEXT,
    output_truncated BOOLEAN DEFAULT false,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'running', 'success', 'error', 'cancelled', 'timeout')),
    error_message TEXT,
    error_code VARCHAR(50),
    execution_time_ms INTEGER,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    approval_required BOOLEAN DEFAULT false,
    approval_status VARCHAR(20) CHECK (approval_status IN ('pending', 'approved', 'denied')),
    approved_by UUID REFERENCES users(user_id),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tool_logs_conversation ON tool_execution_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_logs_message ON tool_execution_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_tool_logs_tool_name ON tool_execution_logs(tool_name);

-- Usage analytics table
CREATE TABLE IF NOT EXISTS usage_analytics (
    analytics_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(conversation_id) ON DELETE SET NULL,
    message_id UUID REFERENCES messages(message_id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    event_subtype VARCHAR(50),
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    tokens_total INTEGER DEFAULT 0,
    cost_usd DECIMAL(10, 6) DEFAULT 0,
    model_used VARCHAR(100),
    latency_ms INTEGER,
    tool_name VARCHAR(100),
    success BOOLEAN DEFAULT true,
    error_type VARCHAR(50),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_usage_user_created ON usage_analytics(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_event_type ON usage_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_analytics(created_at);

-- Create a test user for development
INSERT INTO users (username, email, password_hash, is_active, is_verified)
VALUES (
    'testuser',
    'test@example.com',
    '$2b$10$dummyhashfordevelopment',
    true,
    true
) ON CONFLICT (email) DO NOTHING;

-- Output success message
SELECT 'Database initialized successfully!' as status;
