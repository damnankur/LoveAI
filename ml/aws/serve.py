"""FastAPI inference server for the fine-tuned loveAI persona model — AWS / CPU variant.

Same OpenAI-compatible contract as ``ml/serve.py`` (``GET /health``,
``POST /v1/chat/completions``) so ``web/lib/llm.ts`` needs no changes. Three
deviations, all motivated by running on a small always-on EC2 box:

1. **Optional API-key auth.** If ``LLM_API_KEY`` is set, requests to
   ``/v1/chat/completions`` must carry either ``Authorization: Bearer <key>``
   (what ``web/lib/llm.ts`` already sends) or ``X-API-Key: <key>``.
   ``/health`` stays public so health checks and the deploy script work.
   Unset key => auth disabled (dev mode), which is logged loudly at startup.

2. **Merged-model aware.** ``ml/serve.py`` always wraps the base model with
   ``PeftModel.from_pretrained``. The Kaggle pipeline emits a *merged* model
   (``persona-merged/``), which has no ``adapter_config.json`` and therefore
   blows up under that code path. Here we look at the directory: a PEFT adapter
   is loaded on top of the base model, a merged model is loaded directly.

3. **CPU-tuned + fail-fast on RAM.** ``PERSONA_DTYPE`` (default: float32 on CPU),
   ``TORCH_NUM_THREADS``, a clamp on ``max_tokens`` (latency + memory protection)
   and a pre-flight RAM check that refuses to load a model which cannot fit,
   instead of getting OOM-killed mid-request.

Environment:
    PERSONA_ADAPTER | PERSONA_MODEL_DIR   path to merged model OR PEFT adapter
                                          (default /app/models/persona-dpo)
    LLM_API_KEY                           optional shared secret (auth off if unset)
    PERSONA_DTYPE                         float32 | float16 | bfloat16 (CPU default float32)
    TORCH_NUM_THREADS                     CPU threads for torch (default: all cores)
    MAX_NEW_TOKENS_CAP                    hard ceiling for max_tokens (default 512)
    PORT                                  listen port (default 8000)

Usage:
    python3 serve.py --model /app/models/persona-merged --port 8000
"""
from __future__ import annotations

import argparse
import hmac
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Annotated

import torch
from fastapi import Depends, FastAPI, Header, HTTPException
from peft import PeftModel
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
import uvicorn

BASE_MODEL = os.environ.get("BASE_MODEL", "google/gemma-3-1b-it")
DEFAULT_ADAPTER = os.environ.get("PERSONA_ADAPTER", "/app/models/persona-dpo")
API_KEY_ENV_VARS = ("LLM_API_KEY", "PERSONA_API_KEY", "LOVEAI_API_KEY")

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s [loveai] %(levelname)s %(message)s",
)
log = logging.getLogger("loveai.serve")

model = None
tokenizer = None
device = "cuda" if torch.cuda.is_available() else "cpu"


# --------------------------------------------------------------------------- #
# auth
# --------------------------------------------------------------------------- #
def configured_api_key() -> str:
    """The expected key, or '' when auth is disabled. Read per-request so a
    container can be reconfigured without an import-time snapshot."""
    for name in API_KEY_ENV_VARS:
        value = (os.environ.get(name) or "").strip()
        if value:
            return value
    return ""


def extract_presented_key(authorization: str | None, x_api_key: str | None) -> str:
    if x_api_key and x_api_key.strip():
        return x_api_key.strip()
    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token.strip():
            return token.strip()
    return ""


def require_api_key(
    authorization: Annotated[str | None, Header()] = None,
    x_api_key: Annotated[str | None, Header()] = None,
) -> None:
    """FastAPI dependency: enforce the shared secret when one is configured."""
    expected = configured_api_key()
    if not expected:  # open mode — see startup warning
        return
    presented = extract_presented_key(authorization, x_api_key)
    if not presented or not hmac.compare_digest(presented, expected):
        log.warning("rejected request: missing/invalid api key (key_len=%d)", len(presented))
        raise HTTPException(
            status_code=401,
            detail="invalid or missing API key",
            headers={"WWW-Authenticate": "Bearer"},
        )


# --------------------------------------------------------------------------- #
# model loading
# --------------------------------------------------------------------------- #
def compute_dtype() -> torch.dtype:
    """bf16 needs Ampere+; the GTX 1650 Ti (Turing, sm_75) uses fp16.
    On CPU: PERSONA_DTYPE wins, default float32 (see RAM note in DEPLOYMENT_PLAYBOOK)."""
    if torch.cuda.is_available():
        major = torch.cuda.get_device_capability()[0]
        return torch.bfloat16 if major >= 8 else torch.float16
    override = (os.environ.get("PERSONA_DTYPE") or "").strip().lower()
    return {
        "float16": torch.float16,
        "fp16": torch.float16,
        "half": torch.float16,
        "bfloat16": torch.bfloat16,
        "bf16": torch.bfloat16,
        "float32": torch.float32,
        "fp32": torch.float32,
    }.get(override, torch.float32)


def available_ram_gb() -> float | None:
    """MemAvailable from /proc/meminfo, in GB. None when unavailable."""
    try:
        with open("/proc/meminfo", encoding="ascii") as fh:
            for line in fh:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) / (1024 * 1024)
    except OSError:
        pass
    return None


def estimate_model_ram_gb(param_count: float, dtype: torch.dtype) -> float:
    """Weights + ~35% overhead for activations, KV cache, logits (262k vocab) and runtime."""
    bytes_per_param = 4 if dtype == torch.float32 else 2
    return param_count * bytes_per_param / 1e9 * 1.35


def preflight_memory(dtype: torch.dtype) -> None:
    """Refuse to start when the model obviously cannot fit — a clear log line beats
    an OOM kill. t4g.small (2 GiB) cannot serve fp32/fp16 safetensors; use the GGUF
    + llama.cpp path instead (see DEPLOYMENT_PLAYBOOK.md)."""
    if torch.cuda.is_available():
        return
    need = estimate_model_ram_gb(1.0e9, dtype)  # gemma-3-1b ≈ 1.0B params incl. embeddings
    have = available_ram_gb()
    log.info("pre-flight: need≈%.1f GB RAM (%s), available≈%s", need, dtype, f"{have:.1f} GB" if have else "unknown")
    if have is not None and have < need and os.environ.get("PERSONA_ALLOW_LOW_MEM") != "1":
        raise SystemExit(
            f"Not enough RAM for {dtype} safetensors (need ≈{need:.1f} GB, have {have:.1f} GB). "
            "Options: (a) serve the GGUF with llama-server (recommended on 2 GiB instances), "
            "(b) PERSONA_DTYPE=float16 (≈2.7 GB — still tight), "
            "(c) move to an instance with >=8 GiB, (d) set PERSONA_ALLOW_LOW_MEM=1 to override."
        )


def is_peft_adapter(path: str) -> bool:
    return os.path.isfile(os.path.join(path, "adapter_config.json"))


def load(model_dir: str | None) -> None:
    global model, tokenizer
    dtype = compute_dtype()
    preflight_memory(dtype)

    threads = os.environ.get("TORCH_NUM_THREADS")
    if threads:
        torch.set_num_threads(int(threads))
    log.info("device=%s dtype=%s threads=%s", device, dtype, torch.get_num_threads())

    bnb = (
        BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=dtype,
            bnb_4bit_use_double_quant=True,
        )
        if torch.cuda.is_available()
        else None
    )

    use_local = bool(model_dir) and os.path.isdir(model_dir)
    merged = use_local and not is_peft_adapter(model_dir or "")
    source = model_dir if use_local else BASE_MODEL
    log.info("loading %s from %s", "merged model" if merged else "base+adapter", source)

    tokenizer = AutoTokenizer.from_pretrained(source)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    base = AutoModelForCausalLM.from_pretrained(
        source if merged else BASE_MODEL,
        quantization_config=bnb,
        device_map="auto",
        torch_dtype=dtype,
        low_cpu_mem_usage=True,
    )
    if use_local and not merged:
        model = PeftModel.from_pretrained(base, source)
    else:
        model = base
    model.eval()
    log.info("model ready (%.0fM params)", sum(p.numel() for p in model.parameters()) / 1e6)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if configured_api_key():
        log.info("api key auth ENABLED for /v1/* endpoints")
    else:
        log.warning("api key auth DISABLED — set LLM_API_KEY before exposing this publicly")
    load(os.environ.get("PERSONA_MODEL_DIR") or os.environ.get("PERSONA_ADAPTER") or DEFAULT_ADAPTER)
    yield


app = FastAPI(title="loveai persona inference (aws)", lifespan=lifespan)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str = "persona"
    messages: list[Message] = Field(min_length=1)
    max_tokens: int = 256
    temperature: float = 0.7
    top_p: float = 0.9


# --------------------------------------------------------------------------- #
# routes
# --------------------------------------------------------------------------- #
@app.get("/health")
def health() -> dict:
    """Public on purpose: no auth, no model call — safe for probes and the
    deploy script's wait loop."""
    return {
        "status": "ok",
        "device": device,
        "model_loaded": model is not None,
        "auth": "enabled" if configured_api_key() else "disabled",
    }


@app.get("/v1/models", dependencies=[Depends(require_api_key)])
def list_models() -> dict:
    return {
        "object": "list",
        "data": [
            {
                "id": os.environ.get("LLM_MODEL", "loveai-persona-1b"),
                "object": "model",
                "owned_by": "loveai",
            }
        ],
    }


@app.post("/v1/chat/completions", dependencies=[Depends(require_api_key)])
def chat(req: ChatRequest) -> dict:
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="model not loaded")

    cap = int(os.environ.get("MAX_NEW_TOKENS_CAP", "512"))
    max_new_tokens = max(1, min(req.max_tokens, cap))
    temperature = max(0.0, min(req.temperature, 2.0))
    top_p = max(0.0, min(req.top_p, 1.0))

    messages = [m.model_dump() for m in req.messages]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(device)
    prompt_tokens = int(inputs["input_ids"].shape[1])

    started = time.perf_counter()
    with torch.inference_mode():
        out = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            do_sample=temperature > 0,
            top_p=top_p,
            pad_token_id=tokenizer.eos_token_id,
        )
    elapsed = time.perf_counter() - started

    generated = out[0][inputs["input_ids"].shape[1]:]
    reply = tokenizer.decode(generated, skip_special_tokens=True).strip()
    completion_tokens = int(generated.shape[0])
    log.info(
        "chat ok: prompt=%d completion=%d seconds=%.2f tok/s=%.1f",
        prompt_tokens,
        completion_tokens,
        elapsed,
        completion_tokens / elapsed if elapsed else 0.0,
    )
    return {
        "id": f"chatcmpl-loveai-{int(time.time() * 1000)}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": req.model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": reply},
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", "--adapter", dest="model", default=DEFAULT_ADAPTER)
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    args = ap.parse_args()
    os.environ.setdefault("PERSONA_MODEL_DIR", args.model)
    uvicorn.run(app, host="0.0.0.0", port=args.port, workers=1)


if __name__ == "__main__":
    main()
