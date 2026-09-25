"""ZeroGPU Space app for loveAI: Gradio chat UI + OpenAI-compatible /v1/chat/completions.

Loads the merged Gemma-3-1B persona model. The OpenAI-compatible endpoint is what
web/lib/llm.ts calls (LLM_URL -> this Space). Decorated with @spaces.GPU so the GPU
is only requested while a request is being served (ZeroGPU quota-friendly).
"""
from __future__ import annotations

import os
from typing import List

import gradio as gr
import spaces
import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_REPO = os.environ.get("MODEL_REPO", "google/gemma-3-1b-it")
MODEL_DIR = os.environ.get("MODEL_DIR", "")  # local path override (e.g. ./models)

model = None
tokenizer = None


def load_model() -> None:
    global model, tokenizer
    if model is not None:
        return
    path = MODEL_DIR if MODEL_DIR and os.path.isdir(MODEL_DIR) else MODEL_REPO
    tokenizer = AutoTokenizer.from_pretrained(path, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(
        path,
        torch_dtype=torch.float16,
        device_map="auto",
        trust_remote_code=True,
    )
    model.eval()


# Load at startup (CUDA emulation mode outside @spaces.GPU is fine; real GPU inside).
load_model()


@spaces.GPU(duration=120)
def generate(messages: list[dict], max_tokens: int = 220, temperature: float = 0.8, top_p: float = 0.95) -> str:
    """messages: [{"role": "system"|"user"|"assistant", "content": str}, ...] -> reply str"""
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to(model.device)
    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temperature,
            do_sample=temperature > 0,
            top_p=top_p,
            pad_token_id=tokenizer.eos_token_id,
        )
    generated = out[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(generated, skip_special_tokens=True).strip()


# --- OpenAI-compatible route (what web/lib/llm.ts POSTs to) ---
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str = "persona"
    messages: List[ChatMessage]
    max_tokens: int = 220
    temperature: float = 0.8
    top_p: float = 0.95


# --- Gradio chat UI ---
def chat_fn(message: str, history: list | None) -> str:
    history = history or []
    messages = [{"role": "system", "content": "You are LoveAI, a supportive conversational AI companion."}]
    for user, assistant in history:
        messages.append({"role": "user", "content": user})
        messages.append({"role": "assistant", "content": assistant})
    messages.append({"role": "user", "content": message})
    return generate(messages)


demo = gr.ChatInterface(
    fn=chat_fn,
    title="loveAI Persona Chat",
    description="A fine-tuned companion voice (Gemma-3-1B + LoRA).",
    theme=gr.themes.Soft(primary_hue="rose", neutral_hue="stone"),
)


# Mount the OpenAI-compatible routes on the same FastAPI app Gradio serves.
# NOTE: routes MUST be registered before demo.launch() — launch() blocks, so any
# route declared after it would never be registered and /v1/chat/completions
# would 404 against web/lib/llm.ts.
app = demo.app


@app.post("/v1/chat/completions")
async def chat_completions(req: ChatRequest):
    msgs = [m.model_dump() for m in req.messages]
    reply = generate(msgs, req.max_tokens, req.temperature, req.top_p)
    return {
        "choices": [{"message": {"role": "assistant", "content": reply}}],
        "usage": {"total_tokens": 0},
    }


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}


# Launch last: this blocks, so every route above is already registered.
demo.launch(server_name="0.0.0.0", server_port=7860)
