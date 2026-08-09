import { TRAIT_ORDER, TraitId } from './matrix';
import { Profile } from './profile';

// Deterministic seeded PRNG (mulberry32) so the projection matrix is stable
// across runs and machines - vectors stay comparable.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Random-projection matrix: 16-dim normalized profile -> D-dim vector.
// Kept module-level (lazily built) so every call uses the same projection.
let projection: Float64Array | null = null;
let projectionDim = 0;

function getProjection(dim: number, seed: number): Float64Array {
  if (projection && projectionDim === dim) return projection;
  const rng = mulberry32(seed);
  projection = new Float64Array(TRAIT_ORDER.length * dim);
  for (let i = 0; i < projection.length; i++) projection[i] = gaussian(rng);
  projectionDim = dim;
  return projection;
}

export function buildVector(profile: Profile, dim: number, seed: number): number[] {
  const proj = getProjection(dim, seed);
  const vec = new Float64Array(dim);
  for (let t = 0; t < TRAIT_ORDER.length; t++) {
    const v = profile[TRAIT_ORDER[t] as TraitId] - 0.5; // center
    for (let d = 0; d < dim; d++) {
      vec[d] += proj[t * dim + d] * v;
    }
  }
  // L2-normalize so cosine distance == euclidean direction.
  let norm = 0;
  for (let d = 0; d < dim; d++) norm += vec[d] * vec[d];
  norm = Math.sqrt(norm) || 1;
  const out: number[] = new Array(dim);
  for (let d = 0; d < dim; d++) out[d] = Number((vec[d] / norm).toFixed(6));
  return out;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
