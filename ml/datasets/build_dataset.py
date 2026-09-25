"""Persona dataset builder: synthetic templates + real conversational data.

Samples N synthetic trait profiles and produces:
  - ml/data/persona_sft_train.jsonl / persona_sft_val.jsonl  (messages for SFT)
  - ml/data/persona_dpo_train.jsonl / persona_dpo_val.jsonl  (prompt + chosen/rejected for DPO)
  - ml/data/persona_prompts.jsonl      (the sampled personas, for reuse downstream)
  - ml/data/dataset_report.json        (counts, sources, licenses, gate stats)
plus a 90/10 train/val split. Fully deterministic (seeded) so builds are
reproducible. Trait schema = shared/persona-matrix.json.

Two data paths
--------------
1. **Synthetic** (always on): rule-based replies from ``templates.py`` for the
   26 scenario prompts, over N sampled trait profiles. This is the "voice"
   corpus -- train format == serve format.
2. **Real** (``--real-data``): real conversations from ``real_sources.py``,
   normalised into the same schema, each one paired with a sampled persona
   system prompt. The real turn is the target, so the model learns real human
   empathy; the persona block teaches it to *wear the profile* while doing so.

Everything runs through one quality gate (length, crisis/clinical boilerplate,
assistant-text dedupe) and one seeded shuffle, so the split is reproducible.

Usage
-----
    python ml/datasets/build_dataset.py                          # synthetic only
    python ml/datasets/build_dataset.py --real-data              # + permissive-license sources
    python ml/datasets/build_dataset.py --real-data all          # + NC/unclear sources (research)
    python ml/datasets/build_dataset.py --real-data esconv,counsel_chat --real-limit 400
    python ml/datasets/build_dataset.py --list-real-sources
    python ml/datasets/build_dataset.py --out-dir kaggle/loveai-persona-data --real-data all

Notes / deliberate constraints
------------------------------
* Rows carry **only** the existing keys (``persona_id``/``messages``,
  ``persona_id``/``prompt``/``chosen``/``rejected``) so ``ml/train.py`` and
  ``ml/train_dpo.py`` keep working untouched. Per-row provenance is available
  via ``--with-provenance`` for analysis builds only.
* DPO prompts stay single-turn (system + one user message) because
  ``ml/train_dpo.py`` renders the prompt with ``add_generation_prompt=False``;
  multi-turn richness goes into the SFT rows instead.
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from persona_vector import build_vector, compute_profile  # noqa: E402
from real_sources import (  # noqa: E402
    DATASET_PROFILES,
    SOURCES,
    Dialogue,
    RealSource,
    load_source,
    resolve_sources,
    seed_for,
    source_table,
)
from templates import (  # noqa: E402
    PROMPT_THEMES,
    USER_PROMPTS,
    build_assistant_response,
    build_persona_text,
    build_rejected_response,
    detect_intent,
    load_matrix,
)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# --- quality gate ----------------------------------------------------------

# Rows that would teach the companion to answer a crisis or to sound like a
# clinic. loveAI is a companion, not a crisis service: crisis language is
# filtered out of training entirely (it belongs in a hand-authored safety set
# reviewed by humans, not scraped into an SFT corpus).
CRISIS_TERMS: tuple[str, ...] = (
    "suicide",
    "suicidal",
    "kill myself",
    "kill yourself",
    "self-harm",
    "self harm",
    "cut myself",
    "end my life",
    "want to die",
    "overdose",
    "988",
    "crisis line",
    "emergency services",
    "call 911",
)

# Clinical / deflection boilerplate: exactly the register the companion must NOT
# pick up from therapist-answer corpora.
CLINICAL_TERMS: tuple[str, ...] = (
    "as an ai",
    "i am an ai",
    "i'm an ai",
    "language model",
    "i am not a therapist",
    "i'm not a therapist",
    "licensed therapist",
    "seek professional help",
    "seek help from a professional",
    "consult a professional",
    "speak to a professional",
    "medical advice",
    "prescrib",
    "medication",
    "diagnos",
    "psychiatr",
    "dsm-",
    "dsm 5",
    "intake form",
    "insurance",
    "copay",
    "hotline",
    "helpline",
)

MIN_USER_WORDS = 2
MIN_ASSISTANT_WORDS = 4
MIN_DIALOGUE_WORDS = 12
MAX_WORDS = 220  # per turn; long-form sources (counselling answers) run to ~200
MAX_ROW_WORDS = 700  # whole training row (system persona + context + target)


def _word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z']+", text))


def gate_text(
    text: str,
    *,
    min_words: int = MIN_USER_WORDS,
    max_words: int = MAX_WORDS,
    check_register: bool = True,
) -> bool:
    """Length (and optionally register) gate for a single utterance."""
    words = _word_count(text)
    if words < min_words or words > max_words:
        return False
    if not check_register:
        return True
    lowered = text.lower()
    return not any(term in lowered for term in CLINICAL_TERMS)


def gate_dialogue(dialogue: Dialogue) -> bool:
    """Dialogue-level gate: is this conversation usable *at all*?

    Only structural / safety / length properties -- a single weak turn must not
    throw away an otherwise good conversation, so per-turn requirements live in
    ``gate_row`` (applied when a row is actually emitted).
    """
    turns = dialogue.turns
    if len(turns) < 2 or turns[0][0] != "user":
        return False
    blob = " ".join(content for _, content in turns).lower()
    if any(term in blob for term in CRISIS_TERMS):
        return False
    if sum(_word_count(content) for _, content in turns) < MIN_DIALOGUE_WORDS:
        return False
    return all(_word_count(content) <= MAX_WORDS for _, content in turns)


def gate_row(messages: list[dict]) -> bool:
    """Row-level gate: exactly what gets trained on.

    The assistant message(s) are the target -- they must be substantive and free
    of clinical/deflection register. User turns only have to be real utterances.
    """
    if sum(_word_count(m["content"]) for m in messages) > MAX_ROW_WORDS:
        return False
    for message in messages:
        role, content = message["role"], message["content"]
        if role == "system":
            continue
        if not gate_text(content, min_words=MIN_ASSISTANT_WORDS if role == "assistant" else MIN_USER_WORDS):
            return False
        if any(term in content.lower() for term in CRISIS_TERMS):
            return False
    return True


# --- personas --------------------------------------------------------------

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


def sample_personas(matrix: dict, rng: random.Random, n: int) -> list[dict]:
    """N persona profiles as ``{persona_id, scores, persona_text}``.

    One call produces the pool used by *both* the synthetic rows (one persona
    each) and the real rows (a random persona per conversation), which is what
    makes the real-data path learn "hold this profile while responding".
    """
    personas = []
    for i in range(n):
        scores = sample_trait_scores(matrix, rng)
        personas.append({"persona_id": i, "scores": scores, "persona_text": build_persona_text(scores)})
    return personas


# --- synthetic path --------------------------------------------------------

def build_sft(persona: dict, rng: random.Random) -> list[dict]:
    scores = persona["scores"]
    return [
        {
            "persona_id": persona["persona_id"],
            "messages": [
                {"role": "system", "content": persona["persona_text"]},
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": build_assistant_response(prompt, scores, rng)},
            ],
        }
        for prompt in USER_PROMPTS
    ]


def build_dpo(persona: dict, rng: random.Random) -> list[dict]:
    scores = persona["scores"]
    records = []
    for prompt in USER_PROMPTS:
        chosen, rejected = _contrast(prompt, scores, rng)
        if chosen is None:
            continue
        records.append(
            {
                "persona_id": persona["persona_id"],
                "prompt": [
                    {"role": "system", "content": persona["persona_text"]},
                    {"role": "user", "content": prompt},
                ],
                "chosen": [{"role": "assistant", "content": chosen}],
                "rejected": [{"role": "assistant", "content": rejected}],
            }
        )
    return records


def _contrast(prompt: str, scores: dict[str, float], rng: random.Random) -> tuple[str | None, str | None]:
    """Persona-aligned vs persona-mismatched reply, retried so pairs are never identical."""
    for _ in range(4):
        chosen = build_assistant_response(prompt, scores, rng)
        rejected = build_rejected_response(prompt, scores, rng)
        if chosen != rejected:
            return chosen, rejected
    return None, None


# --- real path -------------------------------------------------------------

def load_real_dialogues(
    sources: list[RealSource],
    limit_per_source: int,
    seed: int,
    cache_dir: Path | None = None,
    refresh: bool = False,
) -> tuple[list[Dialogue], dict[str, dict]]:
    """Load + normalise + gate real dialogues from every selected source.

    Returns ``(dialogues, per_source_stats)`` so the report can attribute rows
    and the caller can cap/downsample proportionally.
    """
    dialogues: list[Dialogue] = []
    stats: dict[str, dict] = {}
    for src in sources:
        try:
            raw = load_source(src, limit=limit_per_source, seed=seed, cache_dir=cache_dir, refresh=refresh)
        except SystemExit as exc:
            print(f"  ! {src.name}: {exc}", file=sys.stderr)
            stats[src.name] = {"loaded": 0, "kept": 0, "error": str(exc)[:200]}
            continue
        kept = [d for d in raw if gate_dialogue(d)]
        stats[src.name] = {"loaded": len(raw), "kept": len(kept)}
        print(f"  {src.name}: loaded {len(raw)} dialogues -> {len(kept)} passed the gate")
        dialogues.extend(kept)
    return dialogues, stats


def _window(turns: list[tuple[str, str]], end: int, max_messages: int) -> list[dict]:
    """Chat messages ending at ``turns[end]`` (exclusive), starting on a user turn."""
    start = max(0, end - max_messages)
    while start < end and turns[start][0] != "user":
        start += 1
    return [{"role": role, "content": content} for role, content in turns[start:end]]


def build_sft_from_real(
    dialogues: list[Dialogue],
    personas: list[dict],
    rng: random.Random,
    max_messages: int = 6,
) -> list[tuple[str, dict]]:
    """Every assistant turn becomes an SFT row, with the real conversation up to
    that point as context. Multi-turn by construction: teaches context memory.
    Returns ``(source, row)`` pairs so the caller can attribute + cap rows.
    """
    rows: list[tuple[str, dict]] = []
    seen: set[str] = set()
    for dialogue in dialogues:
        persona = rng.choice(personas)
        for i, (role, content) in enumerate(dialogue.turns):
            if role != "assistant" or i == 0:
                continue
            key = content[:200].lower()
            if key in seen:
                continue
            context = _window(dialogue.turns, i, max_messages)
            if not context or context[0]["role"] != "user":
                continue
            messages = [
                {"role": "system", "content": persona["persona_text"]},
                *context,
                {"role": "assistant", "content": content},
            ]
            if not gate_row(messages):
                continue
            seen.add(key)
            rows.append((dialogue.source, {"persona_id": persona["persona_id"], "messages": messages}))
    return rows


def build_dpo_from_real(
    dialogues: list[Dialogue],
    personas: list[dict],
    rng: random.Random,
) -> list[tuple[str, dict]]:
    """DPO pairs from real data.

    Real preference labels (``relationship_advice``) are used as-is when both
    sides pass the gate; otherwise the pair contrasts a persona-aligned reply
    with a persona-mismatched one for the same real user turn.
    """
    rows: list[tuple[str, dict]] = []
    for dialogue in dialogues:
        persona = rng.choice(personas)
        scores = persona["scores"]
        user_turns = [content for role, content in dialogue.turns if role == "user"]
        if not user_turns:
            continue
        prompt_text = user_turns[-1]
        system = {"role": "system", "content": persona["persona_text"]}

        if dialogue.chosen and dialogue.rejected and gate_text(
            dialogue.chosen, min_words=MIN_ASSISTANT_WORDS
        ) and gate_text(dialogue.rejected, min_words=MIN_ASSISTANT_WORDS):
            chosen, rejected = dialogue.chosen, dialogue.rejected
        else:
            chosen, rejected = _contrast(prompt_text, scores, rng)
            if chosen is None:
                continue
        row = {
            "persona_id": persona["persona_id"],
            "prompt": [system, {"role": "user", "content": prompt_text}],
            "chosen": [{"role": "assistant", "content": chosen}],
            "rejected": [{"role": "assistant", "content": rejected}],
        }
        # Chosen side must clear the row gate; the rejected side is a deliberate
        # negative example (our own templates), so only length is checked.
        if not gate_row(row["prompt"][1:] + [row["chosen"][0]]):
            continue
        if _word_count(rejected) < MIN_ASSISTANT_WORDS:
            continue
        rows.append((dialogue.source, row))
    return rows


def cap_proportionally(rows: list[tuple[str, dict]], cap: int, rng: random.Random) -> list[tuple[str, dict]]:
    """Downsample to ``cap`` rows while keeping every source's share."""
    if cap <= 0 or len(rows) <= cap:
        return list(rows)
    groups: dict[str, list[tuple[str, dict]]] = {}
    for row in rows:
        groups.setdefault(row[0], []).append(row)

    total = len(rows)
    quotas = {name: int(len(group) / total * cap) for name, group in groups.items()}
    # Hand out the leftover slots to the largest fractional parts.
    remainder = cap - sum(quotas.values())
    for name, _ in sorted(groups.items(), key=lambda kv: (len(kv[1]) / total * cap) % 1, reverse=True)[:remainder]:
        quotas[name] += 1

    out: list[tuple[str, dict]] = []
    for name, group in groups.items():
        quota = min(quotas.get(name, 0), len(group))
        out.extend(group if quota == len(group) else rng.sample(group, quota))
    return out


# --- io --------------------------------------------------------------------

def dump(rows: list[dict], path: Path) -> None:
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")


def dump_personas(personas: list[dict], path: Path) -> None:
    with path.open("w", encoding="utf-8") as f:
        for persona in personas:
            f.write(json.dumps(persona) + "\n")


def _counts_by_source(rows: list[tuple[str, dict]]) -> dict[str, int]:
    out: dict[str, int] = {}
    for source, _ in rows:
        out[source] = out.get(source, 0) + 1
    return dict(sorted(out.items()))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--n", type=int, default=200, help="number of synthetic persona profiles")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out-dir", type=Path, default=DATA_DIR)
    ap.add_argument(
        "--real-data",
        nargs="?",
        const="permissive",
        default=None,
        metavar="SELECTOR",
        help="merge real dialogues: 'permissive' (default), 'noncommercial', 'unclear', 'all', "
        "or a comma-separated source list. Omit to build synthetic data only.",
    )
    ap.add_argument("--real-limit", type=int, default=800, help="max dialogues loaded per source")
    ap.add_argument(
        "--real-max-fraction",
        type=float,
        default=0.6,
        help="cap real rows at this fraction of the synthetic row count (0 disables real data)",
    )
    ap.add_argument("--real-cache-dir", type=Path, default=None, help="optional dir for normalised dialogue caches")
    ap.add_argument("--real-refresh", action="store_true", help="ignore an existing cache and re-download")
    ap.add_argument("--max-messages", type=int, default=6, help="context window for real multi-turn SFT rows")
    ap.add_argument("--with-provenance", action="store_true", help="add per-row 'source'/'real' keys (analysis builds only)")
    ap.add_argument("--list-real-sources", action="store_true", help="print the dataset registry and exit")
    args = ap.parse_args()

    if args.list_real_sources:
        print(source_table())
        return

    matrix = load_matrix()
    rng = random.Random(args.seed)
    out_dir: Path = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    personas = sample_personas(matrix, rng, args.n)

    # Sanity: persona 0 must round-trip through the questionnaire -> vector path.
    answers = sample_answers(matrix, personas[0]["scores"], rng)
    vec = build_vector(compute_profile(matrix, answers), matrix["vector"]["dim"], matrix["vector"]["seed"])
    assert len(vec) == matrix["vector"]["dim"], "vector dim mismatch"
    print(f"Sanity: persona 0 vector dim={len(vec)}")

    # --- synthetic ---
    sft_pairs: list[tuple[str, dict]] = []
    dpo_pairs: list[tuple[str, dict]] = []
    for persona in personas:
        sft_pairs.extend(("synthetic", row) for row in build_sft(persona, rng))
        dpo_pairs.extend(("synthetic", row) for row in build_dpo(persona, rng))
    n_synth_sft, n_synth_dpo = len(sft_pairs), len(dpo_pairs)
    print(
        f"Synthetic: {n_synth_sft} SFT rows ({len(personas)} personas x {len(USER_PROMPTS)} prompts) | "
        f"{n_synth_dpo} DPO pairs"
    )

    # --- real ---
    real_report: list[dict] = []
    real_sft: list[tuple[str, dict]] = []
    real_dpo: list[tuple[str, dict]] = []
    if args.real_data:
        sources = resolve_sources(args.real_data)
        print(f"Real data: {len(sources)} source(s) from selector '{args.real_data}'")
        dialogues, stats = load_real_dialogues(
            sources,
            limit_per_source=args.real_limit,
            seed=args.seed,
            cache_dir=args.real_cache_dir,
            refresh=args.real_refresh,
        )

        real_sft = build_sft_from_real(dialogues, personas, rng, max_messages=args.max_messages)
        real_dpo = build_dpo_from_real(dialogues, personas, rng)

        cap_sft = int(args.real_max_fraction * n_synth_sft)
        cap_dpo = int(args.real_max_fraction * n_synth_dpo)
        real_sft = cap_proportionally(real_sft, cap_sft, rng)
        real_dpo = cap_proportionally(real_dpo, cap_dpo, rng)

        sft_pairs.extend(real_sft)
        dpo_pairs.extend(real_dpo)
        print(
            f"Real: {len(real_sft)} SFT rows (cap {cap_sft}) | {len(real_dpo)} DPO pairs (cap {cap_dpo}) "
            f"from {len(dialogues)} dialogues"
        )

        for src in sources:
            s = stats.get(src.name, {})
            real_report.append(
                {
                    "name": src.name,
                    "hf_id": src.hf_id,
                    "url": src.url,
                    "license": src.license,
                    "license_class": src.license_class,
                    "dialogues_loaded": s.get("loaded", 0),
                    "dialogues_kept": s.get("kept", 0),
                    "sft_rows": sum(1 for name, _ in real_sft if name == src.name),
                    "dpo_pairs": sum(1 for name, _ in real_dpo if name == src.name),
                    "notes": src.notes,
                }
            )

    # --- shuffle + split ---
    if args.with_provenance:
        for source, row in sft_pairs:
            row["source"], row["real"] = source, source != "synthetic"
        for source, row in dpo_pairs:
            row["source"], row["real"] = source, source != "synthetic"

    rng.shuffle(sft_pairs)
    rng.shuffle(dpo_pairs)
    s = int(0.9 * len(sft_pairs))
    d = int(0.9 * len(dpo_pairs))

    sft_rows = [row for _, row in sft_pairs]
    dpo_rows = [row for _, row in dpo_pairs]

    dump(sft_rows[:s], out_dir / "persona_sft_train.jsonl")
    dump(sft_rows[s:], out_dir / "persona_sft_val.jsonl")
    dump(dpo_rows[:d], out_dir / "persona_dpo_train.jsonl")
    dump(dpo_rows[d:], out_dir / "persona_dpo_val.jsonl")
    dump_personas(personas, out_dir / "persona_prompts.jsonl")

    report = {
        "seed": args.seed,
        "personas": len(personas),
        "user_prompts": len(USER_PROMPTS),
        "prompt_themes": {theme: [USER_PROMPTS[i] for i in idx] for theme, idx in PROMPT_THEMES.items()},
        "scenarios": sorted({detect_intent(p).intent for p in USER_PROMPTS}),
        "sft": {
            "total": len(sft_rows),
            "train": s,
            "val": len(sft_rows) - s,
            "synthetic": n_synth_sft,
            "real": len(sft_pairs) - n_synth_sft,
            "real_by_source": _counts_by_source(real_sft),
        },
        "dpo": {
            "total": len(dpo_rows),
            "train": d,
            "val": len(dpo_rows) - d,
            "synthetic": n_synth_dpo,
            "real": len(dpo_pairs) - n_synth_dpo,
            "real_by_source": _counts_by_source(real_dpo),
        },
        "real_data_selector": args.real_data,
        "real_limit_per_source": args.real_limit,
        "real_max_fraction": args.real_max_fraction,
        "quality_gate": {
            "dialogue_level": ["starts with a user turn", "no crisis terms anywhere", f"dialogue >= {MIN_DIALOGUE_WORDS} words"],
            "row_level": [
                f"assistant target >= {MIN_ASSISTANT_WORDS} words",
                f"user turns >= {MIN_USER_WORDS} words",
                f"no turn > {MAX_WORDS} words",
                f"no row > {MAX_ROW_WORDS} words",
                "no clinical/deflection register in assistant text",
            ],
            "min_user_words": MIN_USER_WORDS,
            "min_assistant_words": MIN_ASSISTANT_WORDS,
            "min_dialogue_words": MIN_DIALOGUE_WORDS,
            "max_words_per_turn": MAX_WORDS,
            "max_words_per_row": MAX_ROW_WORDS,
            "crisis_terms": list(CRISIS_TERMS),
            "clinical_terms": list(CLINICAL_TERMS),
        },
        "real_sources": real_report,
        "real_source_registry": [
            {
                "name": s.name,
                "hf_id": s.hf_id,
                "url": s.url,
                "license": s.license,
                "license_class": s.license_class,
                "approx_dialogues": s.approx_dialogues,
                "format": s.format,
                "maps_to": s.maps_to,
                "themes": list(s.themes),
                "used_in_this_build": any(r["name"] == s.name for r in real_report),
                "notes": s.notes,
            }
            for s in SOURCES
        ],
        "real_profiles_available": {name: list(members) for name, members in DATASET_PROFILES.items()},
        "provenance_keys_in_rows": args.with_provenance,
    }
    (out_dir / "dataset_report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(
        f"SFT train={s} val={len(sft_rows) - s} (real {len(sft_pairs) - n_synth_sft}) | "
        f"DPO train={d} val={len(dpo_rows) - d} (real {len(dpo_pairs) - n_synth_dpo})"
    )
    print(f"Wrote: {out_dir}")


if __name__ == "__main__":
    main()
