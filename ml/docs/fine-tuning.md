# How to Fine-Tune the LoveAI Persona Model

This guide walks through the full fine-tuning pipeline in `ml/` using the actual
scripts in this repo. It is written so a beginner can run the whole thing end to
end on a single consumer GPU (the reference machine is a GTX 1650 Ti with 4 GB VRAM).

## What you are building

A small LLM (`google/gemma-3-1b-it`, Google's open Gemma 3 1B) tuned to reply like a personality
defined by a trait profile. The pipeline has four stages:

1. **Data** – synthesize chat examples (`datasets/build_dataset.py`)
2. **SFT** – teach the base model the response style (`train.py`)
3. **DPO** – push it toward persona-aligned replies, away from generic ones (`train_dpo.py`)
4. **Merge + Serve** – combine LoRA adapters into a deployable model (`merge.py`, `serve.py`)

Why fine-tune at all? The base model is generic. Fine-tuning bakes in *your*
persona behavior so inference doesn't need a giant prompt and responses match a
specific trait profile.

## 1. Environment setup

The repo pins Python 3.12 and CUDA 12.1 wheels (see `requirements.txt`).

```powershell
# Windows PowerShell, from the repo root (loveai/)
python -m venv ml/.venv
ml\.venv\Scripts\Activate.ps1
pip install -r ml/requirements.txt
```

Key packages and what they do:

| Package | Role |
|---|---|
| `torch` | deep learning framework (CUDA build) |
| `transformers` | model + tokenizer loading |
| `peft` | LoRA adapter training (only a few % of weights are trained) |
| `trl` | `SFTTrainer` and `DPOTrainer` – the actual training loops |
| `bitsandbytes` | 4-bit quantization so a 1B model fits in 4 GB VRAM (QLoRA) |
| `datasets` | dataset handling |
| `fastapi` / `uvicorn` | serving the trained model over HTTP |

> **GPU check:** `torch.cuda.is_available()` must be True. The scripts auto-pick
> `bf16` on Ampere+ GPUs and `fp16` on older Turing cards (`compute_dtype()` in
> `train.py:29`).

## 2. Understand the data

### Format

SFT data is a JSONL file where each line is a chat record:

```json
{"persona_id": 0, "messages": [
  {"role": "system", "content": "You are ... trait profile ..."},
  {"role": "user", "content": "How do you handle stress?"},
  {"role": "assistant", "content": "I usually..."}
]}
```

DPO data needs chosen/rejected pairs so the model learns *preference*:

```json
{"persona_id": 0, "prompt": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}],
 "chosen": [{"role": "assistant", "content": "persona-aligned reply"}],
 "rejected": [{"role": "assistant", "content": "generic/off-profile reply"}]}
```

### Generating synthetic data

```powershell
python ml/datasets/build_dataset.py --n 200 --seed 42
```

This samples 200 random trait profiles from the persona matrix
(`shared/persona-matrix.json`), writes persona-grounded responses from
templates (`datasets/templates.py`), and splits 90/10 into train/val files under
`ml/data/`. It's deterministic (seeded), so re-running with the same seed gives
the same data.

**The single most important lesson in fine-tuning:** your data defines the model.
The model can only get as good as the data. To improve the chatbot, improve the
data first – more variety, more edge cases, real transcripts.

## 3. Stage 1 – Supervised Fine-Tuning (SFT)

Teaches the model to *mimic* the persona responses you generated.

```powershell
python ml/train.py --data ml/data/persona_sft_train.jsonl --output ml/models/persona-sft
```

What the script does (see `train.py`):

- Loads `google/gemma-3-1b-it` in **4-bit** (QLoRA) so it fits 4 GB VRAM
- Wraps it in a **LoRA** adapter (rank 16) – only ~a few million params train
- Formats each record with the tokenizer's chat template
- Trains with `SFTTrainer`, saves the adapter to `ml/models/persona-sft`

Settings live in `configs/training_config.yaml` (epochs 3, lr 2e-4, batch 1 with
8× gradient accumulation ≈ effective batch 8, max seq len 1024).

**Result:** a small adapter directory (not a full model). Adapters are cheap to
store, swap, and re-train.

## 4. Stage 2 – Direct Preference Optimization (DPO)

SFT makes the model *sound* like the persona; DPO makes it *prefer* persona-
aligned replies and reject generic ones. It trains from chosen/rejected pairs.

```powershell
python ml/train_dpo.py --model ml/models/persona-sft --data ml/data/persona_dpo_train.jsonl --output ml/models/persona-dpo
```

Notes (see `train_dpo.py`):

- `--model` is the **SFT adapter** – DPO continues from SFT, it does not replace it
- `beta` (default 0.1) controls how much the model is allowed to drift from the
  reference model; smaller = stricter
- Lower LR (1e-4) and fewer epochs (2) than SFT – DPO is more fragile

## 5. Stage 3 – Merge the LoRA into a standalone model

LoRA keeps only weight *deltas*. For production/CPU serving you merge them back
into the base weights so you get one normal model directory:

```powershell
python ml/merge.py --base google/gemma-3-1b-it --adapter ml/models/persona-dpo --output ml/models/persona-merged
```

The merged model is ~3 GB and can run on CPU (slow but works).

## 6. Stage 4 – Serve it

```powershell
python ml/serve.py --adapter ml/models/persona-dpo --port 8000
```

`serve.py` is a FastAPI app exposing an OpenAI-style endpoint:

- `GET /health` – status + device + whether the model loaded
- `POST /v1/chat/completions` – chat completions the Express server proxies to

You can also serve the *merged* model by pointing `--adapter` at
`ml/models/persona-merged` (works on machines with no GPU).

## 7. How to make it better (the practical loop)

1. **Talk to the current model**, find replies that are off-persona.
2. **Add those cases to the data** (SFT for style, DPO pairs for preference).
3. Re-run: `build_dataset.py` → `train.py` → `train_dpo.py`.
4. Compare new vs old by serving both and testing the same prompts.

## 8. Hardware & scaling

| Setup | What you can train |
|---|---|
| GTX 1650 Ti (4 GB) | 1B QLoRA, as in this repo (Gemma 3 1B) |
| 8–16 GB GPU | 3B–7B QLoRA (change `MODEL` in `train.py:18`) |
| Cloud (AWS g5.xlarge, rented VPS) | 7B+ or full fine-tunes |

If you switch models, check the tokenizer chat template and LoRA target modules
still match (q/k/v/o + gate/up/down projections are configured in `train.py:72`).

> **Gated model:** Gemma models are gated on Hugging Face — accept the model
> license at https://huggingface.co/google/gemma-3-1b-it and export
> `HF_TOKEN` before training (`train.py`, `serve.py`, `merge.py` all download
> from the Hub).

## Quick reference

```text
env      : python -m venv ml/.venv && ml\.venv\Scripts\Activate.ps1
pip      : pip install -r ml/requirements.txt
data     : python ml/datasets/build_dataset.py --n 200 --seed 42
SFT      : python ml/train.py --data ml/data/persona_sft_train.jsonl --output ml/models/persona-sft
DPO      : python ml/train_dpo.py --model ml/models/persona-sft --data ml/data/persona_dpo_train.jsonl --output ml/models/persona-dpo
merge    : python ml/merge.py --adapter ml/models/persona-dpo --output ml/models/persona-merged
serve    : python ml/serve.py --adapter ml/models/persona-dpo --port 8000
```
