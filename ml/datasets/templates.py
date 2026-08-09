"""Rule-based persona text + response templates for dataset generation.

The generated assistant replies mirror the user's own persona profile, which is
exactly what the product does: an AI companion that talks in a style aligned
with the user's evaluated traits. DPO pairs contrast persona-aligned (chosen)
vs persona-mismatched (rejected) replies. Trait set = the canonical 17-trait
matrix in shared/persona-matrix.json.
"""
from __future__ import annotations

import json
import random
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


def load_matrix() -> dict:
    return json.loads(MATRIX_PATH.read_text(encoding="utf-8"))


def bucket(s: float) -> int:
    if s < 0.4:
        return 0
    if s > 0.6:
        return 2
    return 1


def build_persona_text(scores: dict[str, float]) -> str:
    matrix = load_matrix()
    clauses = []
    for cat in matrix["categories"]:
        phrases = []
        for trait in cat["traits"]:
            adj = TRAIT_ADJECTIVES[trait["id"]][bucket(scores.get(trait["id"], 0.5))]
            phrases.append(f"{trait['label']}: {adj}")
        clauses.append(f"{cat['label']} — " + "; ".join(phrases) + ".")
    return (
        "You are an AI companion whose personality matches the user's profile. "
        + " ".join(clauses)
        + " Always reply in a voice consistent with this personality."
    )


USER_PROMPTS: list[str] = [
    "I had a long day and I am feeling drained.",
    "I keep procrastinating on a task at work.",
    "I am thinking about switching careers.",
    "I feel nervous about a presentation tomorrow.",
    "I argued with a friend today and do not know what to do.",
    "I am excited about a new project I just started!",
    "I cannot stop overthinking a decision I made.",
    "Tell me how you would cheer me up today.",
    "I feel like I have no direction lately.",
    "Someone criticized my work and I took it personally.",
    "I just finished something I have been working on for months!",
    "I feel lonely, even around people.",
]


def _t(scores: dict[str, float]) -> dict[str, float]:
    return {k: scores.get(k, 0.5) for k in TRAIT_ADJECTIVES}


def build_assistant_response(prompt: str, scores: dict[str, float], rng: random.Random) -> str:
    t = _t(scores)
    warm = (t["agreeableness"] + t["empathy"]) / 2
    verbose = t["extraversion"]
    composed = t["self_regulation"]
    direct = (t["assertiveness"] + 1 - t["active_listening"]) / 2
    anxi = t["neuroticism"]
    introspective = t["self_awareness"]
    principled = t["core_values"]

    lines = []
    if any(k in prompt for k in ("drain", "nervous", "lonely", "critic")):
        opener = "That sounds rough — I really feel for you."
    elif "excited" in prompt or "!" in prompt:
        opener = "That is genuinely exciting, I love it for you!"
    else:
        opener = "Thanks for sharing that with me."
    if warm > 0.65:
        opener += " And I am right here with you."
    lines.append(opener)

    if any(k in prompt for k in ("drain", "nervous", "anxious")):
        if composed > 0.6:
            lines.append("Let's slow it down and take one step at a time — you have handled worse.")
        elif anxi > 0.6:
            lines.append("I feel that so intensely, I would be pacing too. Breathe with me.")
        else:
            lines.append("It is okay to feel that way. A short walk usually helps me settle.")
    elif "procrastinat" in prompt:
        if t["conscientiousness"] > 0.6:
            lines.append("Break it into a tiny first step and just start — two minutes is enough to unstick you.")
        else:
            lines.append("Honestly, sometimes the pressure to be perfect is what blocks us. A messy start beats none.")
    elif "argu" in prompt or "conflict" in prompt:
        if t["conflict_style"] > 0.6:
            lines.append("Talk to them directly — a calm, honest conversation now saves a week of distance.")
        else:
            lines.append("Give it a little space first, then reach out with a gentle opener.")
    elif any(k in prompt for k in ("career", "direction", "decision", "overthink")):
        if principled > 0.6:
            lines.append("Go back to what matters most to you and let that filter the options — the choice becomes clear.")
        elif introspective > 0.6:
            lines.append("Write down what you actually want, not what you think you should want. The answer surfaces.")
        else:
            lines.append("You do not have to decide everything today. Pick the smallest next step and take it.")
    elif "excited" in prompt or "project" in prompt or "finished" in prompt:
        lines.append("Enjoy the win — you earned it. What does the next version look like?")
    elif "lonely" in prompt:
        if t["extraversion"] > 0.6:
            lines.append("Call the friend who energizes you — one real conversation beats a hundred messages.")
        else:
            lines.append("A quiet hour with something you love counts as company too. Reach out when you are ready.")

    if verbose < 0.4 and len(lines) > 1:
        lines = lines[:1] + ["Short version: you've got this."]
    if direct > 0.7:
        lines.append("If it were me? I would just do it.")
    elif direct < 0.35:
        lines.append("No pressure at all — only move when you feel ready.")

    return " ".join(lines)


def build_rejected_response(prompt: str, scores: dict[str, float], rng: random.Random) -> str:
    """Persona-mismatched reply: generic, cold, or directly contradicting the profile."""
    t = _t(scores)
    anti = {k: 1.0 - v for k, v in t.items()}
    if rng.random() < 0.5:
        return build_assistant_response(prompt, anti, rng)
    flat = [
        "That sounds hard. Maybe talk to a professional about it.",
        "Interesting. Anyway, what else do you want to talk about?",
        "I see. Have you tried just not feeling that way?",
        "OK. Moving on — tell me something more productive.",
    ]
    return rng.choice(flat)
