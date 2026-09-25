# 💌 LoveAI

**An AI companion that actually sounds like you.**

LoveAI builds a psychological profile of you from a 34-question assessment, then holds conversations that mirror your personality — your communication style, your emotional tone, and what motivates you. It's a private, self-reflective space to think through your day, not a chatbot that talks *at* you.

**Live:** [loveai-brown.vercel.app](https://loveai-brown.vercel.app)

---

## Why LoveAI exists

Generic chatbots respond the same way to everyone. They miss the nuance of *how you communicate* — whether you're reserved or expressive, whether you want direct advice or quiet listening, whether you're driven by curiosity or by achievement.

LoveAI changes that. It measures 17 personality dimensions across five domains, encodes them into a 768-dimensional vector, and uses that profile to shape every single response. The result is an AI that feels *matched to you*, not one-size-fits-all.

**The use case:** a judgment-free companion for emotional self-reflection, day-to-day processing, and getting to know your own mind. Not a therapist — a mirror.

---

## How it works

```
You complete a 34-question persona assessment
                ↓
17-dimension psychological profile (Big Five + EQ + Communication + Values)
                ↓
768-dim vector embedding (seeded Gaussian projection)
                ↓
pgvector similarity search → retrieves the closest personality archetypes
                ↓
Fine-tuned Gemma-3-1B model generates a reply in *your* voice
```

1. **Assess** — a 34-item, reverse-keyed questionnaire (5-point Likert) builds your profile across 17 traits.
2. **Vectorize** — the profile is projected to a 768-dim vector for high-speed similarity matching.
3. **Retrieve** — pgvector finds the closest stored personas (16 MBTI archetypes + historical profiles) to inform context.
4. **Respond** — a custom fine-tuned model (Gemma-3-1B, QLoRA SFT + DPO) generates persona-aligned, emotionally intelligent replies.

---

## Features

- 🧠 **Personality-matched responses** — every reply is conditioned on your 17-dimension profile
- 🔍 **Semantic persona retrieval** — pgvector cosine similarity with a 0.7 threshold and archetype deduplication
- 💬 **Contextual conversation** — relevance-scored history retrieval, not blind recency
- 🎨 **An intimate, calm aesthetic** — the "love letter at golden hour" design language, WCAG 2.2 AA
- 🔐 **Private by design** — your persona and conversations are yours; Google sign-in with 30-day sessions
- ⚡ **Graceful resilience** — mock fallback keeps the experience alive even when the inference server is cold

---

## Production stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (React), deployed on **Vercel** |
| Auth | Google OAuth (ID-token flow) |
| Database | **Supabase** (PostgreSQL + **pgvector**) |
| Vector search | pgvector HNSW + cosine similarity |
| LLM inference | **Gemma-3-1B** fine-tuned via QLoRA (SFT + DPO), served on **AWS** (EC2 + llama.cpp / FastAPI) |
| Model training | Kaggle GPU (T4 x2) — QLoRA SFT → DPO → merge |
| ML pipeline | PyTorch, Hugging Face Transformers, PEFT, TRL |

---

## Status

| Component | Status |
|---|---|
| Web app (Vercel) | ✅ Live |
| Persona assessment + vectorization | ✅ Live |
| Supabase + pgvector RAG | 🔄 Provisioned (restore pending on free-tier pause) |
| Fine-tuned Gemma-3-1B inference | 🚀 Deploying to AWS |

Health endpoint: [`/api/health`](https://loveai-brown.vercel.app/api/health)

---

## Getting started (development)

```bash
# 1. Install dependencies
npm run install:all

# 2. Configure environment (Supabase + optional LLM endpoint)
cp web/.env.local.example web/.env.local

# 3. Start the Next.js app
npm run dev          # → http://localhost:3000
```

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase pooler connection string (Postgres + pgvector) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `LLM_URL` | Inference endpoint (`/v1/chat/completions`) |
| `LLM_MOCK` | `true` to use the deterministic fallback replies |
| `LLM_API_KEY` | Optional shared secret for the inference server |

---

## Repository layout

| Path | Purpose |
|---|---|
| `web/` | Next.js app — landing, assessment, persona results, chat |
| `ml/` | Fine-tuning pipeline (data → QLoRA SFT → DPO → merge → serve) |
| `ml/aws/` | Production inference deployment (Terraform, systemd, nginx, TLS) |
| `ml/hf-space/` | Hugging Face Space (Gradio + OpenAI-compatible endpoint) |
| `kaggle/` | GPU training notebook + dataset bundle |
| `shared/` | Canonical 17-trait persona matrix |
| `client/` | React + Vite UI (local dev stack) |
| `server/` | Express API + pgvector store (local dev stack) |
| `docs/` | Deployment guide |
| `ml/docs/` | Fine-tuning guide (`fine-tuning.md`) |

---

## License

MIT © [Ankur Kumar Singh](https://github.com/damnankur)
