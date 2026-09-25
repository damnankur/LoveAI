---
title: loveAI Persona Chat
emoji: 💌
colorFrom: pink
colorTo: red
sdk: gradio
sdk_version: 4.44.1
app_file: app.py
pinned: false
license: mit
---

# loveAI Persona Chat (ZeroGPU Space)

Self-hosted inference for the loveAI persona chatbot.

- **Model:** merged Gemma-3-1B (base + LoRA) from `ml/models/persona-merged` — push it to a private HF repo and set `MODEL_REPO` below, or upload the merged weights into this Space.
- **Serves:** Gradio chat UI + OpenAI-compatible `POST /v1/chat/completions` (what `web/lib/llm.ts` calls).
- **ZeroGPU:** `@spaces.GPU` decorator; free tier = 5 GPU-min/day (demos only, NOT production).
- **Production LLM:** use the Gemini free tier instead — see `Knowledge/loveai-free-live-plan.md` in the Obsidian vault.

## Deploy

1. `python ml/merge.py --adapter ml/models/persona-dpo --output ml/models/persona-merged`
2. Push merged weights to a **private** HF repo (e.g. `you/loveai-persona-merged`), or upload into this Space's `models/`.
3. Set Space secrets: `MODEL_REPO` (HF repo id, optional), `HF_TOKEN` (needed for gated Gemma), `MODEL_DIR` (local path override).
4. Hardware: **ZeroGPU** (settings). First load compiles ~2-3 min; subsequent calls use the warm model.
