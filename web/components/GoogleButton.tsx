'use client';

import { useState } from 'react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (resp: { credential?: string }) => void;
            auto_select?: boolean;
            prompt?: string;
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

interface GoogleButtonProps {
  mode: 'signin' | 'signup';
  label: string;
  onSuccess: (token: string, mode: 'signin' | 'signup') => void;
  onError: (message: string) => void;
}

export default function GoogleButton({ mode, label, onSuccess, onError }: GoogleButtonProps) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const [busy, setBusy] = useState(false);

  async function handle() {
    if (!clientId) {
      onError(
        "I'm having trouble connecting to Google right now. Please try again in a few moments."
      );
      return;
    }
    setBusy(true);
    try {
      await loadGis();
      window.google!.accounts.id.initialize({
        client_id: clientId,
        auto_select: mode === 'signin',
        prompt: 'select_account',
        callback: (resp) => {
          if (resp.credential) {
            onSuccess(resp.credential, mode);
          } else {
            onError('Google did not return a credential — try again.');
            setBusy(false);
          }
        },
      });
      window.google!.accounts.id.prompt();
    } catch (e: any) {
      onError(e?.message || 'Google sign-in is unavailable right now.');
      setBusy(false);
    }
  }

  return (
    <button type="button" className="google-btn" onClick={handle} disabled={busy}>
      <GoogleIcon />
      {busy ? <span className="spinner" /> : label}
    </button>
  );
}
