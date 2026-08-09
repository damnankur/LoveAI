'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { googleLogin } from '@/lib/api';
import { isLoggedIn, setSession } from '@/lib/session';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (resp: { credential?: string }) => void;
          }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

function Login() {
  const router = useRouter();
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const [idToken, setIdToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isLoggedIn()) router.replace('/profile');
  }, [router]);

  async function completeLogin(token: string) {
    setBusy(true);
    setError('');
    try {
      const { token: session, user } = await googleLogin(token);
      setSession(session, user);
      router.push('/profile');
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Sign in failed');
      setBusy(false);
    }
  }

  async function handleGoogleClick() {
    if (!googleClientId) {
      setShowToken(true);
      setError('No Google client ID configured yet — paste your ID token below to sign in.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await loadGis();
      window.google!.accounts.id.initialize({
        client_id: googleClientId,
        callback: (resp) => {
          if (resp.credential) {
            completeLogin(resp.credential);
          } else {
            setError('Google did not return a credential — try pasting your ID token below.');
            setShowToken(true);
            setBusy(false);
          }
        },
      });
      window.google!.accounts.id.prompt();
    } catch (e: any) {
      setError(e?.message || 'Google sign-in unavailable — paste your ID token below.');
      setShowToken(true);
      setBusy(false);
    }
  }

  function handleTokenSubmit() {
    const tok = idToken.trim();
    if (!tok) {
      setError('Paste your Google ID token first.');
      return;
    }
    completeLogin(tok);
  }

  return (
    <div className="auth-page">
      <div className="auth-card reveal">
        <span className="stamp">welcome back</span>
        <h1>Sign in</h1>
        <div className="hand">your mirror remembers you</div>

        {error && <div className="error-banner">{error}</div>}

        <button type="button" className="google-btn" onClick={handleGoogleClick} disabled={busy}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          {busy ? <span className="spinner" /> : 'Sign in with Google'}
        </button>

        <div className="auth-divider"><span>or</span></div>

        <div className={`token-paste ${showToken ? 'is-open' : ''}`}>
          <button
            type="button"
            className="token-toggle"
            onClick={() => setShowToken((v) => !v)}
            aria-expanded={showToken}
          >
            Have an ID token? Paste it
          </button>
          {showToken && (
            <div className="token-fields">
              <label htmlFor="id-token">Google ID token</label>
              <textarea
                id="id-token"
                value={idToken}
                onChange={(e) => setIdToken(e.target.value)}
                placeholder="eyJhbGciOiJSUzI1NiIs…"
                rows={4}
                className="input"
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleTokenSubmit}
                disabled={busy || !idToken.trim()}
              >
                {busy ? <span className="spinner" /> : 'Sign in'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;
