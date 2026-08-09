import { pool } from './db';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export async function createSession(
  userId: string | null,
  personaEvaluationId: string
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO chat_sessions (user_id, persona_evaluation_id) VALUES ($1, $2) RETURNING id`,
    [userId, personaEvaluationId]
  );
  return rows[0].id;
}

export async function getSession(id: string): Promise<{ id: string; persona_evaluation_id: string } | null> {
  const { rows } = await pool.query(
    `SELECT id, persona_evaluation_id FROM chat_sessions WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
): Promise<void> {
  await pool.query(
    `INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)`,
    [sessionId, role, content]
  );
}

export async function getMessages(sessionId: string, limit = 40): Promise<ChatMessage[]> {
  const { rows } = await pool.query(
    `SELECT id, role, content, created_at FROM chat_messages
     WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2`,
    [sessionId, limit]
  );
  return rows;
}
