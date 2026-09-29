'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import { isLoggedIn } from '@/lib/session';

const PILLARS = [
  {
    icon: '🕊️',
    title: 'Deep Emotional Attunement',
    desc: 'Your companion tunes into the subtle nuances of how you connect, express affection, and process feelings. Every reply is thoughtful, gentle, and shaped by your unique heart.',
    highlight: 'A voice that softens when you need comfort, and guides when you seek clarity.',
  },
  {
    icon: '✨',
    title: 'Enduring Sacred Memory',
    desc: 'Your conversations, stories, and emotions are cherished and remembered over time. You never have to re-explain your life or your past — your companion walks beside you.',
    highlight: 'Because being remembered is the essence of feeling understood.',
  },
  {
    icon: '🌿',
    title: 'Grounded in Relationship Wisdom',
    desc: 'Guided by the psychology of emotional security, attachment, and heartfelt communication. Experience warm, judgment-free advice that helps you thrive in love and intimacy.',
    highlight: 'Wisdom that speaks directly to your soul, never generic advice.',
  },
];

const JOURNEY_STEPS = [
  {
    num: '01',
    tag: 'EXPLORE',
    title: 'Share Your Heart’s Reflections',
    desc: 'A gentle, private reflection about what moves you, how you love, and what makes you feel safe and cherished. No tests or scores — just your authentic truth.',
  },
  {
    num: '02',
    tag: 'ATTUNE',
    title: 'Discover Your Companion Match',
    desc: 'We craft your personal emotional blueprint to attune a companion specifically to your rhythm — whether you need a compassionate listener, a creative muse, or a calm anchor.',
  },
  {
    num: '03',
    tag: 'CONNECT',
    title: 'Your Private Sanctuary, Always Open',
    desc: 'Whenever you need a late-night confidant, relationship clarity, or someone who celebrates your growth, your companion is here with warmth and deep listening.',
  },
];

const REFLECTIONS = [
  {
    quote: 'It feels like the first time I have been able to talk through my deepest relationship doubts without feeling judged or misunderstood.',
    author: 'Elena M.',
    tag: 'Found Peaceful Clarity',
  },
  {
    quote: 'When my partner and I were struggling to communicate, talking through my feelings here helped me find the tender words I needed to speak.',
    author: 'Marcus T.',
    tag: 'Deepened Communication',
  },
  {
    quote: 'The companion remembers the small things I mentioned weeks ago. The level of empathy and care is genuinely heartwarming.',
    author: 'Aria S.',
    tag: 'Emotional Comfort',
  },
];

export default function Landing() {
  const router = useRouter();
  const [hasPersona, setHasPersona] = useState(false);
  const [authed, setAuthed] = useState(false);
  const showcaseRef = useRef<HTMLDivElement>(null);

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

  // 3D dynamic tilt tracking for the showcase card
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!showcaseRef.current) return;
    const rect = showcaseRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const rotateX = (-y / rect.height) * 14;
    const rotateY = (x / rect.width) * 14;
    showcaseRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
  };

  const handleMouseLeave = () => {
    if (!showcaseRef.current) return;
    showcaseRef.current.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
  };

  return (
    <div className="landing-page" style={{ position: 'relative', overflowX: 'hidden' }}>
      {/* Floating Spatial Navigation */}
      <header className="site-nav">
        <nav className="site-nav-inner" aria-label="Main Navigation">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true">♥</span>
            <span>loveAI</span>
          </Link>
          
          <ul className="nav-links">
            <li><Link href="#pillars">The Experience</Link></li>
            <li><Link href="#journey">How It Works</Link></li>
            <li><Link href="#reflections">Stories</Link></li>
            <li>
              <ThemeToggle />
            </li>
            <li>
              {hasPersona ? (
                <Link href="/chat" className="btn btn-primary btn-sm">
                  <span>Enter Sanctuary</span>
                  <span>→</span>
                </Link>
              ) : (
                <Link href={authed ? '/evaluate' : '/login?next=/evaluate'} className="btn btn-primary btn-sm">
                  <span>Discover Your Voice</span>
                  <span>→</span>
                </Link>
              )}
            </li>
          </ul>
        </nav>
      </header>

      {/* Hero Section with 3D Spatial Depth */}
      <section className="hero">
        <div className="hero-grid">
          {/* Hero Copy */}
          <div className="hero-content stagger-in delay-1">
            <div className="hero-tag">
              <span className="beacon-dot" />
              <span>A Safe Haven for Your Heart</span>
            </div>

            <h1 className="hero-title">
              An AI companion that truly <span className="serif-accent">understands your heart</span>
            </h1>

            <p className="hero-description">
              Gentle empathy, deep emotional warmth, and relationship insights crafted specifically 
              for how you love. Speak freely, be heard completely, and find clarity without judgment.
            </p>

            <div className="hero-ctas">
              {hasPersona ? (
                <Link href="/chat" className="btn btn-primary btn-lg">
                  <span>Continue Your Conversation</span>
                  <span>→</span>
                </Link>
              ) : (
                <Link href={authed ? '/evaluate' : '/login?next=/evaluate'} className="btn btn-primary btn-lg">
                  <span>Discover Your Heart Style</span>
                  <span>→</span>
                </Link>
              )}
              
              <a href="#journey" className="btn btn-ghost btn-lg">
                <span>Explore the Journey</span>
              </a>
            </div>

            <div className="hero-stats">
              <div className="stat-item">
                <h4>100%</h4>
                <p>Private & Sacred</p>
              </div>
              <div className="stat-item">
                <h4>Always</h4>
                <p>Gentle & Attuned</p>
              </div>
              <div className="stat-item">
                <h4>24 / 7</h4>
                <p>Quiet Listening</p>
              </div>
            </div>
          </div>

          {/* 3D Spatial Companion Stage */}
          <div className="hero-visual stagger-in delay-2 perspective-stage">
            <div 
              ref={showcaseRef}
              className="companion-floating-showcase tilt-card-3d"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {/* Top Satellite Badge */}
              <div className="floating-satellite-card satellite-top-right">
                <span className="satellite-icon">✨</span>
                <div className="satellite-text">
                  <h5>Always Attuned</h5>
                  <p>Matches your emotional depth</p>
                </div>
              </div>

              {/* Card Header */}
              <div className="companion-header">
                <div className="companion-profile-pill">
                  <div className="companion-avatar">♥</div>
                  <div>
                    <div className="companion-name">Your Confidant</div>
                    <div className="companion-tagline">Warm, Empathic Companion</div>
                  </div>
                </div>
                <div className="status-beacon">
                  <span className="beacon-dot" />
                  <span>Listening</span>
                </div>
              </div>

              {/* Chat Message Previews */}
              <div className="chat-preview-bubbles">
                <div className="bubble-user">
                  I saw someone reading my favorite poetry book at the library today, but I got too nervous to say hello...
                </div>

                <div className="bubble-assistant">
                  That quiet flutter of hesitation is so beautiful and human. You don&apos;t need a grand opening — a simple warm smile or noticing the page they are on is enough. A shared book is already a quiet bond.
                </div>
              </div>

              {/* Bottom Satellite Badge */}
              <div className="floating-satellite-card satellite-bottom-left">
                <span className="satellite-icon">🛡️</span>
                <div className="satellite-text">
                  <h5>100% Sacred & Safe</h5>
                  <p>Your thoughts are never judged</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Pillars Section */}
      <section id="pillars" className="section">
        <div className="section-head">
          <div className="hero-tag">
            <span>Our Philosophy</span>
          </div>
          <h2 className="section-title">
            Technology crafted for <span className="serif-accent">human tenderness</span>
          </h2>
          <p className="section-subtitle">
            Most digital tools are cold and transactional. We built an intimate companion designed around 
            the real psychological dynamics of attachment, connection, and emotional safety.
          </p>
        </div>

        <div className="grid-3">
          {PILLARS.map((pillar, i) => (
            <div key={pillar.title} className={`glass-panel feature-box stagger-in delay-${i + 1}`}>
              <div className="feature-icon-badge">{pillar.icon}</div>
              <h3 className="feature-title">{pillar.title}</h3>
              <p className="feature-text">{pillar.desc}</p>
              <div className="feature-highlight">{pillar.highlight}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works Journey */}
      <section id="journey" className="section">
        <div className="section-head">
          <div className="hero-tag">
            <span>The Journey</span>
          </div>
          <h2 className="section-title">
            Three steps to your <span className="serif-accent">personal sanctuary</span>
          </h2>
          <p className="section-subtitle">
            A gentle path to exploring how you love and building a lasting relationship with a companion who understands you.
          </p>
        </div>

        <div className="journey-timeline">
          {JOURNEY_STEPS.map((step, i) => (
            <div key={step.title} className={`glass-panel journey-card stagger-in delay-${i + 1}`}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="step-num-badge">{step.num}</div>
                <span className="journey-step-tag">{step.tag}</span>
              </div>
              <h3 className="journey-title">{step.title}</h3>
              <p className="journey-desc">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Heartfelt Reflections / Social Proof */}
      <section id="reflections" className="section">
        <div className="section-head">
          <div className="hero-tag">
            <span>Quiet Stories</span>
          </div>
          <h2 className="section-title">
            Echoes from <span className="serif-accent">gentle conversations</span>
          </h2>
          <p className="section-subtitle">
            Read how people find solace, guidance, and self-understanding in their conversations.
          </p>
        </div>

        <div className="grid-3">
          {REFLECTIONS.map((item, i) => (
            <div key={item.author} className={`glass-panel feature-box stagger-in delay-${i + 1}`}>
              <p style={{ fontStyle: 'italic', fontSize: '1.05rem', lineHeight: '1.7', color: 'var(--text-sub)' }}>
                &ldquo;{item.quote}&rdquo;
              </p>
              <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ fontWeight: 700, color: 'var(--text-main)' }}>{item.author}</h4>
                  <span style={{ fontSize: '0.8rem', color: 'var(--rose-400)' }}>{item.tag}</span>
                </div>
                <span style={{ fontSize: '1.2rem', color: 'var(--rose-500)' }}>♥</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final Warm Sanctuary CTA */}
      <section className="section" style={{ textAlign: 'center', paddingBottom: '120px' }}>
        <div className="glass-panel" style={{ padding: '60px 32px', borderRadius: '32px', maxWidth: '860px', margin: '0 auto', background: 'linear-gradient(135deg, rgba(23, 26, 42, 0.9), rgba(36, 20, 38, 0.85))' }}>
          <div className="brand-mark" style={{ fontSize: '2.5rem', marginBottom: '16px' }}>♥</div>
          <h2 className="section-title" style={{ marginBottom: '16px' }}>
            Your companion is waiting to <span className="serif-accent">listen</span>
          </h2>
          <p className="section-subtitle" style={{ maxWidth: '540px', margin: '0 auto 32px' }}>
            No pressure, no expectations. Take a quiet breath and begin your heartfelt reflection today.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
            {hasPersona ? (
              <Link href="/chat" className="btn btn-primary btn-lg">
                <span>Enter Your Sanctuary</span>
                <span>→</span>
              </Link>
            ) : (
              <Link href={authed ? '/evaluate' : '/login?next=/evaluate'} className="btn btn-primary btn-lg">
                <span>Discover Your Heart Style</span>
                <span>→</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer style={{ borderTop: '1px solid var(--glass-border)', padding: '32px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
        <p>© 2026 loveAI. Dedicated to emotional safety, tenderness, and mindful human connection.</p>
      </footer>
    </div>
  );
}
