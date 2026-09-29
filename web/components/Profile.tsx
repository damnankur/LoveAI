'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthUser, MatrixQuestion, ScaleOption, fetchMatrix, fetchProfile, logout } from '@/lib/api';
import { clearSession, isLoggedIn } from '@/lib/session';
import ThemeToggle from './ThemeToggle';

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [questions, setQuestions] = useState<MatrixQuestion[]>([]);
  const [scale, setScale] = useState<ScaleOption[]>([]);
  const [hasEval, setHasEval] = useState(false);
  const [personaType, setPersonaType] = useState<string | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login');
      return;
    }
    Promise.all([fetchProfile(), fetchMatrix()])
      .then(([p, m]) => {
        setUser(p.user);
        setQuestions(m.questions);
        setScale(m.scale);
        if (p.evaluation) {
          setResponses(p.evaluation.responses);
          setHasEval(true);
          setPersonaType(p.evaluation.personaType);
          setCompletedAt(p.evaluation.completedAt);
        }
      })
      .catch((e) => {
        if (e?.response?.status === 401) {
          clearSession();
          router.replace('/login');
        } else {
          setError(e?.message || 'Failed to load your sanctuary profile');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const grouped = useMemo(() => {
    const map = new Map<string, MatrixQuestion[]>();
    for (const q of questions) {
      const list = map.get(q.category) || [];
      list.push(q);
      map.set(q.category, list);
    }
    return map;
  }, [questions]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      /* ignore */
    }
    clearSession();
    router.push('/');
  }

  const initial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="profile-container">
      {/* Top Navbar */}
      <header className="site-nav" style={{ position: 'relative', padding: '0 0 32px' }}>
        <nav className="site-nav-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">♥</span>
            <span>loveAI</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ThemeToggle />
            <Link href="/chat" className="btn btn-primary btn-sm">Enter Sanctuary →</Link>
          </div>
        </nav>
      </header>

      {/* Profile Hero Card */}
      <div className="glass-panel profile-hero-card stagger-in">
        <div className="profile-user-info">
          <div className="profile-avatar-large">{initial}</div>
          <div>
            <h1 className="profile-name">{user?.displayName || user?.email || 'Your Sanctuary'}</h1>
            <p className="profile-email">{user?.email}</p>
            <div className="profile-aura-tag">
              ✨ {hasEval ? (personaType ? `${personaType} Connection` : 'Attuned Companion') : 'Reflections Awaiting'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {hasEval && (
            <Link href="/chat" className="btn btn-primary">
              <span>Open Chat</span>
              <span>→</span>
            </Link>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? <span>Leaving…</span> : <span>Sign Out</span>}
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-panel" style={{ padding: '16px 20px', borderColor: 'var(--rose-500)', color: 'var(--rose-400)', marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <div className="beacon-dot" style={{ margin: '0 auto 16px', width: '12px', height: '12px' }} />
          <p>Opening your private sanctuary…</p>
        </div>
      ) : !hasEval ? (
        <div className="glass-panel" style={{ padding: '60px 32px', textAlign: 'center', borderRadius: '28px' }}>
          <div className="brand-mark" style={{ fontSize: '2.5rem', marginBottom: '16px' }}>♥</div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '12px' }}>
            Your Heart Style is Awaiting Discovery
          </h2>
          <p style={{ color: 'var(--text-sub)', maxWidth: '480px', margin: '0 auto 28px', lineHeight: '1.6' }}>
            Take our gentle 5-minute reflection to attune your companion to how you love, communicate, and connect.
          </p>
          <button type="button" className="btn btn-primary btn-lg" onClick={() => router.push('/evaluate')}>
            <span>Discover Your Heart Style</span>
            <span>→</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
          <div className="glass-panel" style={{ width: '100%', padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Your Emotional Reflections</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {Object.keys(responses).length} reflections saved · Attuned {completedAt ? new Date(completedAt).toLocaleDateString() : 'recently'}
              </p>
            </div>
            <Link href="/evaluate" className="btn btn-ghost btn-sm">
              Reflect Again
            </Link>
          </div>

          {Array.from(grouped.entries()).map(([category, list]) => (
            <div key={category} className="glass-panel" style={{ width: '100%', padding: '28px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '20px', color: 'var(--rose-400)' }}>
                {category === 'Big Five' ? 'Core Emotional Essence' : category === 'Emotional Intelligence' ? 'Heart & Empathy' : category === 'Communication' ? 'Communication & Intimacy' : category === 'Values & Motivation' ? 'Values & Longing' : category}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {list.map((q) => {
                  const value = responses[q.id];
                  const opt = scale.find((s) => s.value === value);
                  return (
                    <div key={q.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '14px', border: '1px solid var(--glass-border)' }}>
                      <div style={{ maxWidth: '75%' }}>
                        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--violet-400)', fontWeight: 700 }}>
                          {q.trait.replace(/_/g, ' ')}
                        </span>
                        <p style={{ fontSize: '0.92rem', color: 'var(--text-main)', marginTop: '2px' }}>
                          {q.text}
                        </p>
                      </div>
                      <span className="status-beacon" style={{ fontSize: '0.8rem' }}>
                        {opt ? opt.label : 'Shared'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
