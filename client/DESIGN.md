# loveAI Design System — "A love letter written at golden hour"

## Art direction sentence

loveAI is a companion that already knows you. The interface reads like a love letter written at golden hour:
warm paper surfaces, deep crimson-wine ink, dusty rose and antique gold accents, handwritten margin notes,
and a youthful editorial energy that never takes itself too seriously.

## Brand attributes

- **Romantic** — serif warmth, blush tones, heart motifs, love-letter metaphors
- **Youthful** — playful handwriting, crimson energy, tilted polaroids, generous white space
- **Intimate** — small-handwritten asides that feel like margin notes to the reader
- **Grounded** — every claim is real (34-item matrix, 17 traits, 768-dim vector, pgvector RAG, fine-tuned voice)

## Anti-references (avoid)

- Purple-on-dark "AI tech" gradients, glassmorphism, cyan glows
- Inter/Roboto/Geist/System default typefaces
- Centered lone card hero, uniform 3-column card grids
- Generic "modern and clean" SaaS look

## Palette (semantic tokens)

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#FBF6EE` | page background (warm cream) |
| `--paper-deep` | `#F3E9DB` | card/surface tint |
| `--paper-line` | `#E5D7C3` | hairlines, ruled-lines |
| `--ink` | `#4A1226` | primary text (crimson-wine) |
| `--ink-soft` | `#6B4A56` | muted text (AA on paper) |
| `--crimson` | `#E63946` | passion accent — display/large only (not body text) |
| `--crimson-deep` | `#B3122A` | primary buttons/links (white text, AA) |
| `--crimson-soft` | `#FF6B75` | light-crimson gradient stop for CTA-on-dark |
| `--rose` | `#B58F9C` | dusty rose — secondary surface |
| `--blush` | `#F6D8D4` | blush fill, selected states |
| `--gold` | `#C7AF6B` | antique gold — decorative borders/seals |
| `--gold-deep` | `#73581F` | gold text accents (AA on paper, 5.6:1) |
| `--success` | `#3E7C4F` | verified/RAG state (AA on paper) |

Crimson is emotional, not textual: body and small text never use `--crimson` (3.6:1 fails AA).
Buttons use `--crimson-deep` + white (≈5.5:1). Large display type may use `--crimson`.

## Themes

- **Light (paper)** — default; tokens above.
- **Dark (Mahogany Night)** — applied via `data-theme="dark"` on `<html>`: deep mahogany paper
  (`#1A0C13`), wine cards (`#28121C`), rosy-cream text (`#F5E6EC`), glowing gold accents (`#E0C57A`).
  Toggled by `ThemeToggle` (nav / chat header), persisted to `loveai_theme`, initial value respects
  `prefers-color-scheme`.
- Focus indicators are two-layer (crimson ring + paper halo) so they stay visible on both themes.

## Typography

- **Display:** **Fraunces** (Google Fonts) — romantic editorial serif, `opsz 9..144`, `SOFT`/`WONK` axes; used for headlines, hero, roman numerals, pull-quotes. Extreme weight contrast (300 vs 700+), size jumps ≥3x.
- **Handwriting:** **Caveat** (Google Fonts) — love-letter margin notes, tags, asides, stamps.
- **Body:** **Sora** (Google Fonts) — clean geometric humanist for paragraphs, buttons, inputs. `line-height ≥1.6`, ~45-75ch.

Fallbacks: `Georgia, 'Times New Roman', serif` and `system-ui, sans-serif`.

## Spacing / grid

- 4/8px spacing scale; section padding `clamp(64px, 10vw, 128px)`.
- Page column `min(1080px, 92vw)`; hero uses a 12-col asymmetric grid (7/5 split).

## Motion

- Staggered entrance reveals (opacity + translateY, `animation-delay` 60–360ms) on page load — one orchestrated load, not scattered effects.
- Hover: subtle lift + shadow + slight rotation on polaroids/cards; underlines draw in.
- Marquee: infinite scroll strip of love-words at slow speed.
- `@media (prefers-reduced-motion: reduce)` disables marquee and all entrance transforms; no element flashes.

## Components

- **Letter cards** — paper surfaces with a one-line "rule" at the top, small handwriting tag, optional wax seal (gold circle + initial).
- **Polaroids** — tilted rectangles with white frame, washi tape, handwritten caption; rotate -3°/+2°/-5°. On hover/focus each reveals a persona-quote overlay (e.g., *"Openness 92% — a mind that loves midnight discussions"*); focusable via `tabindex`.
- **Radar chart** — Big Five results drawn as a 5-axis SVG in the evaluation results card (theme-aware `--crimson` fill).
- **Roman-numeral steps** — oversized Fraunces numerals (I II III) with per-step paper cards.
- **Stamps** — small uppercase Sora labels inside thin gold-bordered rounded boxes.
- **Evaluation wizard** — 4 steps (Big Five → Emotional Intelligence → Communication → Values &
  Motivation), sticky progress header with step dots; Likert answers are native radio inputs inside
  `<fieldset>`/`<legend>` for screen readers.
- **Chat bubbles** — user = `--crimson-deep` gradient w/ white text (right); assistant = blush surface
  w/ ink text (left); companion name in handwriting. Assistant messages render **Markdown**
  (`react-markdown`); input is an auto-expanding textarea (Enter = send, Shift+Enter = newline).
- **RAG note** — a small "remembered N similar personas — why?" button under assistant replies opens a
  drawer listing retrieved personas + similarity scores.
- **Starters** — handwriting-style prompt pills shown in the empty chat state.

## Exceptions

- Chat page intentionally breaks page grid to use a full-height app shell (product, not marketing).
- Logo uses `--crimson` display type (large, decorative).

## Assets / fonts

- Google Fonts CDN (Fraunces, Caveat, Sora) linked in `index.html` with robust fallbacks. Decorative graphics are pure CSS/SVG — no image assets to license.
