"""Registry + normalizers for the real conversational datasets used to
supplement the synthetic loveAI persona data.

Each entry in ``SOURCES`` describes one upstream dataset (id, license, size,
format, what it maps to) and names an *adapter* -- a pure function that turns
one raw dataset row into a ``Dialogue``. ``build_dataset.py`` does the rest
(persona injection, SFT/DPO shaping, quality gate, splitting).

Why a separate module: the adapters are the only dataset-specific code in the
pipeline. Everything downstream is schema-stable, so adding a source means
adding one adapter + one registry entry, nothing else.

Licensing note (read before shipping a model trained on this)
------------------------------------------------------------
``license_class`` is the practical filter:

* ``permissive``    -- safe to use in a commercial product (Apache-2.0/MIT/CC-BY)
* ``noncommercial`` -- CC-BY-NC family: fine for research, NOT for a paid product
* ``unclear``       -- no explicit license upstream; treat as "ask a lawyer" and
                       keep out of the default build

``DATASET_PROFILES`` picks the default sets so the choice is explicit on the
command line rather than buried in code.
"""
from __future__ import annotations

import hashlib
import itertools
import json
import random
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

Role = str  # "user" | "assistant"


@dataclass
class Dialogue:
    """One normalised conversation.

    ``turns`` alternates user/assistant (consecutive same-role turns are merged).
    ``chosen``/``rejected`` are only set by sources that ship a genuine
    preference annotation (they become real DPO pairs).
    ``meta`` carries source-side labels (emotion, support strategy, topic).
    """

    source: str
    turns: list[tuple[Role, str]]
    chosen: str | None = None
    rejected: str | None = None
    meta: dict = field(default_factory=dict)


@dataclass(frozen=True)
class RealSource:
    name: str
    hf_id: str
    adapter: str
    license: str
    license_class: str  # permissive | noncommercial | unclear
    url: str
    approx_dialogues: int
    format: str
    maps_to: str
    themes: tuple[str, ...]
    splits: tuple[str, ...] = ("train",)
    hf_config: str | None = None
    kind: str = "sft"  # sft | sft+dpo | dpo
    notes: str = ""
    stream: bool = False  # huge corpora: stream + bounded shuffle instead of downloading


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_WS = re.compile(r"\s+")


def _clean(text: object) -> str:
    if not isinstance(text, str):
        return ""
    return _WS.sub(" ", text.replace("\u00a0", " ")).strip()


def _merge_consecutive(turns: list[tuple[Role, str]]) -> list[tuple[Role, str]]:
    merged: list[tuple[Role, str]] = []
    for role, content in turns:
        content = _clean(content)
        if not content:
            continue
        if merged and merged[-1][0] == role:
            merged[-1] = (role, f"{merged[-1][1]} {content}".strip())
        else:
            merged.append((role, content))
    return merged


def _trim_weak_edges(turns: list[tuple[Role, str]]) -> list[tuple[Role, str]]:
    """Drop greeting-only turns at the edges ('Hi!', 'Thanks!') so a chatty
    opener does not disqualify an otherwise good conversation. Minimum lengths
    are enforced properly by the quality gate in build_dataset.py."""
    while turns and len(turns[0][1].split()) < 2:
        turns = turns[1:]
    while turns and len(turns[-1][1].split()) < 2:
        turns = turns[:-1]
    return turns


def _finish(source: str, turns: list[tuple[Role, str]], **kw) -> Dialogue | None:
    turns = _trim_weak_edges(_merge_consecutive(turns))
    if len(turns) < 2 or turns[0][0] != "user":
        return None
    if not any(r == "assistant" for r, _ in turns):
        return None
    return Dialogue(source=source, turns=turns, **kw)


def _role_of(speaker: str) -> Role:
    s = (speaker or "").lower()
    return "user" if s in {"usr", "user", "seeker", "patient", "human", "speaker_0", "0"} else "assistant"


# ---------------------------------------------------------------------------
# Adapters: raw row -> Dialogue
# ---------------------------------------------------------------------------

def norm_empathetic_dialogues(row: dict) -> Dialogue | None:
    """Estwld/empathetic_dialogues_llm: already OpenAI-format conversations."""
    convo = row.get("conversations") or []
    turns = [(("user" if m.get("role") == "user" else "assistant"), m.get("content", "")) for m in convo]
    return _finish(
        "empathetic_dialogues",
        turns,
        meta={"emotion": _clean(row.get("emotion")), "situation": _clean(row.get("situation"))},
    )


def norm_esconv(row: dict) -> Dialogue | None:
    """thu-coai/esconv: single `text` column holding the ESConv record JSON.

    dialog: [{"text": ..., "speaker": "usr"|"sys", "strategy": ...}]
    """
    raw = row.get("text")
    if not isinstance(raw, str):
        return None
    try:
        rec = json.loads(raw)
    except json.JSONDecodeError:
        return None
    dialog = rec.get("dialog") or []
    turns = [(_role_of(t.get("speaker", "sys")), t.get("text", "")) for t in dialog]
    strategies = [_clean(t.get("strategy")) for t in dialog if t.get("strategy")]
    return _finish(
        "esconv",
        turns,
        meta={
            "emotion": _clean(rec.get("emotion_type")),
            "problem": _clean(rec.get("problem_type")),
            "situation": _clean(rec.get("situation")),
            "strategies": ";".join(dict.fromkeys(strategies)),
        },
    )


def norm_counsel_chat(row: dict) -> Dialogue | None:
    """nbertagnolli/counsel-chat: questionText -> answerText (one Q/A per row)."""
    question = _clean(row.get("questionText")) or _clean(row.get("questionTitle"))
    answer = _clean(row.get("answerText"))
    if not question or not answer:
        return None
    return _finish(
        "counsel_chat",
        [("user", question), ("assistant", answer)],
        meta={"topic": _clean(row.get("topic"))},
    )


def norm_mental_health_therapy(row: dict) -> Dialogue | None:
    """fadodr/mental_health_therapy: instruction boilerplate + patient input -> answer."""
    question = _clean(row.get("input")) or _clean(row.get("instruction"))
    answer = _clean(row.get("output"))
    if not question or not answer:
        return None
    return _finish("mental_health_therapy", [("user", question), ("assistant", answer)])


def norm_therapy_multiturn(row: dict) -> Dialogue | None:
    """Abc7347/therapy-conversations-multiturn: messages already in chat format."""
    messages = row.get("messages") or []
    turns = [(("user" if m.get("role") == "user" else "assistant"), m.get("content", "")) for m in messages]
    return _finish("therapy_multiturn", turns)


def norm_synthetic_persona_chat(row: dict) -> Dialogue | None:
    """google/Synthetic-Persona-Chat: 'User 1: ...' diarised transcript."""
    convo = _clean(row.get("Best Generated Conversation"))
    if not convo:
        return None
    turns: list[tuple[Role, str]] = []
    for chunk in re.split(r"(?=User [12]:)", convo):
        chunk = chunk.strip()
        if not chunk:
            continue
        match = re.match(r"User ([12]):\s*(.*)", chunk, flags=re.S)
        if not match:
            continue
        speaker, text = match.group(1), match.group(2)
        # User 1 opens, so User 1 = the companion's conversational partner.
        turns.append(("user" if speaker == "1" else "assistant", text))
    return _finish(
        "synthetic_persona_chat",
        turns,
        meta={
            "user_persona": _clean(row.get("user 1 personas")),
            "partner_persona": _clean(row.get("user 2 personas")),
        },
    )


def norm_soda(row: dict) -> Dialogue | None:
    """allenai/soda: `dialogue` list, alternating speakers (starts with PersonX)."""
    dialogue = row.get("dialogue") or []
    turns = [("user" if i % 2 == 0 else "assistant", str(u)) for i, u in enumerate(dialogue)]
    return _finish("soda", turns, meta={"relation": _clean(row.get("relation"))})


def norm_relationship_advice(row: dict) -> Dialogue | None:
    """yonatanko/Relationship_Advice: reddit post + two human-ranked replies.

    Ships a genuine preference signal (`more_helpful_comment`), so this source
    produces real DPO pairs instead of template-contrasted ones.
    """
    post = _clean(row.get("post"))
    c1, c2 = _clean(row.get("comment_1")), _clean(row.get("comment_2"))
    if not post or not (c1 or c2):
        return None
    pick = _clean(row.get("more_helpful_comment")).lower().replace(" ", "_")
    chosen = rejected = None
    if c1 and c2:
        if "comment_1" in pick or pick == "1":
            chosen, rejected = c1, c2
        elif "comment_2" in pick or pick == "2":
            chosen, rejected = c2, c1
    if chosen is None and c1 and c2:
        chosen, rejected = c1, c2  # label unreadable -> fall back to column order
    answer = chosen or c1 or c2
    return _finish(
        "relationship_advice",
        [("user", post), ("assistant", answer)],
        chosen=chosen,
        rejected=rejected,
    )


ADAPTERS: dict[str, Callable[[dict], Dialogue | None]] = {
    "empathetic_dialogues": norm_empathetic_dialogues,
    "esconv": norm_esconv,
    "counsel_chat": norm_counsel_chat,
    "mental_health_therapy": norm_mental_health_therapy,
    "therapy_multiturn": norm_therapy_multiturn,
    "synthetic_persona_chat": norm_synthetic_persona_chat,
    "soda": norm_soda,
    "relationship_advice": norm_relationship_advice,
}


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

SOURCES: tuple[RealSource, ...] = (
    RealSource(
        name="empathetic_dialogues",
        hf_id="Estwld/empathetic_dialogues_llm",
        adapter="empathetic_dialogues",
        license="CC-BY-NC-4.0 (upstream EmpatheticDialogues; mirror is tagged Apache-2.0)",
        license_class="noncommercial",
        url="https://huggingface.co/datasets/Estwld/empathetic_dialogues_llm",
        approx_dialogues=24850,
        format="1 row = 1 conversation, `conversations` = [{role, content}], + emotion/situation",
        maps_to="SFT (multi-turn, system+user/assistant) + DPO",
        themes=("all 12 core themes", "everyday emotional disclosure", "situation-grounded empathy"),
        splits=("train", "valid", "validation"),
        kind="sft+dpo",
        notes=(
            "The standard empathy benchmark. Uses a parquet mirror because "
            "facebook/empathetic_dialogues is script-only and no longer loadable "
            "with datasets>=4. 32 emotion labels available for filtering."
        ),
    ),
    RealSource(
        name="esconv",
        hf_id="thu-coai/esconv",
        adapter="esconv",
        license="CC-BY-NC-4.0",
        license_class="noncommercial",
        url="https://huggingface.co/datasets/thu-coai/esconv",
        approx_dialogues=1300,
        format="1 row = JSON string: dialog[{text, speaker(usr/sys), strategy}], emotion_type, problem_type",
        maps_to="SFT (multi-turn) + DPO; strategy labels usable for eval",
        themes=("stress", "career crisis", "loneliness", "health worry", "relationships"),
        splits=("train", "validation", "test"),
        kind="sft+dpo",
        notes=(
            "Human-to-human emotional support with helping-skills strategy "
            "annotations (Question/Restatement/Reflection/Affirmation...). "
            "Closest register to the loveAI companion of anything public."
        ),
    ),
    RealSource(
        name="counsel_chat",
        hf_id="nbertagnolli/counsel-chat",
        adapter="counsel_chat",
        license="unclear (site-scraped; Kaggle copy listed CC0)",
        license_class="unclear",
        url="https://huggingface.co/datasets/nbertagnolli/counsel-chat",
        approx_dialogues=2775,
        format="1 row = 1 Q/A: questionText, answerText, topic (therapist answers)",
        maps_to="SFT (single-turn) + DPO",
        themes=("anxiety", "relationships", "self-esteem", "family", "trauma"),
        kind="sft+dpo",
        notes=(
            "Licensed-therapist answers: valuable realism on relationship topics, "
            "but the register is clinical, so the quality gate drops referral/"
            "diagnosis boilerplate before it reaches training."
        ),
    ),
    RealSource(
        name="synthetic_persona_chat",
        hf_id="google/Synthetic-Persona-Chat",
        adapter="synthetic_persona_chat",
        license="CC-BY-4.0",
        license_class="permissive",
        url="https://huggingface.co/datasets/google/Synthetic-Persona-Chat",
        approx_dialogues=10906,
        format="1 row = persona pair + 'User 1: ...' diarised conversation",
        maps_to="SFT (multi-turn) + DPO",
        themes=("everyday check-in", "small talk", "getting to know someone", "hobbies"),
        notes=(
            "Synthetic (LLM-generated, Google) but explicitly *persona-conditioned*: "
            "trains the model to hold a persona while chatting. Permissive license "
            "and it covers the small-talk gap the emotional corpora miss."
        ),
    ),
    RealSource(
        name="soda",
        hf_id="allenai/soda",
        adapter="soda",
        license="CC-BY-4.0",
        license_class="permissive",
        url="https://huggingface.co/datasets/allenai/soda",
        approx_dialogues=1489842,
        format="1 row = social dialogue (list of alternating utterances) + relation label",
        maps_to="SFT (multi-turn) + DPO",
        themes=("small talk", "everyday plans", "opinions", "light disagreement"),
        stream=True,
        notes=(
            "1.5M short social dialogues -- the antidote to a companion that can "
            "only respond to distress. Only a small sample is used (default 800) "
            "and it is streamed with a bounded shuffle rather than downloaded "
            "(the train parquet is ~700 MB)."
        ),
    ),
    RealSource(
        name="mental_health_therapy",
        hf_id="fadodr/mental_health_therapy",
        adapter="mental_health_therapy",
        license="MIT",
        license_class="permissive",
        url="https://huggingface.co/datasets/fadodr/mental_health_therapy",
        approx_dialogues=12258,
        format="1 row = instruction (boilerplate) + patient `input` + therapist-style `output`",
        maps_to="SFT (single-turn) + DPO",
        themes=("social anxiety", "trust", "relationships", "self-worth", "grief"),
        notes="Permissively licensed and long-form; likely GPT-3.5-generated rather than human.",
    ),
    RealSource(
        name="therapy_multiturn",
        hf_id="Abc7347/therapy-conversations-multiturn",
        adapter="therapy_multiturn",
        license="not stated by the uploader",
        license_class="unclear",
        url="https://huggingface.co/datasets/Abc7347/therapy-conversations-multiturn",
        approx_dialogues=2020,
        format="1 row = messages[{role, content}] (multi-turn therapy sessions)",
        maps_to="SFT (multi-turn)",
        themes=("anxiety", "coping", "sleep", "work stress", "family"),
        notes=(
            "Multi-turn companion-style therapy dialogue. Uploader states no "
            "license -> opt-in only (not in the default build)."
        ),
        kind="sft",
    ),
    RealSource(
        name="relationship_advice",
        hf_id="yonatanko/Relationship_Advice",
        adapter="relationship_advice",
        license="unknown (reddit-derived)",
        license_class="unclear",
        url="https://huggingface.co/datasets/yonatanko/Relationship_Advice",
        approx_dialogues=400,
        format="1 row = post + comment_1/comment_2 + more_helpful_comment (human preference)",
        maps_to="DPO (genuine chosen/rejected) + SFT (single-turn)",
        themes=("partner conflict", "jealousy", "breakups", "relationship boundaries"),
        splits=("train", "validation", "test"),
        kind="sft+dpo",
        notes=(
            "The only source here with *human* preference labels: it gives DPO "
            "pairs that contrast two real replies instead of a real reply against "
            "a template. Small (400 rows) and license-unclear -> opt-in."
        ),
    ),
)

SOURCES_BY_NAME: dict[str, RealSource] = {s.name: s for s in SOURCES}

DATASET_PROFILES: dict[str, tuple[str, ...]] = {
    # Default for `--real-data` with no argument: licenses we can put in a
    # commercial product with no further conversation.
    "permissive": ("synthetic_persona_chat", "soda", "mental_health_therapy"),
    # Research / internal eval builds only.
    "noncommercial": ("empathetic_dialogues", "esconv", "counsel_chat"),
    "unclear": ("therapy_multiturn", "relationship_advice"),
    "all": tuple(s.name for s in SOURCES),
}


def resolve_sources(selector: str) -> list[RealSource]:
    """``selector`` = profile name, comma-separated source names, or 'all'."""
    selector = (selector or "permissive").strip()
    if selector in DATASET_PROFILES:
        names = DATASET_PROFILES[selector]
    else:
        names = tuple(n.strip() for n in selector.split(",") if n.strip())
    unknown = [n for n in names if n not in SOURCES_BY_NAME]
    if unknown:
        raise SystemExit(
            f"Unknown real-data source(s): {', '.join(unknown)}.\n"
            f"Known: {', '.join(SOURCES_BY_NAME)} | profiles: {', '.join(DATASET_PROFILES)}"
        )
    return [SOURCES_BY_NAME[n] for n in names]


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def seed_for(seed: int, name: str) -> int:
    """Stable per-source seed (hashlib, not hash() -- PYTHONHASHSEED is random)."""
    digest = hashlib.sha256(f"{seed}:{name}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


def _read_cache(path: Path) -> list[Dialogue]:
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        out.append(
            Dialogue(
                source=rec["source"],
                turns=[(t[0], t[1]) for t in rec["turns"]],
                chosen=rec.get("chosen"),
                rejected=rec.get("rejected"),
                meta=rec.get("meta") or {},
            )
        )
    return out


def write_cache(path: Path, dialogues: list[Dialogue]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for d in dialogues:
            f.write(
                json.dumps(
                    {"source": d.source, "turns": d.turns, "chosen": d.chosen, "rejected": d.rejected, "meta": d.meta}
                )
                + "\n"
            )


def _load_hf_rows(src: RealSource, pool_size: int, seed: int) -> list[dict]:
    try:
        from datasets import load_dataset  # noqa: PLC0415
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise SystemExit(
            "The `datasets` package is required for --real-data "
            "(pip install 'datasets>=5.0'). Synthetic generation works without it."
        ) from exc

    last_error: Exception | None = None
    for split in src.splits:
        try:
            if src.stream:
                # Large corpora: stream with a bounded shuffle so we neither
                # download the whole parquet nor take a biased head slice.
                stream = load_dataset(src.hf_id, src.hf_config, split=split, streaming=True)
                shuffled = stream.shuffle(seed=seed_for(seed, src.name), buffer_size=10_000)
                rows = list(itertools.islice(shuffled, pool_size))
            else:
                ds = load_dataset(src.hf_id, src.hf_config, split=split)
                rows = [ds[i] for i in range(len(ds))]
        except Exception as exc:  # split may not exist under this name
            last_error = exc
            continue
        # Fold any remaining splits (train/valid/test) into the same pool.
        for extra in src.splits[src.splits.index(split) + 1 :]:
            try:
                extra_ds = load_dataset(src.hf_id, src.hf_config, split=extra)
            except Exception:
                continue
            rows.extend(extra_ds[i] for i in range(len(extra_ds)))
        if rows:
            return rows
    raise SystemExit(f"Could not load {src.hf_id}: {last_error}")


def load_source(
    src: RealSource,
    limit: int,
    seed: int,
    cache_dir: Path | None = None,
    refresh: bool = False,
) -> list[Dialogue]:
    """Load up to ``limit`` normalised dialogues from one source, deterministically.

    A candidate pool of ``4 * limit`` rows is drawn with a seeded
    ``random.sample`` over the row index space (streamed sources are shuffled in
    a bounded buffer instead), so the same seed always yields the same
    dialogues. Rows whose adapter returns ``None`` or that fail the caller's
    gate simply do not count toward the limit.
    """
    cache_path = (cache_dir / f"{src.name}.jsonl") if cache_dir else None
    if cache_path and cache_path.exists() and not refresh:
        dialogues = _read_cache(cache_path)
        rng = random.Random(seed_for(seed, src.name))
        if len(dialogues) > limit:
            dialogues = rng.sample(dialogues, limit)
        return dialogues

    pool_size = limit * 4
    rows = _load_hf_rows(src, pool_size=pool_size, seed=seed)
    adapter = ADAPTERS[src.adapter]
    rng = random.Random(seed_for(seed, src.name))
    if len(rows) > pool_size:
        rows = [rows[i] for i in rng.sample(range(len(rows)), pool_size)]

    dialogues: list[Dialogue] = []
    for row in rows:
        if len(dialogues) >= limit:
            break
        try:
            dialogue = adapter(row)
        except Exception:
            continue
        if dialogue is not None:
            dialogues.append(dialogue)

    if cache_path:
        write_cache(cache_path, dialogues)
    return dialogues


def source_table() -> str:
    """Human-readable ranked table (used by --list-real-sources and the docs)."""
    lines = [
        f"{'#':>2}  {'source':<24} {'license':<20} {'class':<14} {'~dialogs':>9}  url",
    ]
    for i, s in enumerate(SOURCES, 1):
        lines.append(
            f"{i:>2}  {s.name:<24} {s.license.split('(')[0].strip():<20} "
            f"{s.license_class:<14} {s.approx_dialogues:>9}  {s.url}"
        )
    lines.append("")
    for name, members in DATASET_PROFILES.items():
        lines.append(f"  profile {name:<14} -> {', '.join(members)}")
    return "\n".join(lines)
