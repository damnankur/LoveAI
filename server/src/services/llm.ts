import { config } from '../config';
import { StoredPersona } from '../vector/store';
import { personaArchetype, Profile } from '../persona/profile';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  personaText: string;
  profile: Profile;
  similarPersonas: StoredPersona[];
  history: ChatTurn[];
  userMessage: string;
}

function buildSystemPrompt(o: GenerateOptions): string {
  const rag =
    o.similarPersonas.length > 0
      ? o.similarPersonas
          .map(
            (p, i) =>
              `[Similar persona ${i + 1} (similarity ${(p.similarity ?? 0).toFixed(2)})]\n${p.profile}`
          )
          .join('\n\n')
      : 'No similar personas retrieved yet.';
  return [
    'You are LoveAI, a supportive conversational AI companion.',
    'Steer your responses to match the user\u2019s psychological persona below. Mirror their preferred communication style, emotional tone, and motivations.',
    '',
    '=== CURRENT USER PERSONA ===',
    o.personaText,
    '',
    `The user broadly fits the archetype of ${personaArchetype(o.profile)}.`,
    '',
    '=== SIMILAR PERSONAS RETRIEVED VIA RAG (pgvector) ===',
    rag,
    '',
    'Guidelines:',
    '- Be warm and conversational. Use short, natural sentences.',
    '- Adapt: if the user is reserved/private, keep responses concise and thoughtful; if outgoing, be more expressive and playful.',
    '- Reflect their motivations: intrinsic curiosity vs achievement/reward.',
    '- Use the similar personas to infer likely needs and tone.',
    '- Never claim to be a licensed therapist. Keep responses emotionally intelligent.',
  ].join('\n');
}

// Deterministic local fallback so the whole product runs without the fine-tuned model.
function mockReply(o: GenerateOptions): string {
  const p = o.profile;
  const msg = o.userMessage.toLowerCase();

  const warm = p.agreeableness > 0.6;
  const concise = p.extraversion < 0.4 || p.verbal_preference > 0.6;
  const composed = p.neuroticism < 0.4;
  const curious = p.openness > 0.6;

  let reply: string;

  if (/\b(hi|hello|hey|yo|sup)\b/.test(msg)) {
    reply = warm
      ? `Hey there! It\u2019s really good to talk with you today. What\u2019s on your mind?`
      : `Hi. Good to see you here. How are things going?`;
  } else if (msg.includes('?') || /(how|what|why|when|where|who|which)\b/.test(msg)) {
    reply = curious
      ? `That\u2019s a great question. If I had to explore it with you: start with what you already know, then question one assumption at a time. What feels most uncertain about it?`
      : `Straight answer: it depends on your priorities and constraints. What does the ideal outcome look like for you?`;
  } else if (/(sad|down|stressed|anxious|tired|overwhelmed|worried)/.test(msg)) {
    reply = composed
      ? `I hear you. That sounds heavy, and it makes sense you\u2019d feel that way. You don\u2019t have to solve it all right now - what small step would take some weight off?`
      : `I\u2019m really sorry you\u2019re dealing with that. It\u2019s okay to feel it. Want to talk through what\u2019s triggering it, or would a distraction help more right now?`;
  } else if (/(happy|great|excited|awesome|amazing|good news|love)/.test(msg)) {
    reply = warm
      ? `That\u2019s wonderful - I can feel the energy in that! Tell me more about what made it happen.`
      : `Nice, that\u2019s a real win. How are you planning to build on it?`;
  } else if (/(thank|thanks|thx)/.test(msg)) {
    reply = `Anytime. That\u2019s what I\u2019m here for. What\u2019s next for you?`;
  } else if (msg.length < 20) {
    reply = `Got it. ${warm ? 'Want to expand on that a little?' : 'Tell me a bit more when you\u2019re ready.'}`;
  } else {
    reply = concise
      ? `I\u2019m following you. The core of what you\u2019re describing seems to be: what matters to you, and how to move forward without overcomplicating it. Where would you like to start?`
      : `That\u2019s really interesting - there\u2019s a lot in what you just said. If you had to pick the single most important part of it for you right now, which would it be?`;
  }
  return reply;
}

export async function generateReply(o: GenerateOptions): Promise<string> {
  if (config.llmMock || !config.llmEnabled) return mockReply(o);

  const system = buildSystemPrompt(o);
  const messages: ChatTurn[] = o.history.slice(-12);
  messages.push({ role: 'user', content: o.userMessage });

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), config.llmTimeoutMs);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.llmApiKey) headers.Authorization = `Bearer ${config.llmApiKey}`;
    // OpenAI-compatible endpoint (ml/serve.py or Gemini).
    const res = await fetch(`${config.llmUrl}${config.llmChatPath}`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.llmModel,
        messages: [{ role: 'system', content: system }, ...messages],
        max_tokens: 220,
        temperature: 0.8,
        top_p: 0.95,
      }),
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`LLM status ${res.status}`);
    const data = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!text) throw new Error('Empty LLM response');
    return text;
  } catch (err: any) {
    if (String(err?.name) === 'AbortError') {
      return mockReply(o);
    }
    // Inference server not running yet -> local deterministic fallback.
    console.warn('[llm] inference server unreachable, using fallback:', err?.message);
    return mockReply(o);
  }
}
