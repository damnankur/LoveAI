'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  'How do you handle conflict?',
  'What have you noticed about my communication style?',
  'What should we talk about first?',
];

interface LocalPersona {
  archetype: string;
  personaText: string;
  profile: Record<string, number>;
}

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ragUsed?: boolean;
  rag?: { id: string; similarity: number }[];
}

function toUi(m: ChatMessageRecord): UiMessage {
  return { id: m.id, role: m.role as 'user' | 'assistant', content: m.content };
}

function Chat() {
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
        /* ignore malformed persona */
      }
    }
    const evaluationId = localStorage.getItem('loveai_evaluation_id');
    if (!evaluationId) {
      router.push('/evaluate');
      return;
    }
    (async () => {
      try {
        let sid = sessionId;
        if (!sid) {
          const s = await createSession(evaluationId);
          sid = s.sessionId;
          localStorage.setItem('loveai_session_id', sid);
          if (!cancelled) setSessionId(sid);
        }
        const msgs = await fetchMessages(sid);
        if (!cancelled) setMessages(msgs.map(toUi));
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.error || e?.message || 'Failed to load session');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function submit(prompt?: string) {
    const text = (prompt ?? input).trim();
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
      setError(e?.response?.data?.error || e?.message || 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  function startWith(prompt: string) {
    if (inputRef.current) inputRef.current.focus();
    submit(prompt);
  }

  return (
    <div className="chat-app">
      <header className="chat-header">
        <div className="chat-identity">
          <div className="chat-avatar" aria-hidden="true">♥</div>
          <div>
            <h1>Your companion</h1>
            <div className="hand">{persona?.archetype || 'someone who knows you'}</div>
          </div>
        </div>
        <div className="chat-actions">
          <span className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            <span className="status-pill-text">Qwen2.5-1.5B · QLoRA</span>
          </span>
          <span className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            <span className="status-pill-text">pgvector RAG</span>
          </span>
          <ThemeToggle />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setConfirmRetake(true)}
          >
            Retake test
          </button>
        </div>
      </header>

      {error && <div className="error-banner" style={{ margin: '12px 24px 0' }}>{error}</div>}

      <main className="chat-messages" aria-live="polite">
        {messages.length === 0 && !sending && (
          <div className="msg msg-assistant">
            <div className="msg-meta">loveAI · knowing you a little more each day</div>
            <div className="msg-md">
              <p>
                Hey — I'm your companion. I'll talk the way you talk. What's on your mind?
              </p>
            </div>
            <div className="starter-pills">
              {STARTERS.map((s) => (
                <button key={s} type="button" className="starter-pill" onClick={() => startWith(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'msg-user' : 'msg-assistant'}`}>
            {m.role === 'assistant' && <div className="msg-meta">loveAI</div>}
            {m.role === 'assistant' ? (
              <div className="msg-md">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            ) : (
              m.content
            )}
            {m.ragUsed && m.role === 'assistant' && (
              <button
                className="rag-note"
                type="button"
                onClick={() => setRagFor(m)}
                aria-haspopup="dialog"
              >
                · remembered {m.rag?.length ?? 0} similar personas — why?
              </button>
            )}
          </div>
        ))}
        {sending && (
          <div className="msg msg-assistant typing">
            <span className="spinner" /> thinking about you…
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="input chat-textarea"
          rows={1}
          placeholder="Type a message… (Shift + Enter for a new line)"
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
          aria-label="Message"
        />
        <button
          className="btn btn-primary"
          onClick={() => submit()}
          disabled={sending || !input.trim()}
        >
          Send
        </button>
      </div>

      {ragFor && ragFor.rag && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Retrieved context">
          <div className="modal">
            <h3>What I remembered</h3>
            <span className="hand">the voices that shaped this reply</span>
            <p>
              Your message was matched against the persona store; the closest voices shaped how I
              answered.
            </p>
            {ragFor.rag.length === 0 ? (
              <p>No similar personas matched this time.</p>
            ) : (
              ragFor.rag.map((p) => (
                <div key={p.id} className="rag-row">
                  <span className="rag-sim">{Math.round(p.similarity * 100)}%</span>
                  <span>persona {p.id}</span>
                </div>
              ))
            )}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setRagFor(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRetake && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Retake test">
          <div className="modal">
            <h3>Retake the test?</h3>
            <span className="hand">this starts a fresh chapter</span>
            <p>
              Retaking starts a new evaluation and replaces this persona. Your chat history stays
              saved — a new persona will pick up from here.
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmRetake(false)}>
                Keep chatting
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  localStorage.removeItem('loveai_session_id');
                  router.push('/evaluate');
                }}
              >
                Start over
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Chat;
