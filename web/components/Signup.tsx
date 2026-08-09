'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import GoogleButton from './GoogleButton';
import InvitationCard from './InvitationCard';
import { googleLogin } from '@/lib/api';
import { isLoggedIn, setSession } from '@/lib/session';

function Signup() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [next, setNext] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const n = params.get('next');
    if (n) setNext(n);
    if (isLoggedIn() && !inviting) router.replace('/profile');
  }, [router, inviting]);

  function goTo() {
    router.push(next.startsWith('/') ? next : '/profile');
  }

  async function onSuccess(token: string) {
    try {
      const { token: session, user, created } = await googleLogin(token);
      setSession(session, user);
      if (created) {
        setInviting(true);
        return;
      }
      goTo();
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Sign up failed');
    }
  }

  if (inviting) {
    return <InvitationCard onComplete={goTo} />;
  }

  const switchHref = '/login' + (next ? `?next=${encodeURIComponent(next)}` : '');

  return (
    <div className="auth-page">
      <div className="auth-card reveal">
        <span className="auth-seal" aria-hidden="true">
          ♥
        </span>
        <span className="stamp">the invitation</span>
        <h1>Create your account</h1>
        <div className="hand">one quiet step, then we begin</div>

        {error && (
          <div className="error-banner" role="status" aria-live="polite">
            {error}
          </div>
        )}

        <GoogleButton mode="signup" label="Create account with Google" onSuccess={onSuccess} onError={setError} />

        <div className="auth-divider" role="presentation">
          <span>or</span>
        </div>

        <p className="auth-switch">
          Already have an account? <Link href={switchHref}>Sign in</Link>
        </p>

        <p className="auth-terms">
          By joining, you agree to loveAI&apos;s terms, privacy notice, and cookie policy.
        </p>
      </div>
    </div>
  );
}

export default Signup;
