"""Merge the LoRA adapters into a standalone model for CPU/production serving.

Usage:
    python ml/merge.py --base google/gemma-3-1b-it --adapter ml/models/persona-dpo --output ml/models/persona-merged
"""
from __future__ import annotations

import argparse
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer


import os

def get_hf_token() -> str:
    token = os.environ.get("HF_TOKEN", "").strip()
    if token:
        return token
    vault_env = Path("C:/Users/aks/Documents/Obsidian Vault/.env")
    if vault_env.exists():
        for line in vault_env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("HF_TOKEN="):
                token = line.split("=", 1)[1].strip().strip('"').strip("'")
                if token:
                    return token
    return ""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="google/gemma-3-1b-it")
    ap.add_argument("--adapter", default="ml/models/persona-dpo")
    ap.add_argument("--output", default="ml/models/persona-merged")
    args = ap.parse_args()

    token = get_hf_token()
    if token:
        os.environ["HF_TOKEN"] = token

    tokenizer = AutoTokenizer.from_pretrained(args.base, token=token or None)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(args.base, torch_dtype=torch.bfloat16, device_map="cpu", token=token or None)
    model = PeftModel.from_pretrained(model, args.adapter)
    model = model.merge_and_unload()

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out, safe_serialization=True)
    tokenizer.save_pretrained(out)
    print(f"Merged model saved to {out} (~{(sum(f.stat().st_size for f in out.glob('*')) / 1e9):.2f} GB)")


if __name__ == "__main__":
    main()
