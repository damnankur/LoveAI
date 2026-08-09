"""Python port of server/src/persona/vector.ts (mulberry32 + Box-Muller).

Produces the SAME 768-dim L2-normalized vectors as the TypeScript server, so
any vector computed here is directly comparable with vectors already stored in
pgvector. Only needed if you want to reproduce/verify encodings offline.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATRIX_PATH = ROOT / "shared" / "persona-matrix.json"

MASK32 = 0xFFFFFFFF


def load_matrix() -> dict:
    return json.loads(MATRIX_PATH.read_text(encoding="utf-8"))


def trait_order(matrix: dict) -> list[str]:
    return list(matrix["trait_order"])


def mulberry32(seed: int):
    a = seed & MASK32
    while True:
        a = (a + 0x6D2B79F5) & MASK32
        x = (a ^ (a >> 15)) & MASK32
        t = (x * (a | 1)) & MASK32
        x2 = (t ^ (t >> 7)) & MASK32
        t = ((t + (x2 * (61 | t)) & MASK32) & MASK32) ^ t
        t = t ^ (t >> 14)
        yield (t & MASK32) / 4294967296.0


def gaussian(rng) -> float:
    u = next(rng)
    while u == 0:
        u = next(rng)
    v = next(rng)
    while v == 0:
        v = next(rng)
    return math.sqrt(-2.0 * math.log(u)) * math.cos(2.0 * math.pi * v)


def compute_profile(matrix: dict, responses: dict[str, float]) -> dict[str, float]:
    """questionId -> 1..5 (reverse-coded) -> trait -> 0..1."""
    lo, hi = matrix["scale"]["min"], matrix["scale"]["max"]
    sums: dict[str, list[float]] = {t: [] for t in trait_order(matrix)}
    for cat in matrix["categories"]:
        for trait in cat["traits"]:
            for q in trait["questions"]:
                if q["id"] not in responses:
                    continue
                v = max(lo, min(hi, float(responses[q["id"]])))
                score = (v - lo) / (hi - lo)
                if q["reverse"]:
                    score = 1.0 - score
                sums[trait["id"]].append(score)
    return {t: (sum(vals) / len(vals) if vals else 0.5) for t, vals in sums.items()}


def build_vector(profile: dict[str, float], dim: int, seed: int) -> list[float]:
    traits = list(profile.keys())
    rng = mulberry32(seed)
    proj = [gaussian(rng) for _ in range(len(traits) * dim)]
    vec = [0.0] * dim
    for t, tid in enumerate(traits):
        v = profile[tid] - 0.5
        for d in range(dim):
            vec[d] += proj[t * dim + d] * v
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [round(x / norm, 6) for x in vec]


def encode_answers(responses: dict[str, float], dim: int = 768, seed: int = 42) -> list[float]:
    m = load_matrix()
    return build_vector(compute_profile(m, responses), dim, seed)
