"""Synthetic persona dataset builder.

Samples N synthetic trait profiles and produces:
  - ml/data/persona_sft_train.jsonl / persona_sft_val.jsonl  (messages for SFT)
  - ml/data/persona_dpo_train.jsonl / persona_dpo_val.jsonl  (prompt + chosen/rejected for DPO)
plus a 90/10 train/val split. Fully deterministic (seeded) so builds are
reproducible. Trait schema = shared/persona-matrix.json.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from persona_vector import build_vector, compute_profile  # noqa: E402
from templates import USER_PROMPTS, build_assistant_response, build_persona_text, build_rejected_response, load_matrix  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def sample_trait_scores(matrix: dict, rng: random.Random) -> dict[str, float]:
    return {
        t: round(rng.betavariate(3, 3) if rng.random() > 0.15 else rng.random(), 4)
        for t in matrix["trait_order"]
    }


def sample_answers(matrix: dict, scores: dict[str, float], rng: random.Random) -> dict[str, int]:
    """Invert trait scores back to Likert responses (reverse-aware) so the
    stored responses round-trip to the same profile via compute_profile."""
    lo, hi = matrix["scale"]["min"], matrix["scale"]["max"]
    answers: dict[str, int] = {}
    for cat in matrix["categories"]:
        for trait in cat["traits"]:
            s = scores[trait["id"]]
            for q in trait["questions"]:
                raw = int(round(lo + s * (hi - lo)))
                if q["reverse"]:
                    raw = hi + lo - raw
                answers[q["id"]] = min(hi, max(lo, raw + rng.choice([-1, 0, 0, 0, 1])))
    return answers


def build_sft(scores: dict[str, float], rng: random.Random, persona_index: int) -> list[dict]:
    persona = build_persona_text(scores)
    return [
        {
            "persona_id": persona_index,
            "messages": [
                {"role": "system", "content": persona},
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": build_assistant_response(prompt, scores, rng)},
            ],
        }
        for prompt in USER_PROMPTS
    ]


def build_dpo(scores: dict[str, float], rng: random.Random, persona_index: int) -> list[dict]:
    persona = build_persona_text(scores)
    records = []
    for prompt in USER_PROMPTS:
        chosen = build_assistant_response(prompt, scores, rng)
        rejected = build_rejected_response(prompt, scores, rng)
        if chosen == rejected:
            continue
        records.append({
            "persona_id": persona_index,
            "prompt": [
                {"role": "system", "content": persona},
                {"role": "user", "content": prompt},
            ],
            "chosen": [{"role": "assistant", "content": chosen}],
            "rejected": [{"role": "assistant", "content": rejected}],
        })
    return records


def dump(rows: list[dict], path: Path) -> None:
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    matrix = load_matrix()
    rng = random.Random(args.seed)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    sft_all: list[dict] = []
    dpo_all: list[dict] = []
    for p in range(args.n):
        scores = sample_trait_scores(matrix, rng)
        answers = sample_answers(matrix, scores, rng)
        sft_all.extend(build_sft(scores, rng, p))
        dpo_all.extend(build_dpo(scores, rng, p))
        if p == 0:
            vec = build_vector(compute_profile(matrix, answers), matrix["vector"]["dim"], matrix["vector"]["seed"])
            assert len(vec) == matrix["vector"]["dim"], "vector dim mismatch"
            print(f"Sanity: persona 0 vector dim={len(vec)}")

    rng.shuffle(sft_all)
    rng.shuffle(dpo_all)
    s = int(0.9 * len(sft_all))
    d = int(0.9 * len(dpo_all))

    dump(sft_all[:s], DATA_DIR / "persona_sft_train.jsonl")
    dump(sft_all[s:], DATA_DIR / "persona_sft_val.jsonl")
    dump(dpo_all[:d], DATA_DIR / "persona_dpo_train.jsonl")
    dump(dpo_all[d:], DATA_DIR / "persona_dpo_val.jsonl")

    print(f"SFT train={s} val={len(sft_all) - s} | DPO train={d} val={len(dpo_all) - d}")


if __name__ == "__main__":
    main()
