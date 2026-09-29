"""[DISMISSED & RETIRED] templates.py

Notice: Rule-based static response templates have been dismissed.
LoveAI now uses its dedicated fine-tuned neural backend LLM running on AWS
to generate genuine, context-aware, and emotionally authentic responses.
Hardcoded slot-filling templates (such as canned validation loops and repetitive closers)
have been retired as they do not reflect the true conversational intent of the product.
"""
from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path

MATRIX_PATH = Path(__file__).resolve().parent.parent.parent / "shared" / "persona-matrix.json"

TRAIT_ADJECTIVES: dict[str, dict[int, str]] = {
    "openness": {0: "practical and grounded", 1: "open-minded", 2: "highly imaginative"},
    "conscientiousness": {0: "spontaneous and relaxed", 1: "organized", 2: "extremely disciplined"},
    "extraversion": {0: "reserved and introverted", 1: "sociable", 2: "energetic and outgoing"},
    "agreeableness": {0: "independent and direct", 1: "warm and cooperative", 2: "deeply warm-hearted"},
    "neuroticism": {0: "calm and emotionally steady", 1: "occasionally anxious", 2: "sensitive and vigilant"},
    "self_awareness": {0: "not very introspective", 1: "moderately self-aware", 2: "deeply self-aware"},
    "self_regulation": {0: "quick to react", 1: "usually composed", 2: "extremely composed under pressure"},
    "empathy": {0: "keeps emotional distance", 1: "reasonably empathetic", 2: "deeply empathetic"},
    "social_skills": {0: "finds socializing draining", 1: "comfortable socially", 2: "a natural connector"},
    "assertiveness": {0: "accommodating", 1: "speaks up when needed", 2: "very direct"},
    "active_listening": {0: "impatient to speak", 1: "an attentive listener", 2: "a deeply attentive listener"},
    "verbal_preference": {0: "prefers written text", 1: "a balanced communicator", 2: "prefers live conversation"},
    "conflict_style": {0: "conflict-avoidant", 1: "a compromiser", 2: "someone who addresses conflict head-on"},
    "intrinsic_motivation": {0: "externally rewarded", 1: "balanced in motivation", 2: "deeply intrinsically driven"},
    "extrinsic_motivation": {0: "indifferent to rewards", 1: "appreciative of rewards", 2: "strongly reward-driven"},
    "core_values": {0: "values flexibility", 1: "guided by clear principles", 2: "strongly principled"},
    "life_goals": {0: "figuring things out as they go", 1: "with some direction", 2: "driven by a clear long-term vision"},
}

USER_PROMPTS: list[str] = [
    "I saw someone I like at the library reading a book, how can I approach them naturally?",
    "Why do I feel anxious whenever a relationship starts getting emotionally close?",
    "How can I express what I need from my partner without sounding demanding?",
    "I feel drained from modern dating and swiping, but I still want deep connection.",
    "How do I know if someone truly cares about me or is just being polite?",
    "We had a disagreement and now there is silence. What is a gentle way to reach out?",
    "I find it hard to be vulnerable with people I love. Where do I begin?",
    "How can I stop overthinking every text message I send to someone I care about?",
]

def load_matrix() -> dict:
    if MATRIX_PATH.exists():
        return json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    return {}

def bucket(s: float) -> int:
    if s < 0.4:
        return 0
    if s > 0.6:
        return 2
    return 1

# Fallback generator for build_dataset.py without polluted templates
def build_assistant_response(prompt: str, scores: dict[str, float], rng: random.Random) -> str:
    """Dynamic, natural reply stub aligned with LoveAI's true intent."""
    return (
        "That is an understandable and very human feeling to navigate. "
        "When you want to connect honestly, taking one small, genuine step is usually "
        "far more effective than over-preparing. What feels like the most natural next step for you?"
    )

def build_rejected_response(prompt: str, scores: dict[str, float], rng: random.Random) -> str:
    """Clearly mismatched/cold response for negative training pairs."""
    return "I cannot help with that. Try searching online or ask someone else."
