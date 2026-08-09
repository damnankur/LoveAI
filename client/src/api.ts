import axios from 'axios';

export interface MatrixQuestion {
  id: string;
  trait: string;
  category: string;
  text: string;
  reverse?: boolean;
}
export interface ScaleOption {
  value: number;
  label: string;
}

export interface MatrixResponse {
  questions: MatrixQuestion[];
  scale: ScaleOption[];
  traitOrder: string[];
}

export interface EvaluateResult {
  evaluationId: string;
  archetype: string;
  profile: Record<string, number>;
  personaText: string;
  vectorDim: number;
  vectorPreview: number[];
}

export interface ChatSession {
  sessionId: string;
  evaluationId: string;
}

export interface SendResult {
  reply: string;
  similarPersonas: { id: string; similarity: number }[];
  ragUsed: boolean;
}

export interface ChatMessageRecord {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('loveai_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export async function fetchMatrix(): Promise<MatrixResponse> {
  const { data } = await api.get('/persona/matrix');
  return data;
}

export async function submitEvaluation(
  responses: Record<string, number>,
  email?: string,
  displayName?: string
): Promise<EvaluateResult> {
  const { data } = await api.post('/persona/evaluate', { responses, email, displayName });
  return data;
}

export async function createSession(evaluationId: string): Promise<ChatSession> {
  const { data } = await api.post('/chat/sessions', { evaluationId });
  return data;
}

export async function fetchMessages(sessionId: string): Promise<ChatMessageRecord[]> {
  const { data } = await api.get(`/chat/sessions/${sessionId}/messages`);
  return data.messages;
}

export async function sendMessage(sessionId: string, message: string): Promise<SendResult> {
  const { data } = await api.post(`/chat/sessions/${sessionId}/messages`, { message });
  return data;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface ProfileEvaluation {
  id: string;
  responses: Record<string, number>;
  dimensions: Record<string, number>;
  profile: string;
  completedAt: string;
}

export interface ProfileResult {
  user: AuthUser;
  evaluation: ProfileEvaluation | null;
}

export async function googleLogin(idToken: string): Promise<{ token: string; user: AuthUser }> {
  const { data } = await api.post('/auth/google', { idToken });
  return data;
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get('/auth/me');
  return data.user;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function fetchProfile(): Promise<ProfileResult> {
  const { data } = await api.get('/profile');
  return data;
}
