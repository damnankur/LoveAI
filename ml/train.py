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

MODEL = "google/gemma-3-1b-it"


def load_rows(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def restore_fp32_adapters(trainer) -> int:
    """Undo TRL's QLoRA bf16 adapter cast when training in fp16.

    TRL's SFTTrainer casts every trainable (adapter) tensor of a *quantized* model to
    bfloat16 (QLoRA paper, sect. 3). Ampere+ wants that; Turing (GTX 1650 Ti, sm_75) has
    no native bf16, and torch's fp16 AMP GradScaler refuses to unscale bf16 grads
    ("_amp_foreach_non_finite_check_and_unscale_cuda not implemented for 'BFloat16'").
    Restoring fp32 master weights (peft's autocast_adapter_dtype default) fixes it.
    """
    restored = 0
    for param in trainer.model.parameters():
        if param.requires_grad and param.dtype == torch.bfloat16:
            param.data = param.data.to(torch.float32)
            restored += 1
    return restored


def compute_dtype() -> torch.dtype:
    """bf16 only on Ampere+; Turing (GTX 1650 Ti, sm_75) falls back to fp16.

    Do not use the bare ``torch.cuda.is_bf16_supported()``: it defaults to
    ``including_emulation=True`` and reports True on sm_75, where bf16 matmuls are
    emulated (slow) even though the card has no native bf16 support.
    """
    if not torch.cuda.is_available():
        return torch.float32
    try:
        native_bf16 = torch.cuda.is_bf16_supported(including_emulation=False)
    except TypeError:  # torch < 2.3 has no including_emulation kwarg
        native_bf16 = torch.cuda.get_device_capability()[0] >= 8
    return torch.bfloat16 if native_bf16 else torch.float16


def main() -> None:
    import os
    sm_train = os.environ.get("SM_CHANNEL_TRAIN")
    sm_val = os.environ.get("SM_CHANNEL_VAL", sm_train)
    sm_model_dir = os.environ.get("SM_MODEL_DIR")

    data_default = os.path.join(sm_train, "persona_sft_train.jsonl") if sm_train else "ml/data/persona_sft_train.jsonl"
    val_default = os.path.join(sm_val, "persona_sft_val.jsonl") if sm_val else "ml/data/persona_sft_val.jsonl"
    out_default = sm_model_dir if sm_model_dir else "ml/models/persona-sft"

    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--data", default=data_default)
    ap.add_argument("--val", default=val_default)
    ap.add_argument("--output", default=out_default)
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
        bnb_4bit_quant_storage=compute_dtype(),
        bnb_4bit_use_double_quant=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        args.model, quantization_config=bnb, device_map="auto", torch_dtype=compute_dtype(), trust_remote_code=True
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
        max_length=512,
        report_to=[],
        remove_unused_columns=False,
        dataset_text_field="text",
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        processing_class=tokenizer,
    )
    if compute_dtype() == torch.float16:
        restored = restore_fp32_adapters(trainer)
        print(f"fp16 path: restored {restored} adapter tensors to fp32 (TRL cast them to bf16)")
    trainer.train()
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"Saved SFT adapter to {args.output}")


if __name__ == "__main__":
    main()
