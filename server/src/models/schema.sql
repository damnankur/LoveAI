-- LoveAI Database Schema
-- Designed for PostgreSQL with pgvector. When pgvector is unavailable,
-- the server applies a fallback schema (persona_vector_json) instead.

-- Enable pgvector extension (skip if unavailable)
CREATE EXTENSION IF NOT EXISTS vector;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    display_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Google-auth bearer sessions
CREATE TABLE IF NOT EXISTS auth_sessions (
    token VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

-- Persona evaluations
CREATE TABLE IF NOT EXISTS persona_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    responses JSONB NOT NULL,
    dimensions JSONB NOT NULL,
    profile TEXT NOT NULL,
    persona_vector vector(768),
    persona_vector_json JSONB,
    completed_at TIMESTAMP DEFAULT NOW()
);

-- Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    persona_evaluation_id UUID REFERENCES persona_evaluations(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index for approximate nearest-neighbour vector search (HNSW)
CREATE INDEX IF NOT EXISTS idx_persona_vector ON persona_evaluations
    USING hnsw (persona_vector vector_cosine_ops);
