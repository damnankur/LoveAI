'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import {
  ChatMessageRecord,
  SendResult,
  createSession,
  fetchMessages,
  sendMessage,
} from '@/lib/api';
import ThemeToggle from './ThemeToggle';

const STARTERS = [
  'I saw someone I like today, but I was too shy to say hello. How can I reach out?',
  'Why do I sometimes pull away when feelings start getting close?',
  'How do I express what I truly need in love without feeling needy?',
  'What are gentle ways to navigate conflict when emotions run high?',
];

interface LocalPersona {
  archetype: string;
  personaType?: string;
  personaText: string;
  profile: Record<string, number>;
}

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ragUsed?: boolean;
  rag?: { id: string; personaType: string | null; similarity: number }[];
}

function toUi(m: ChatMessageRecord): UiMessage {
  return { id: m.id, role: m.role as 'user' | 'assistant', content: m.content };
}

export default function Chat() {
  const router = useRouter();
  const [persona, setPersona] = useState<LocalPersona | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [ragFor, setRagFor] = useState<UiMessage | null>(null);
  const [confirmRetake, setConfirmRetake] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    const stored = localStorage.getItem('loveai_persona');
    if (stored) {
      try {
        setPersona(JSON.parse(stored));
      } catch {
        /* ignore */
      }
    }
    const evaluationId = localStorage.getItem('loveai_evaluation_id');
    if (!evaluationId) {
      router.push('/evaluate');
      return;
    }
    (async () => {
      try {
        let sid = sessionId || localStorage.getItem('loveai_session_id') || '';
        if (!sid) {
          const s = await createSession(evaluationId);
          sid = s.sessionId;
          localStorage.setItem('loveai_session_id', sid);
          if (!cancelled) setSessionId(sid);
        } else if (!sessionId && !cancelled) {
          setSessionId(sid);
        }
        const msgs = await fetchMessages(sid);
        if (!cancelled) {
          setMessages(msgs.filter((m) => m.role === 'user' || m.role === 'assistant').map(toUi));
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.error || e?.message || 'Unable to load your conversation.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function submit(promptText?: string) {
    const text = (promptText ?? input).trim();
    if (!text || !sessionId || sending) return;
    setSending(true);
    setError('');
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: 'user', content: text }]);
    try {
      const res: SendResult = await sendMessage(sessionId, text);
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: res.reply,
          ragUsed: res.ragUsed,
          rag: res.similarPersonas,
        },
      ]);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Unable to receive response. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat-app">
      {/* Weightless Floating Header */}
      <header className="chat-header">
        <div className="chat-identity">
          <Link href="/" className="chat-avatar-heart" title="Return Home">♥</Link>
          <div className="chat-info">
            <h2>Your Confidant</h2>
            <p>
              {persona?.personaType ? `${persona.personaType} · ${persona.archetype}` : persona?.archetype || 'Warm, Empathic Companion'}
            </p>
          </div>
        </div>

        <div className="chat-header-actions">
          <div className="status-beacon" title="Your companion is actively listening and attuned">
            <span className="beacon-dot" />
            <span style={{ display: 'none' }} className="d-md-inline">Attuned</span>
            <span>Listening</span>
          </div>

          <ThemeToggle />

          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setConfirmRetake(true)}
            title="Reflect on your heart style again"
          >
            Reflect Again
          </button>
        </div>
      </header>

      {error && (
        <div className="glass-panel" style={{ padding: '12px 20px', borderColor: 'var(--rose-500)', color: 'var(--rose-400)', marginBottom: '12px', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* Main Conversation Thread */}
      <main className="chat-thread" aria-label="Conversation Messages">
        {messages.length === 0 && (
          <div className="glass-panel" style={{ padding: '40px 28px', textAlign: 'center', margin: 'auto 0', borderRadius: '24px' }}>
            <div className="brand-mark" style={{ fontSize: '2.5rem', marginBottom: '12px' }}>♥</div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>
              Welcome to your private sanctuary
            </h3>
            <p style={{ color: 'var(--text-sub)', maxWidth: '480px', margin: '0 auto 24px', fontSize: '0.98rem', lineHeight: '1.6' }}>
              Speak from your heart. Whether you are reflecting on a tender moment, a relationship doubt, 
              or how to reach out to someone special — you are completely safe here.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '440px', margin: '0 auto' }}>
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  className="btn btn-ghost"
                  style={{ textAlign: 'left', fontSize: '0.88rem', padding: '12px 18px', borderRadius: '16px' }}
                  onClick={() => submit(starter)}
                  disabled={sending}
                >
                  &ldquo;{starter}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg-wrapper ${m.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>
            <div className="msg-bubble">
              {m.role === 'assistant' ? (
                <div style={{ lineHeight: '1.65' }}>
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.content}</p>
              )}
            </div>

            {m.role === 'assistant' && m.ragUsed && (
              <div className="msg-assistant-meta">
                <button
                  className="reflection-chip"
                  type="button"
                  onClick={() => setRagFor(m)}
                >
                  ✨ Thoughtfully shaped for your heart
                </button>
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="msg-wrapper msg-assistant">
            <div className="typing-indicator">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span style={{ marginLeft: '6px' }}>Reflecting with care…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Ergonomic Input Dock */}
      <div className="chat-dock-wrap">
        <div className="chat-input-dock">
          <textarea
            ref={inputRef}
            className="chat-textarea"
            rows={1}
            placeholder="Share what is on your heart… (Shift + Enter for new line)"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={sending}
            aria-label="Your message"
          />

          <button
            className="chat-send-btn"
            onClick={() => submit()}
            disabled={sending || !input.trim()}
            title="Send Message"
            aria-label="Send Message"
          >
            <span>↑</span>
          </button>
        </div>
      </div>

      {/* Heart Insights Reflection Modal */}
      {ragFor && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setRagFor(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--rose-500)', fontSize: '1.2rem' }}>♥</span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Heart Insights</h3>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setRagFor(null)}>✕</button>
            </div>

            <p style={{ color: 'var(--text-sub)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '20px' }}>
              Your companion reflected on shared feelings and connection stories to offer advice grounded in genuine human tenderness:
            </p>

            {ragFor.rag && ragFor.rag.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {ragFor.rag.map((p, idx) => (
                  <div key={p.id || idx} className="glass-panel" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 600 }}>{p.personaType || 'Empathetic Connection'}</h4>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Resonant life reflection</p>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--rose-400)', fontWeight: 600 }}>
                      {Math.round((p.similarity ?? 0.85) * 100)}% harmony
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                Tuned intuitively directly to your words.
              </p>
            )}

            <button className="btn btn-primary" style={{ width: '100%', marginTop: '24px' }} onClick={() => setRagFor(null)}>
              Return to Conversation
            </button>
          </div>
        </div>
      )}

      {/* Retake Reflections Confirmation Modal */}
      {confirmRetake && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setConfirmRetake(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '12px' }}>
              Reflect on your heart style again?
            </h3>
            <p style={{ color: 'var(--text-sub)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '24px' }}>
              This will allow you to answer the reflections anew and attune your companion to any recent changes in how you feel.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmRetake(false)}>Keep Chatting</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  localStorage.removeItem('loveai_evaluation_id');
                  localStorage.removeItem('loveai_persona');
                  localStorage.removeItem('loveai_session_id');
                  router.push('/evaluate');
                }}
              >
                Begin New Reflections
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
