'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  EvaluateResult,
  MatrixQuestion,
  ScaleOption,
  fetchMatrix,
  submitEvaluation,
} from '@/lib/api';
import { clearSession, isLoggedIn } from '@/lib/session';
import ThemeToggle from './ThemeToggle';

// Human-first, emotionally resonant trait labels (zero cold psychology jargon)
const TRAIT_LABELS: Record<string, string> = {
  openness: 'Curiosity & Wonder',
  conscientiousness: 'Dedication & Care',
  extraversion: 'Warm Expression',
  agreeableness: 'Empathy & Harmony',
  neuroticism: 'Emotional Sensitivity',
  self_awareness: 'Self-Understanding',
  self_regulation: 'Emotional Composure',
  empathy: 'Deep Empathy',
  social_skills: 'Interpersonal Grace',
  assertiveness: 'Loving Honesty',
  active_listening: 'Soulful Listening',
  verbal_preference: 'Expressive Communication',
  conflict_style: 'Peaceful Resolution',
  intrinsic_motivation: 'Inner Fulfillment',
  extrinsic_motivation: 'Shared Growth',
  core_values: 'Guiding Heart Values',
  life_goals: 'Aspirations in Love',
};

const STEP_ORDER = [
  { key: 'Big Five', title: 'Core Emotional Essence', hint: 'How you experience wonder, calm, and connection' },
  { key: 'Emotional Intelligence', title: 'Heart & Empathy', hint: 'How you feel, listen, and understand emotions' },
  { key: 'Communication', title: 'Communication & Intimacy', hint: 'How your voice moves through closeness and vulnerability' },
  { key: 'Values & Motivation', title: 'Values & Longing', hint: 'What anchors your heart and inspires your bond' },
];

function EmotionalRadarChart({ scores, size = 320 }: { scores: { label: string; value: number }[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.36;
  const n = scores.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, scale: number): [number, number] => [
    cx + Math.cos(angle(i)) * r * scale,
    cy + Math.sin(angle(i)) * r * scale,
  ];

  const grid = [0.25, 0.5, 0.75, 1].map((l) =>
    scores.map((_, i) => pt(i, l).join(',')).join(' ')
  );
  const poly = scores.map((s, i) => pt(i, Math.max(0.08, s.value)).join(',')).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: '340px', overflow: 'visible' }} role="img" aria-label="Emotional spectrum chart">
      <defs>
        <radialGradient id="radarAura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.08" />
        </radialGradient>
      </defs>
      {grid.map((points, i) => (
        <polygon key={i} points={points} fill="none" stroke="rgba(255, 255, 255, 0.12)" strokeWidth="1" strokeDasharray={i < 3 ? '2 2' : 'none'} />
      ))}
      {scores.map((_, i) => {
        const [x1, y1] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x1} y2={y1} stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />;
      })}
      <polygon points={poly} fill="url(#radarAura)" stroke="#f43f5e" strokeWidth="2.5" />
      {scores.map((s, i) => {
        const [x, y] = pt(i, 1.25);
        return (
          <text 
            key={s.label} 
            x={x} 
            y={y} 
            textAnchor="middle" 
            dominantBaseline="middle" 
            fill="var(--text-sub)" 
            fontSize="11" 
            fontWeight="600"
          >
            {s.label}
          </text>
        );
      })}
    </svg>
  );
}

function SmoothReflectionSlider({
  value,
  min,
  max,
  options,
  onChange,
}: {
  value?: number;
  min: number;
  max: number;
  options: ScaleOption[];
  onChange: (v: number) => void;
}) {
  const current = value ?? min;
  const opt = options.find((o) => o.value === current);
  
  // Convert generic numerical labels to human warm expressions
  const getHumanLabel = (val: number) => {
    switch (val) {
      case 1: return 'Not like me';
      case 2: return 'Rarely like me';
      case 3: return 'Sometimes true';
      case 4: return 'Often true';
      case 5: return 'Deeply like me';
      default: return opt?.label ?? `Choice ${val}`;
    }
  };

  return (
    <div className="slider-scale-container">
      <div className="slider-track-wrap">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={current}
          onChange={(e) => onChange(Number(e.target.value))}
          className="reflection-range-input"
          aria-label="Reflection rating"
        />
      </div>
      <div className="scale-labels-row">
        <span>Not like me</span>
        <span>Neutral</span>
        <span>Deeply like me</span>
      </div>
      {value !== undefined && (
        <div className="scale-current-badge">
          ✨ {getHumanLabel(current)}
        </div>
      )}
    </div>
  );
}

export default function PersonaEvaluation() {
  const router = useRouter();
  const [questions, setQuestions] = useState<MatrixQuestion[]>([]);
  const [scale, setScale] = useState<ScaleOption[]>([]);
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EvaluateResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMatrix()
      .then((data) => {
        setQuestions(data.questions);
        setScale(data.scale);
        const saved = localStorage.getItem('loveai_eval_draft');
        if (saved) {
          try {
            setResponses(JSON.parse(saved));
          } catch {
            /* ignore */
          }
        }
      })
      .catch((e) => setError(e?.message || 'Unable to open reflections at this moment.'))
      .finally(() => setLoading(false));
  }, []);

  const steps = useMemo(() => {
    return STEP_ORDER.map((s) => ({
      ...s,
      questions: questions.filter((q) => q.category === s.key),
    })).filter((s) => s.questions.length > 0);
  }, [questions]);

  const current = steps[step];
  const answered = Object.keys(responses).length;
  const progress = questions.length ? Math.round((answered / questions.length) * 100) : 0;

  function choose(id: string, val: number) {
    setResponses((prev) => {
      const next = { ...prev, [id]: val };
      try {
        localStorage.setItem('loveai_eval_draft', JSON.stringify(next));
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await submitEvaluation(responses);
      localStorage.setItem('loveai_evaluation_id', res.evaluationId);
      localStorage.setItem(
        'loveai_persona',
        JSON.stringify({
          archetype: res.archetype,
          personaType: res.personaType?.label,
          personaText: res.personaText,
          profile: res.profile,
        })
      );
      localStorage.removeItem('loveai_eval_draft');
      setResult(res);
    } catch (e: any) {
      if (e?.response?.status === 401) {
        clearSession();
        router.push('/login?next=/evaluate');
        return;
      }
      setError(e?.response?.data?.error || e?.message || 'Failed to complete reflections.');
    } finally {
      setSubmitting(false);
    }
  }

  // Results View
  if (result) {
    const radarTraits = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];
    const radarScores = radarTraits.map((k) => ({
      label: TRAIT_LABELS[k] || k,
      value: result.profile[k] ?? 0.5,
    }));

    const allTraits = Object.entries(result.profile);

    return (
      <div className="eval-container stagger-in">
        <header className="site-nav" style={{ position: 'relative', padding: '0 0 40px' }}>
          <nav className="site-nav-inner">
            <Link href="/" className="brand">
              <span className="brand-mark">♥</span>
              <span>loveAI</span>
            </Link>
            <ThemeToggle />
          </nav>
        </header>

        <div className="glass-panel results-hero-card">
          <span className="status-beacon" style={{ marginBottom: '14px' }}>
            <span className="beacon-dot" />
            <span>Companion Attuned</span>
          </span>
          <h1 className="archetype-title">
            {result.archetype}
          </h1>
          <div className="archetype-tagline">
            {result.personaType?.tagline ?? 'A thoughtful and tender companion matched to your heart.'}
          </div>

          <p style={{ maxWidth: '620px', margin: '0 auto 28px', color: 'var(--text-sub)', lineHeight: '1.7', fontSize: '1.05rem' }}>
            {result.personaText}
          </p>

          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-lg" onClick={() => router.push('/chat')}>
              <span>Enter Sanctuary & Begin Chatting</span>
              <span>→</span>
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => setResult(null)}>
              <span>Review Reflections</span>
            </button>
          </div>

          <div className="results-grid-2">
            {/* Radar Panel */}
            <div className="glass-panel radar-panel">
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '20px', color: 'var(--text-main)' }}>
                Your Emotional Spectrum
              </h3>
              <EmotionalRadarChart scores={radarScores} />
              <p style={{ marginTop: '16px', fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Balanced across warmth, empathy, and intuitive listening.
              </p>
            </div>

            {/* Trait Meters */}
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '20px', color: 'var(--text-main)' }}>
                Your Connection Dimensions
              </h3>
              <div className="traits-panel">
                {allTraits.slice(0, 6).map(([trait, score]) => (
                  <div key={trait} className="trait-meter">
                    <div className="trait-label-row">
                      <span>{TRAIT_LABELS[trait] || trait.replace(/_/g, ' ')}</span>
                      <span style={{ color: 'var(--rose-400)' }}>{Math.round(score * 100)}%</span>
                    </div>
                    <div className="trait-bar-track">
                      <div className="trait-bar-fill" style={{ width: `${Math.round(score * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Active Questionnaire View
  return (
    <div className="eval-container">
      {/* Top Navbar */}
      <header className="site-nav" style={{ position: 'relative', padding: '0 0 32px' }}>
        <nav className="site-nav-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">♥</span>
            <span>loveAI</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ThemeToggle />
            <Link href="/" className="btn btn-ghost btn-sm">Exit</Link>
          </div>
        </nav>
      </header>

      {/* Header Info */}
      <div className="glass-panel eval-header-card stagger-in">
        <span className="hero-tag">
          <span>Step {step + 1} of {steps.length}</span>
        </span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
          {current?.title || 'Discover Your Heart Style'}
        </h1>
        <p style={{ color: 'var(--text-sub)', fontSize: '1.05rem', maxWidth: '520px' }}>
          {current?.hint || 'Take a quiet breath and answer with your honest feeling. There are no right or wrong answers.'}
        </p>

        {/* Progress Bar */}
        <div className="eval-progress-bar-wrap">
          <div className="eval-progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          <span>{answered} of {questions.length} reflections shared</span>
          <span style={{ color: 'var(--rose-400)', fontWeight: 600 }}>{progress}% attuned</span>
        </div>

        {/* Step Navigation Pills */}
        <div className="eval-steps-dots">
          {steps.map((s, i) => (
            <button
              key={s.key}
              type="button"
              className={`eval-step-pill ${i === step ? 'active' : i < step ? 'completed' : ''}`}
              onClick={() => setStep(i)}
            >
              {i + 1}. {s.title.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="glass-panel" style={{ padding: '16px 24px', borderColor: 'var(--rose-500)', color: 'var(--rose-400)', marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <div className="beacon-dot" style={{ margin: '0 auto 16px', width: '14px', height: '14px' }} />
          <p>Opening your private reflections…</p>
        </div>
      )}

      {/* Question Group */}
      {!loading && current && (
        <div className="question-group">
          {current.questions.map((q) => (
            <div 
              key={q.id} 
              className={`question-card ${responses[q.id] !== undefined ? 'answered' : ''}`}
            >
              <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--violet-400)', fontWeight: 700, marginBottom: '6px' }}>
                {TRAIT_LABELS[q.trait] || q.trait.replace(/_/g, ' ')}
              </div>
              <h3 className="question-text">{q.text}</h3>
              
              <SmoothReflectionSlider
                value={responses[q.id]}
                min={scale[0]?.value ?? 1}
                max={scale[scale.length - 1]?.value ?? 5}
                options={scale}
                onChange={(v) => choose(q.id, v)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Footer Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '20px', paddingBottom: '60px' }}>
        <button
          className="btn btn-ghost"
          onClick={() => (step === 0 ? router.push('/') : setStep(step - 1))}
        >
          {step === 0 ? '← Home' : '← Previous Step'}
        </button>

        {step < steps.length - 1 ? (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
            <span>Next Step</span>
            <span>→</span>
          </button>
        ) : (
          <button
            className="btn btn-primary btn-lg"
            onClick={submit}
            disabled={answered < questions.length || submitting}
          >
            {submitting ? (
              <span>Attuning Your Companion…</span>
            ) : answered === questions.length ? (
              <span>Meet Your Companion →</span>
            ) : (
              <span>{questions.length - answered} reflections remaining</span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
