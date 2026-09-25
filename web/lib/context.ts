/**
 * Smart conversation context extractor for loveAI.
 *
 * Replaces the naive `history.slice(-N)` approach with relevance-scoring that
 * surfaces the most topically relevant past turns — not just the most recent ones.
 *
 * Scoring model (pure JS, no DB or embeddings):
 *  1. Lexical overlap  — Jaccard similarity between token sets (words shared)
 *  2. Role weighting   — user-turns weighted 1.3× (they drive conversation direction)
 * 3. Length factor    — short turns (<3 content words) are down-weighted
 *  4. Recency bonus    — small bump for recent turns prevents staleness
 *  5. Pronoun hint     — if current message uses pronouns ("it", "that"),
 *                        nearby turns get a tiny bonus (indirect reference signal)
 *
 * Returns the top-K most relevant turns in **chronological order** so the LLM
 * sees coherent conversation flow.
 */

// --- Types ---

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

// --- Stop-words list (common English words filtered out during tokenization) ---

const STOP_WORDS = new Set([
  // Articles & determiners
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  // Common function words
  'and', 'but', 'or', 'nor', 'for', 'yet', 'so',
  'if', 'then', 'when', 'where', 'while', 'before', 'after',
  // Prepositions / particles
  'in', 'on', 'at', 'to', 'of', 'by', 'with', 'from',
  'about', 'into', 'over', 'under', 'between', 'through',
  // Pronouns & auxiliaries
  'it', 'its', 'he', 'she', 'they', 'them', 'their',
  'i', 'we', 'you', 'me', 'us', 'my', 'our', 'your',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'shall',
  // High-frequency non-content words
  'just', 'very', 'more', 'most', 'much', 'many', 'some',
  'only', 'also', 'back', 'even', 'still', 'like', 'got',
  'going', 'make', 'made', 'let', 'take', 'came', 'come',
  'know', 'think', 'say', 'said', 'see', 'look', 'use',
  'need', 'want', 'give', 'get', 'day', 'one', 'two',
  'well', 'go', 'here', 'thing', 'things', 'every',
]);

// Pronouns often point back to earlier topics → bonus for near turns
const PRONOUNS = new Set(['it', 'that', 'this', 'these', 'those', 'they', 'them', 'their']);

// --- Tokenizer ---

/** Normalize text → lowercase, strip punctuation, remove stop-words, dedupe. */
export function tokenize(text: string): string[] {
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
  )];
}

/** Build a Set of tokens from text for O(1) lookup. */
function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

// --- Public API ---

/**
 * Extract the K most relevant past turns for the current user message.
 *
 * @param history     Past chat turns (user + assistant messages).
 * @param currentMessage The fresh user message triggering retrieval.
 * @param maxTurns    Maximum turns to include (default 12).
 * @returns Up to `maxTurns` turns in chronological order.
 */
export function extractRelevantContext(
  history: ChatTurn[],
  currentMessage: string,
  maxTurns = 12
): ChatTurn[] {
  if (!history?.length || !currentMessage?.trim()) {
    // Degenerate case: fall back to recency-slice
    return history?.slice(-maxTurns) ?? [];
  }

  const queryTokens = tokenize(currentMessage);
  if (queryTokens.length < 2) {
    // Query too short to be meaningful → use recency
    return history.slice(-maxTurns);
  }

  const queryWords = new Set(queryTokens);
  const n = history.length;
  const hasPronouns = queryTokens.some((t) => PRONOUNS.has(t));

  // Score every historical turn
  type TurnScore = { score: number; index: number };
  const scored: TurnScore[] = history.map((turn, idx) => {
    const tokens = tokenize(turn.content);
    if (tokens.length === 0) return { score: -Infinity, index: idx };

    let matches = 0;
    for (const tok of tokens) {
      if (queryWords.has(tok)) matches++;
    }

    // 1. Lexical Jaccard-overlap fraction (how many query words appear here)
    const baseScore = matches / queryTokens.length;

    // 2. Role weight — user messages are stronger signals of topic
    const rw = turn.role === 'user' ? 1.3 : 1.0;

    // 3. Length factor — penalise single-word / one-liner turns
    const lengthFactor = Math.min(1.0, tokens.length / 3);

    // 4. Recency — normalised position [0..1]
    const recency = n <= 1 ? 0 : idx / (n - 1);

    // 5. Pronoun hint — small bonus when current message uses pronouns
    //    and this turn is within the last third of the conversation
    const pronounHint = hasPronouns && idx >= n * 0.67 ? 0.03 : 0;

    // Weighted blend: 70% lexical relevance, 30% recency
    const relevancePart = baseScore * rw * lengthFactor;
    const finalScore = relevancePart * 0.7 + recency * 0.3 + pronounHint;

    return { score: finalScore, index: idx };
  });

  // Sort descending by score, take top-K, then re-sort chronologically
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, maxTurns).sort((a, b) => a.index - b.index);

  return selected.map((s) => history[s.index]);
}

// --- Simple test harness (run with: node --eval "require('./context').extractRelevantContext(...)") ---

if (typeof process !== 'undefined' && require.main === module) {
  // Quick smoke test
  const history: ChatTurn[] = [
    { role: 'user', content: 'I\'ve been thinking about starting a side project lately.' },
    { role: 'assistant', content: 'That sounds exciting! What kind of project are you considering?' },
    { role: 'user', content: 'Something related to climate change and sustainability.' },
    { role: 'assistant', content: 'Those are important areas. What specific problem interests you?' },
    { role: 'user', content: 'Maybe an app that helps track carbon footprint.' },
    { role: 'assistant', content: 'A carbon-tracking app could be really useful.' },
    { role: 'user', content: 'Lol yeah totally!' },
    { role: 'assistant', content: '😄 So what would be the first feature?' },
    { role: 'user', content: 'Thanks, good idea.' },
    { role: 'assistant', content: 'Happy to help! Want to brainstorm more?' },
  ];

  const queries = [
    'What features should I build first for my sustainability project?',
    'How do I motivate myself to keep going?',
    'Do you agree governments should fund climate apps?',
  ];

  console.log('--- extractRelevantContext smoke tests ---\n');
  for (const q of queries) {
    const result = extractRelevantContext(history, q, 5);
    console.log(`Query: "${q}"`);
    console.log(`→ ${result.length} turns retrieved:`);
    for (const t of result) {
      console.log(`   [${t.role}] ${t.content}`);
    }
    console.log();
  }
}
