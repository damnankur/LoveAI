"""DPO training for persona-aligned emotional responses (TRL DPOTrainer).

Continues from the SFT adapter so the model learns to prefer persona-aligned
replies over generic/mismatched ones.

Usage:
    python ml/train_dpo.py --data ml/data/persona_dpo_train.jsonl --model ml/models/persona-sft --output ml/models/persona-dpo
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from datasets import Dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import DPOTrainer, DPOConfig

BASE_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"


def load_rows(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def to_text(messages: list[dict]) -> str:
    return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)


def compute_dtype() -> torch.dtype:
    """bf16 needs Ampere+; the GTX 1650 Ti (Turing, sm_75) uses fp16."""
    if torch.cuda.is_available():
        major = torch.cuda.get_device_capability()[0]
        return torch.bfloat16 if major >= 8 else torch.float16
    return torch.float32


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=BASE_MODEL, help="Base model or SFT adapter dir")
    ap.add_argument("--data", default="ml/data/persona_dpo_train.jsonl")
    ap.add_argument("--val", default="ml/data/persona_dpo_val.jsonl")
    ap.add_argument("--output", default="ml/models/persona-dpo")
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--beta", type=float, default=0.1)
    args = ap.parse_args()

    global tokenizer
    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=compute_dtype(),
        bnb_4bit_use_double_quant=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    if tokenizer.chat_template is None:
        tokenizer.chat_template = tokenizer.get_chat_template() if hasattr(tokenizer, "get_chat_template") else None

    model = AutoModelForCausalLM.from_pretrained(
        args.model, quantization_config=bnb, device_map="auto", trust_remote_code=True
    )
    ref_model = None  # DPOTrainer will create the reference from the base model

    def build_ds(path: Path) -> Dataset:
        ds = Dataset.from_list(load_rows(path))
        return ds.map(
            lambda r: {
                "prompt": to_text(r["prompt"]),
                "chosen": to_text(r["chosen"]),
                "rejected": to_text(r["rejected"]),
            },
            remove_columns=["persona_id", "prompt", "chosen", "rejected"],
        )

    train_ds = build_ds(Path(args.data))
    val_ds = build_ds(Path(args.val))

    lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM")
    dpo_config = DPOConfig(
        output_dir=args.output,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=args.lr,
        beta=args.beta,
        warmup_steps=20,
        logging_steps=10,
        eval_strategy="steps",
        eval_steps=200,
        save_strategy="epoch",
        bf16=compute_dtype() == torch.bfloat16,
        fp16=compute_dtype() == torch.float16,
        max_length=1024,
        max_prompt_length=512,
        report_to=[],
    )

    trainer = DPOTrainer(
        model=model,
        ref_model=ref_model,
        args=dpo_config,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        peft_config=lora,
        tokenizer=tokenizer,
    )
    trainer.train()
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"Saved DPO adapter to {args.output}")


if __name__ == "__main__":
    main()
