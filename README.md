# LoveAI

A fine-tuned LLM persona chatbot. It builds a psychological persona from a
34-question matrix (17 dimensions), encodes it into a 768-dim vector for
pgvector similarity retrieval, and generates replies in a voice matched to the
user's own communication style, emotional tone, and motivations — with a
small model fine-tuned via QLoRA (SFT) and aligned via DPO.

## Architecture

```
User → React UI (Vite, :5173) → Express API (:3001) → PostgreSQL + pgvector (Aiven)
                                                          │
                                          persona vector (768-d, seeded Gaussian RP)
                                                          ▼
                                          RAG: nearest similar personas (cosine)
                                                          ▼
                                    fine-tuned model (Qwen2.5-1.5B + QLoRA, ml/serve.py :8000)
                                                          ▼
                                                persona-aware reply
```

## Repository Layout

| Path | What it is |
|---|---|
| `client/` | React 18 + Vite UI: Landing, 34-question evaluation, persona results, chat |
| `server/` | Express API: persona evaluate, pgvector RAG store, chat sessions, LLM proxy |
| `shared/persona-matrix.json` | Canonical 34-question matrix (mirrored by `server/src/persona/matrix.ts`) |
| `ml/` | Full fine-tuning pipeline (dataset builder, QLoRA SFT, DPO, inference server, Docker) |
| `docs/deployment.md` | AWS/VPS deployment guide |

## Quickstart (local, full stack + mock LLM)

Prerequisites: Node 20+, npm; a PostgreSQL database (any pgvector-capable host).

```bash
npm run install:all
cp server/.env.example server/.env        # then set DATABASE_URL
npm run dev                               # Express :3001 + Vite :5173
```

- Open http://localhost:5173, complete the evaluation, then chat.
- With `LLM_MOCK=true` (default) the server uses a deterministic, persona-aware
  reply engine — the whole product runs with no GPU.
- Set `LLM_MOCK=false` and run `ml/serve.py` to use the fine-tuned model.

### Database

`server/src/models/schema.sql` creates `users`, `persona_evaluations`
(with `persona_vector vector(768)` + HNSW index), `chat_sessions`,
`chat_messages`. The server applies it on startup and auto-detects pgvector.

Free managed Postgres (used in dev): **Aiven** — one free `pg:free-1-1gb`
service (UpCloud/DigitalOcean only for free plans), then:

```bash
npm run seed   # inserts 8 archetype personas so RAG has neighbors
```

## Fine-tuning Pipeline (`ml/`)

```bash
cd ml
python -m venv .venv && .venv\Scripts\activate   # Python 3.12 recommended
pip install -r requirements.txt                  # torch 2.5.1+cu121 (CUDA builds via --index-url)

# 1. Generate synthetic persona-chat data (SFT + DPO pairs)
python datasets/build_dataset.py --n 200

# 2. QLoRA SFT on the 17-dim persona system prompts
python train.py --data ml/data/persona_sft_train.jsonl --output ml/models/persona-sft

# 3. DPO alignment for emotionally on-persona replies
python train_dpo.py --model ml/models/persona-sft --output ml/models/persona-dpo

# 4. Serve via FastAPI (OpenAI-style endpoint) — server proxies to this
python serve.py --adapter ml/models/persona-dpo --port 8000

# (optional) merge LoRA into a standalone model for CPU/prod serving
python merge.py --adapter ml/models/persona-dpo --output ml/models/persona-merged
```

Notes:
- 4 GB VRAM is enough for Qwen2.5-1.5B with 4-bit QLoRA; use the merged model
  (bfloat16) on CPU for production. Larger models → AWS EC2 `g5.xlarge`.
- `ml/persona_vector.py` reproduces the server's 768-d encoder exactly
  (verified byte-for-byte) for offline verification.
- Deployment: `ml/Dockerfile` (CUDA runtime) + `docs/deployment.md`.

## API Summary

- `GET  /api/health` — service + DB + pgvector + LLM status
- `GET  /api/persona/matrix` — the 34 questions & Likert scale
- `POST /api/persona/evaluate` — submit answers → persona profile + 768-d vector
- `POST /api/chat/sessions` — start a chat bound to an evaluation
- `POST /api/chat/sessions/:id/messages` — send a message (RAG + persona-aware reply)

## Env Vars (`server/.env`)

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | local fallback | Postgres + pgvector connection string |
| `PORT` | 3001 | Express port |
| `LLM_URL` | `http://localhost:8000` | fine-tuned inference server |
| `LLM_MOCK` | `true` | use deterministic fallback replies |
| `LLM_ENABLED` | `true` | call the inference server when not mocked |
| `ALLOWED_ORIGINS` | empty (allow all) | CORS allowlist — set before production |
| `PERSONA_SEED` | 42 | vector projection seed (must be stable!) |

## License

MIT
