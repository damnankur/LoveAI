"""QLoRA SFT training for the persona chatbot (TRL SFTTrainer).

Usage:
    python ml/train.py --data ml/data/persona_sft_train.jsonl --output ml/models/persona-sft
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from datasets import Dataset
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import SFTTrainer, SFTConfig

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"


def load_rows(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def compute_dtype() -> torch.dtype:
    """bf16 needs Ampere+; the GTX 1650 Ti (Turing, sm_75) uses fp16."""
    if torch.cuda.is_available():
        major = torch.cuda.get_device_capability()[0]
        return torch.bfloat16 if major >= 8 else torch.float16
    return torch.float32


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--data", default="ml/data/persona_sft_train.jsonl")
    ap.add_argument("--val", default="ml/data/persona_sft_val.jsonl")
    ap.add_argument("--output", default="ml/models/persona-sft")
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--alpha", type=int, default=32)
    args = ap.parse_args()

    data_path = Path(args.data)
    val_path = Path(args.val)

    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=compute_dtype(),
        bnb_4bit_use_double_quant=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        args.model, quantization_config=bnb, device_map="auto", trust_remote_code=True
    )
    model = prepare_model_for_kbit_training(model)
    lora = LoraConfig(
        r=args.rank,
        lora_alpha=args.alpha,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora)
    model.print_trainable_parameters()

    def format_chat(row: dict) -> str:
        return tokenizer.apply_chat_template(row["messages"], tokenize=False, add_generation_prompt=False)

    train_ds = Dataset.from_list(load_rows(data_path)).map(lambda r: {"text": format_chat(r)})
    val_ds = Dataset.from_list(load_rows(val_path)).map(lambda r: {"text": format_chat(r)})

    sft_config = SFTConfig(
        output_dir=args.output,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=8,
        learning_rate=args.lr,
        warmup_steps=20,
        logging_steps=10,
        eval_strategy="steps",
        eval_steps=200,
        save_strategy="epoch",
        bf16=compute_dtype() == torch.bfloat16,
        fp16=compute_dtype() == torch.float16,
        max_seq_length=1024,
        report_to=[],
        remove_unused_columns=False,
        dataset_text_field="text",
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
    )
    trainer.train()
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"Saved SFT adapter to {args.output}")


if __name__ == "__main__":
    main()
