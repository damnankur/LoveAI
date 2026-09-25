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
from peft import LoraConfig, PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from trl import DPOTrainer, DPOConfig

BASE_MODEL = "google/gemma-3-1b-it"


def load_rows(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def to_text(messages: list[dict]) -> str:
    return tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)


def restore_fp32_adapters(trainer) -> int:
    """Undo TRL's QLoRA bf16 adapter cast when training in fp16.

    TRL's DPOTrainer casts every trainable (adapter) tensor of a *quantized* model to
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
        bnb_4bit_quant_storage=compute_dtype(),
        bnb_4bit_use_double_quant=True,
    )

    # Two modes:
    #  - `--model <SFT adapter dir>`: continue training the *existing* adapter. Passing a
    #    PeftModel + peft_config to DPOTrainer wraps the model a second time, which silently
    #    trains a brand-new adapter (with peft's default q_proj/v_proj targets) and drops the
    #    SFT weights on the floor. Instead we attach the SFT adapter and let TRL clone it into
    #    a frozen "ref" adapter (its documented PEFT path).
    #  - `--model <base model id>`: fresh LoRA on the base model.
    model_dir = Path(args.model)
    adapter_config_path = model_dir / "adapter_config.json" if model_dir.is_dir() else None
    continuing_adapter = bool(adapter_config_path and adapter_config_path.exists())
    if continuing_adapter:
        base_id = json.loads(adapter_config_path.read_text(encoding="utf-8")).get("base_model_name_or_path") or BASE_MODEL
        print(f"Continuing from SFT adapter {model_dir} (base: {base_id})")
        base = AutoModelForCausalLM.from_pretrained(
            base_id, quantization_config=bnb, device_map="auto", dtype=compute_dtype(), trust_remote_code=True
        )
        model = PeftModel.from_pretrained(base, str(model_dir), is_trainable=True)
        lora = None
    else:
        model = AutoModelForCausalLM.from_pretrained(
            args.model, quantization_config=bnb, device_map="auto", dtype=compute_dtype(), trust_remote_code=True
        )
        lora = LoraConfig(
            r=16,
            lora_alpha=32,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        )
    ref_model = None  # DPOTrainer will create the reference adapter from the model above
    tokenizer = AutoTokenizer.from_pretrained(
        str(model_dir) if continuing_adapter else args.model, trust_remote_code=True
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    if tokenizer.chat_template is None:
        tokenizer.chat_template = tokenizer.get_chat_template() if hasattr(tokenizer, "get_chat_template") else None

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
        report_to=[],
    )

    trainer = DPOTrainer(
        model=model,
        ref_model=ref_model,
        args=dpo_config,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        peft_config=lora,
        processing_class=tokenizer,
    )
    if compute_dtype() == torch.float16:
        restored = restore_fp32_adapters(trainer)
        print(f"fp16 path: restored {restored} adapter tensors to fp32 (TRL cast them to bf16)")
    trainer.train()
    trainer.save_model(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"Saved DPO adapter to {args.output}")


if __name__ == "__main__":
    main()
