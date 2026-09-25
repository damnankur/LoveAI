"""FastAPI inference server for the fine-tuned persona chatbot.

Loads the base model + trained LoRA adapter and exposes an OpenAI-style
/v1/chat/completions endpoint that the Express server proxies to.

Usage:
    python ml/serve.py --adapter ml/models/persona-dpo --port 8000
"""
from __future__ import annotations

import argparse
import os
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI
from peft import PeftModel
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
import uvicorn

BASE_MODEL = "google/gemma-3-1b-it"
DEFAULT_ADAPTER = os.environ.get("PERSONA_ADAPTER", "ml/models/persona-dpo")

model = None
tokenizer = None
device = "cuda" if torch.cuda.is_available() else "cpu"


def compute_dtype() -> torch.dtype:
    """bf16 needs Ampere+; the GTX 1650 Ti (Turing, sm_75) uses fp16."""
    if torch.cuda.is_available():
        major = torch.cuda.get_device_capability()[0]
        return torch.bfloat16 if major >= 8 else torch.float16
    return torch.float32


def load(adapter_dir: str | None) -> None:
    global model, tokenizer
    base_id = os.environ.get("PERSONA_BASE_MODEL", BASE_MODEL)
    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=compute_dtype(),
        bnb_4bit_use_double_quant=True,
    ) if torch.cuda.is_available() else None
    tokenizer = AutoTokenizer.from_pretrained(adapter_dir if adapter_dir and os.path.isdir(adapter_dir) else base_id)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    base = AutoModelForCausalLM.from_pretrained(
        base_id, quantization_config=bnb, device_map="auto", torch_dtype=compute_dtype()
    )
    if adapter_dir and os.path.isdir(adapter_dir):
        model = PeftModel.from_pretrained(base, adapter_dir)
    else:
        model = base
    model.eval()


@asynccontextmanager
async def lifespan(_: FastAPI):
    load(os.environ.get("PERSONA_ADAPTER", DEFAULT_ADAPTER))
    yield


app = FastAPI(title="loveai persona inference", lifespan=lifespan)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str = "persona"
    messages: list[Message]
    max_tokens: int = 256
    temperature: float = 0.7
    top_p: float = 0.9


class ChatResponse(BaseModel):
    choices: list[dict]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "device": device, "model_loaded": model is not None}


@app.post("/v1/chat/completions")
def chat(req: ChatRequest) -> dict:
    messages = [m.model_dump() for m in req.messages]
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(device)
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=req.max_tokens,
            temperature=req.temperature,
            do_sample=req.temperature > 0,
            top_p=req.top_p,
            pad_token_id=tokenizer.eos_token_id,
        )
    generated = out[0][inputs["input_ids"].shape[1]:]
    reply = tokenizer.decode(generated, skip_special_tokens=True).strip()
    return {"choices": [{"message": {"role": "assistant", "content": reply}}]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--adapter", default=DEFAULT_ADAPTER)
    ap.add_argument("--model", default=BASE_MODEL, help="Base model id (override for non-Gemma smoke tests)")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    args = ap.parse_args()
    os.environ.setdefault("PERSONA_BASE_MODEL", args.model)
    os.environ.setdefault("PERSONA_ADAPTER", args.adapter)
    uvicorn.run(app, host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
