"""Merge the LoRA adapters into a standalone model for CPU/production serving.

Usage:
    python ml/merge.py --base Qwen/Qwen2.5-1.5B-Instruct --adapter ml/models/persona-dpo --output ml/models/persona-merged
"""
from __future__ import annotations

import argparse
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="Qwen/Qwen2.5-1.5B-Instruct")
    ap.add_argument("--adapter", default="ml/models/persona-dpo")
    ap.add_argument("--output", default="ml/models/persona-merged")
    args = ap.parse_args()

    tokenizer = AutoTokenizer.from_pretrained(args.base)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(args.base, torch_dtype=torch.bfloat16, device_map="cpu")
    model = PeftModel.from_pretrained(model, args.adapter)
    model = model.merge_and_unload()

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out, safe_serialization=True)
    tokenizer.save_pretrained(out)
    print(f"Merged model saved to {out} (~{(sum(f.stat().st_size for f in out.glob('*')) / 1e9):.2f} GB)")


if __name__ == "__main__":
    main()
