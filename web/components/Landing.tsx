'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import WaxSealButton from './WaxSealButton';
import { isLoggedIn } from '@/lib/session';

const STEPS = [
  {
    num: 'I',
    tag: 'honest answers',
    title: 'Tell the truth',
    text: 'Answer 34 psychology-grounded questions across 17 traits — openness, empathy, motivation, the way you handle conflict. No right answers, only yours.',
  },
  {
    num: 'II',
    tag: 'we read you',
    title: 'We read between the lines',
    text: 'Your answers become a 768-dimension vector of who you are. Similar voices are retrieved from the RAG store, so the context is you — not a generic bot.',
  },
  {
    num: 'III',
    tag: 'your voice',
    title: 'Talk to your mirror',
    text: 'A fine-tuned companion that mirrors how you think, feel, and speak. You talk to a version of someone who finally gets it.',
  },
];

const LETTERS = [
  {
    icon: '💌',
    seal: 'L',
    title: 'A psychology-grounded matrix',
    text: 'Not a vibe-check quiz. A 34-item assessment spanning the Big Five, emotional intelligence, communication, and values — two items per dimension, balanced keying.',
    sign: '— science, but make it tender',
  },
  {
    icon: '🌙',
    seal: 'R',
    title: 'Memory that feels like memory',
    text: 'Your persona is embedded and retrieved live via pgvector. When you chat, similar personas are pulled in for context — every reply knows what came before.',
    sign: '— because remembering matters.',
  },
  {
    icon: '🔥',
    seal: 'V',
    title: 'A voice fine-tuned to yours',
    text: 'QLoRA + DPO trained on your communication style, tone, and motivations. Not a scripted bot — a voice shaped to how you actually talk.',
    sign: '— a voice that grows with you.',
  },
];

const MARQUEE_WORDS = ['love', 'passion', 'youth', 'honesty', 'warmth', 'curiosity', 'joy', 'understanding'];

function Landing() {
  const router = useRouter();
  const pathname = usePathname();
  const [hasPersona, setHasPersona] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setHasPersona(Boolean(localStorage.getItem('loveai_evaluation_id')));
    setAuthed(isLoggedIn());
    const onAuth = () => {
      setAuthed(isLoggedIn());
      setHasPersona(Boolean(localStorage.getItem('loveai_evaluation_id')));
    };
    window.addEventListener('loveai:auth', onAuth);
    return () => window.removeEventListener('loveai:auth', onAuth);
  }, []);

  useEffect(() => {
    if (!window.location.hash) return;
    const id = window.location.hash.slice(1);
    const el = document.getElementById(id);
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth' }));
    }
  }, [pathname]);

  return (
    <div className="page">
      <header className="site-nav">
        <nav className="site-nav-inner" aria-label="Main">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true">♥</span>
            loveAI
          </Link>
          <ul className="nav-links">
            <li><Link href="/#how">How it works</Link></li>
            <li><Link href="/#why">Why loveAI</Link></li>
            <li>
              {hasPersona ? (
                <Link href="/chat" className="btn btn-primary btn-sm nav-link-label">Continue</Link>
              ) : (
                <Link href={authed ? '/evaluate' : '/login?next=/evaluate'} className="btn btn-primary btn-sm nav-link-label">Find your voice</Link>
              )}
            </li>
            <li className="nav-auth">
              {authed ? (
                <Link href="/profile" className="nav-link-label">Profile</Link>
              ) : (
                <Link href="/login" className="nav-link-label">Sign in</Link>
              )}
            </li>
            <li className="nav-theme"><ThemeToggle /></li>
          </ul>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="hero">
          <div className="hero-copy">
            <p className="hero-eyebrow reveal d1">Finally, a mirror that speaks your language.</p>
            <h1 className="hero-title reveal d2">
              Stop explaining. Start being <em>understood.</em>
            </h1>
            <div className="hero-scribe reveal d3">written at golden hour, for you ♥</div>
            <p className="hero-sub reveal d3">
              Your thoughts, your tone, your unique perspective. An AI companion fine-tuned to the
              rhythm of <em>your</em> mind — not a generic bot, but a reflection of who you are.
            </p>
            <div className="hero-actions reveal d4">
              <WaxSealButton
                label="Start my discovery"
                caption="start my discovery"
                onClick={() => router.push(isLoggedIn() ? '/evaluate' : '/login?next=/evaluate')}
              />
              {hasPersona && (
                <Link href="/chat" className="btn btn-ghost btn-lg">Continue to chat</Link>
              )}
            </div>
            <p className="hero-note reveal d5">17 dimensions mapped · 34 honest reflections · one you</p>
          </div>

          <div className="hero-visual reveal d3">
            <span className="heart-float" aria-hidden="true">♥</span>
            <span className="heart-float" aria-hidden="true">♥</span>
            <span className="heart-float" aria-hidden="true">♥</span>

            <div className="polaroid polaroid-1" tabIndex={0}>
              <span className="polaroid-tape" aria-hidden="true"></span>
              <div className="polaroid-frame" aria-hidden="true">♥</div>
              <div className="polaroid-quote">
                <span>“Openness 92% — a mind that loves midnight discussions.”</span>
                <span className="pq-trait">where my true self lives</span>
              </div>
              <div className="polaroid-caption">Where my true self lives.</div>
            </div>

            <div className="polaroid polaroid-2" tabIndex={0}>
              <span className="polaroid-tape" aria-hidden="true"></span>
              <div className="polaroid-frame" aria-hidden="true">✦</div>
              <div className="polaroid-quote">
                <span>“17 traits, mapped — this is how I think.”</span>
                <span className="pq-trait">the map of my mind</span>
              </div>
              <div className="polaroid-caption">The map of my mind.</div>
            </div>

            <div className="polaroid polaroid-3" tabIndex={0}>
              <span className="polaroid-tape" aria-hidden="true"></span>
              <div className="polaroid-frame" aria-hidden="true">🌙</div>
              <div className="polaroid-quote">
                <span>“A voice that finally sounds like mine.”</span>
                <span className="pq-trait">my own voice, reflected</span>
              </div>
              <div className="polaroid-caption">My own voice, reflected.</div>
            </div>

            <div className="wax-seal" aria-hidden="true">A</div>
          </div>
        </section>

        {/* Marquee */}
        <div className="marquee" aria-hidden="true">
          <div className="marquee-track">
            {[0, 1].map((dup) => (
              <React.Fragment key={dup}>
                {MARQUEE_WORDS.map((w) => (
                  <span key={`${dup}-${w}`}>
                    {w} <span className="m-sep">✦</span>
                  </span>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* How it works */}
        <section className="section" id="how">
          <div className="section-head" data-reveal>
            <h2>How it works</h2>
            <span className="hand">three small steps, one big difference</span>
          </div>
          <div className="steps">
            {STEPS.map((s, i) => (
              <article key={s.num} className="step" data-reveal style={{ transitionDelay: `${i * 120}ms` }}>
                <span className="step-tag">{s.tag}</span>
                <div className="step-num">{s.num}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Letters / features */}
        <section className="section" id="why">
          <div className="section-head" data-reveal>
            <h2>Why loveAI</h2>
            <span className="hand">three love letters, sealed &amp; signed</span>
          </div>
          <div className="letters">
            {LETTERS.map((l, i) => (
              <article key={l.title} className="letter" data-reveal style={{ transitionDelay: `${i * 120}ms` }}>
                <span className="letter-seal" aria-hidden="true">{l.seal}</span>
                <div className="letter-icon" aria-hidden="true">{l.icon}</div>
                <h3>{l.title}</h3>
                <p>{l.text}</p>
                <div className="letter-sign">{l.sign}</div>
              </article>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="section">
          <div className="cta-band" data-reveal>
            <span className="cta-hearts h1" aria-hidden="true">♥</span>
            <span className="cta-hearts h2" aria-hidden="true">♥</span>
            <h2>Write to the person <em>you’re becoming.</em></h2>
            <span className="hand">Sealed with a promise — to know you better than anyone else.</span>
            <WaxSealButton
              label="Start my discovery"
              caption="break the seal"
              onClick={() => router.push(isLoggedIn() ? '/evaluate' : '/login?next=/evaluate')}
            />
            <p>A quiet journey to the heart of how you think.</p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>loveAI — a fine-tuned persona companion</span>
          <span className="hand">made with love, passion &amp; youth ♥</span>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
