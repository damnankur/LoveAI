'use client';

import { useState } from 'react';
import { updateDisplayName } from '@/lib/api';
import { getToken, setSession } from '@/lib/session';

export default function InvitationCard({ onComplete }: { onComplete: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('That name seems incomplete…');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const user = await updateDisplayName(trimmed);
      setSession(getToken()!, user);
      window.localStorage.setItem('loveai_welcome', '1');
      onComplete();
    } catch (e2: any) {
      setError(
        e2?.response?.data?.error || 'I could not write that down just yet. Try once more.'
      );
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card reveal">
        <span className="auth-seal" aria-hidden="true">
          ♥
        </span>
        <span className="stamp">the invitation</span>
        <h1>One line left to write</h1>
        <div className="hand">your mirror is ready — sign it in your own hand</div>

        <form className="invite-form" onSubmit={handleSubmit} noValidate>
          <p className="invite-sentence">
            My name is{' '}
            <input
              className="inline-input"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              placeholder="your name"
              autoFocus
              aria-label="Your name"
            />{' '}
            and I am ready to be understood.
          </p>

          {error && (
            <div className="error-banner" role="status" aria-live="polite">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner" /> : 'seal the invitation'}
          </button>
        </form>
      </div>
    </div>
  );
}
