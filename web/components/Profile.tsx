'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, MatrixQuestion, ScaleOption, fetchMatrix, fetchProfile, logout } from '@/lib/api';
import { clearSession, isLoggedIn } from '@/lib/session';

function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [questions, setQuestions] = useState<MatrixQuestion[]>([]);
  const [scale, setScale] = useState<ScaleOption[]>([]);
  const [hasEval, setHasEval] = useState(false);
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
          setCompletedAt(p.evaluation.completedAt);
        }
      })
      .catch((e) => {
        if (e?.response?.status === 401) {
          clearSession();
          router.replace('/login');
        } else {
          setError(e?.message || 'Failed to load your profile');
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
      /* ignore — clear locally either way */
    }
    clearSession();
    router.push('/');
  }

  const answeredCount = Object.keys(responses).length;
  const initial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="auth-page">
      <div className="profile-wrap reveal">
        <div className="profile-hero">
          <div className="profile-avatar">{initial}</div>
          <div className="profile-hero-text">
            <h1>{user?.displayName || user?.email || 'Your profile'}</h1>
            <div className="hand">{user?.email}</div>
            <div className="badge-soft">
              {hasEval ? 'persona complete' : 'no persona yet'}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? <span className="spinner" /> : 'Log out'}
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="profile-loading"><span className="spinner" /></div>
        ) : !hasEval ? (
          <div className="profile-empty">
            <div className="hand">nothing here yet</div>
            <h2>You haven&apos;t completed your persona yet</h2>
            <p>Your answers will appear here once you finish the evaluation.</p>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => router.push('/evaluate')}>
              Take the evaluation
            </button>
          </div>
        ) : (
          <div className="profile-body">
            <div className="profile-meta hand">
              {answeredCount} of {questions.length} answers · saved {completedAt ? new Date(completedAt).toLocaleString() : ''}
            </div>
            {Array.from(grouped.entries()).map(([category, list]) => (
              <section key={category} className="cat-block">
                <h2 className="cat-title">{category}</h2>
                <hr className="cat-rule" />
                {list.map((q) => {
                  const value = responses[q.id];
                  const opt = scale.find((s) => s.value === value);
                  return (
                    <div key={q.id} className="profile-answer">
                      <div className="q-category">{q.trait.replace(/_/g, ' ')}</div>
                      <div className="q-text">{q.text}</div>
                      <div className="profile-answer-value">
                        <span className="scale-num">{value ?? '—'}</span>
                        <span>{opt ? opt.label : 'Not answered'}</span>
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;
