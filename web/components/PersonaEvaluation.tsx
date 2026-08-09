'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  EvaluateResult,
  MatrixQuestion,
  ScaleOption,
  fetchMatrix,
  submitEvaluation,
} from '@/lib/api';

const TRAIT_LABELS: Record<string, string> = {
  openness: 'Openness',
  conscientiousness: 'Conscientiousness',
  extraversion: 'Extraversion',
  agreeableness: 'Agreeableness',
  neuroticism: 'Neuroticism',
  self_awareness: 'Self-awareness',
  self_regulation: 'Self-regulation',
  empathy: 'Empathy',
  social_skills: 'Social skills',
  assertiveness: 'Assertiveness',
  active_listening: 'Active listening',
  verbal_preference: 'Verbal/text',
  conflict_style: 'Conflict style',
  intrinsic_motivation: 'Intrinsic motivation',
  extrinsic_motivation: 'Extrinsic motivation',
  core_values: 'Core values',
  life_goals: 'Life goals',
};

const BIG_FIVE = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'];

const STEP_ORDER = [
  { key: 'Big Five', title: 'The Big Five', hint: 'who you are, at rest' },
  { key: 'Emotional Intelligence', title: 'Emotional intelligence', hint: 'how you feel — and read others' },
  { key: 'Communication', title: 'Communication', hint: 'how your voice moves through the world' },
  { key: 'Values & Motivation', title: 'Values & motivation', hint: 'what pulls you forward' },
];

function RadarChart({ scores }: { scores: { label: string; value: number }[] }) {
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;
  const n = scores.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, scale: number): [number, number] => [
    cx + Math.cos(angle(i)) * r * scale,
    cy + Math.sin(angle(i)) * r * scale,
  ];

  const grid = [0.25, 0.5, 0.75, 1].map((l) =>
    scores.map((_, i) => pt(i, l).join(',')).join(' ')
  );
  const poly = scores.map((s, i) => pt(i, Math.max(0.04, s.value)).join(',')).join(' ');

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Persona radar chart">
      {grid.map((points, i) => (
        <polygon key={i} className="radar-grid" points={points} />
      ))}
      {scores.map((_, i) => {
        const [x1, y1] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x1} y2={y1} className="radar-grid" />;
      })}
      <polygon className="radar-poly" points={poly} />
      {scores.map((s, i) => {
        const [x, y] = pt(i, 1.22);
        return (
          <text key={s.label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="radar-label">
            {s.label}
          </text>
        );
      })}
    </svg>
  );
}

function PersonaEvaluation() {
  const router = useRouter();
  const [questions, setQuestions] = useState<MatrixQuestion[]>([]);
  const [scale, setScale] = useState<ScaleOption[]>([]);
  const [responses, setResponses] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<EvaluateResult | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    fetchMatrix()
      .then((m) => {
        setQuestions(m.questions);
        setScale(m.scale);
      })
      .catch((e) => setError(e?.message || 'Failed to load questions'))
      .finally(() => setLoading(false));
  }, []);

  const answered = Object.keys(responses).length;
  const progress = questions.length ? (answered / questions.length) * 100 : 0;

  const grouped = useMemo(() => {
    const map = new Map<string, MatrixQuestion[]>();
    for (const q of questions) {
      const list = map.get(q.category) || [];
      list.push(q);
      map.set(q.category, list);
    }
    return map;
  }, [questions]);

  const steps = useMemo(
    () =>
      STEP_ORDER.map((s) => ({ ...s, questions: grouped.get(s.key) || [] })).filter(
        (s) => s.questions.length > 0
      ),
    [grouped]
  );

  const current = steps[step];

  function choose(id: string, value: number) {
    setResponses((r) => ({ ...r, [id]: value }));
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await submitEvaluation(responses);
      localStorage.setItem('loveai_evaluation_id', res.evaluationId);
      localStorage.setItem('loveai_persona', JSON.stringify({ archetype: res.archetype, personaText: res.personaText, profile: res.profile }));
      localStorage.removeItem('loveai_session_id');
      setResult(res);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Evaluation failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const traits = Object.entries(result.profile);
    const radarScores = BIG_FIVE.map((t) => ({
      label: TRAIT_LABELS[t],
      value: result.profile[t] ?? 0,
    }));
    return (
      <div className="eval-page">
        <div className="result-hero reveal">
          <span className="stamp">your persona</span>
          <h2>{result.archetype}</h2>
          <div className="hand">this is you — on paper, in vector</div>
          <p>
            {result.vectorDim}-dimension profile · pgvector cosine search enabled
          </p>
        </div>
        <div className="result-grid">
          <div className="radar-wrap reveal">
            <h3>At a glance</h3>
            <RadarChart scores={radarScores} />
            <div className="hand">the Big Five, drawn</div>
          </div>
          <div className="trait-grid">
            {traits.map(([trait, score]) => (
              <div key={trait} className="trait-cell">
                <div className="trait-name">{TRAIT_LABELS[trait] || trait}</div>
                <div className="trait-bar-track">
                  <div className="trait-bar-fill" style={{ width: `${Math.round(score * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="result-actions">
          <button className="btn btn-primary" onClick={() => router.push('/chat')}>
            Start chatting
          </button>
          <button className="btn btn-ghost" onClick={() => setResult(null)}>
            Review answers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="eval-page">
      <div className="eval-head reveal d1">
        <span className="stamp">the love letter to yourself</span>
        <h1>Personality evaluation</h1>
        <div className="hand">answer honestly — there are no wrong answers</div>
      </div>

      <div className="eval-sticky reveal d2">
        <div className="eval-progress" aria-hidden="true">
          <div className="eval-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="eval-sticky-meta">
          <span>{answered} / {questions.length} answered</span>
          <div className="step-dots" role="tablist" aria-label="Questionnaire steps">
            {steps.map((s, i) => (
              <button
                key={s.key}
                type="button"
                className={`step-dot ${i === step ? 'active' : i < step ? 'visited' : ''}`}
                onClick={() => setStep(i)}
                disabled={i > step}
                aria-current={i === step ? 'step' : undefined}
                aria-label={`Step ${i + 1}: ${s.title}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="error-banner reveal">{error}</div>}
      {loading && <p className="hand" style={{ fontSize: 20, textAlign: 'center' }}>opening the envelope…</p>}

      {!loading && current && (
        <section className="cat-block">
          <h2 className="cat-title">{current.title}</h2>
          <hr className="cat-rule" />
          <div className="step-hint">{current.hint}</div>
          <div key={step} className="step-fade">
            {current.questions.map((q) => (
              <fieldset
                key={q.id}
                className={`q-card-fieldset ${responses[q.id] !== undefined ? 'is-answered' : ''}`}
              >
                <legend>
                  <span className="q-category">{q.trait.replace(/_/g, ' ')}</span>
                  <span className="q-text">{q.text}</span>
                </legend>
                <div className="scale-radio-group">
                  {scale.map((opt) => (
                    <label
                      key={opt.value}
                      className={`scale-radio-label ${responses[q.id] === opt.value ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name={`question-${q.id}`}
                        value={opt.value}
                        checked={responses[q.id] === opt.value}
                        onChange={() => choose(q.id, opt.value)}
                        className="sr-only"
                      />
                      <span className="scale-num">{opt.value}</span>
                      <span className="scale-text">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </section>
      )}

      <div className="eval-footer">
        <button
          className="btn btn-ghost"
          onClick={() => (step === 0 ? router.push('/') : setStep(step - 1))}
        >
          {step === 0 ? '← Back' : '← Previous'}
        </button>
        {step < steps.length - 1 ? (
          <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
            Next →
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={answered < questions.length || submitting}
          >
            {submitting ? <span className="spinner" /> : answered === questions.length ? 'See my persona' : `Answer ${questions.length - answered} more`}
          </button>
        )}
      </div>
    </div>
  );
}

export default PersonaEvaluation;
