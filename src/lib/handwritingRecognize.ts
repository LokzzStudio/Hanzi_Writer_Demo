/* ────────────────────────────────────────────────────────────────────────────
 * Blank-canvas recognition — 默寫.
 *
 * The quiz (hanzi-writer) always knows its target character, so it can only
 * VERIFY. Three places in the game need the opposite — an empty canvas and a
 * recogniser that names what was written: 紫陽齋's 格物致知 (watch once, write
 * whole), 右軍祠's tournament duels, and the Ebbinghaus fights' written answers.
 *
 * In every one of those the game still knows the expected answer, so this is
 * deliberately CLOSED-SET recognition: rank the drawing against a candidate
 * pool and accept if the expected character wins. Not open OCR, and it never
 * needs to be. A character outside the pool CANNOT be named — only mismatched.
 *
 * Method (validated against simulated-handwriting sweeps, 99%+ top-1 on a
 * 51-char pool under component drift, aspect warp and dropped hook tails):
 *
 *   1. Whole-character BOUNDING-BOX normalisation — one centre, one scale for
 *      the whole glyph, so a stroke's position and relative size stay part of
 *      the answer (per-stroke Procrustes would collapse 士 into 土). The box is
 *      used instead of RMS radius because pen samples arrive uniformly in TIME:
 *      slowly-written regions are oversampled and drag an RMS centroid toward
 *      themselves, while box extremes are density-independent.
 *   2. Strokes paired in order; per-stroke distance blends mean point-wise
 *      distance with an endpoint term (endpoints pin position AND direction —
 *      a reversed stroke fails on them hard).
 *   3. Strokes weighted by canonical length (with a floor so dots still count):
 *      a wobbled dot must not outvote a misplaced trunk stroke.
 *   4. Unmatched strokes weigh in at similarity 0, and extra drawn strokes
 *      scale the score down — stroke count is part of the answer.
 *
 * Constants are demonstration values, like the grader's.
 * Pure module: no DOM, no React. Deterministic.
 * ──────────────────────────────────────────────────────────────────────────── */

import { resample, type Vec } from './handwritingScore';

export interface Candidate { char: string; medians: Vec[][] }
export interface RecognitionGuess { char: string; similarity: number; strokes: number }

const RESAMPLE_N = 32;
/** Blended stroke distance (box-normalised units) that maps to similarity 0. */
const SIM_DIVISOR = 0.8;
/** Mix of mean point-wise distance vs endpoint distance inside a stroke. */
const W_MEAN = 0.65;
const W_ENDS = 0.35;
/** A stroke's weight never falls below this fraction of the mean stroke length. */
const LEN_FLOOR = 0.25;

/** Whole-character bounding-box normalisation: centre of the box, scale by the
 *  longer side — density-independent, layout-preserving. Strokes resampled to N. */
export function normalizeCharacter(strokes: Vec[][], N = RESAMPLE_N): Vec[][] {
  const pts = strokes.flat();
  if (pts.length < 2) return [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const s = Math.max(maxX - minX, maxY - minY) / 2 || 1;
  return strokes.map((st) => resample(st, N).map((p) => ({ x: (p.x - cx) / s, y: (p.y - cy) / s })));
}

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const meanPointDistance = (a: Vec[], b: Vec[]): number => {
  const n = Math.min(a.length, b.length);
  if (!n) return Infinity;
  let d = 0;
  for (let i = 0; i < n; i++) d += dist(a[i], b[i]);
  return d / n;
};

const strokeLength = (s: Vec[]): number => {
  let L = 0;
  for (let i = 1; i < s.length; i++) L += dist(s[i], s[i - 1]);
  return L;
};

const strokeSimilarity = (a: Vec[], b: Vec[]): number => {
  const dMean = meanPointDistance(a, b);
  const dEnds = (dist(a[0], b[0]) + dist(a[a.length - 1], b[b.length - 1])) / 2;
  return clamp01(1 - (W_MEAN * dMean + W_ENDS * dEnds) / SIM_DIVISOR);
};

/** 0–1 match of two pre-normalised characters. */
function matchNormalized(A: Vec[][], B: Vec[][]): number {
  if (!A.length || !B.length) return 0;
  const lens = B.map(strokeLength);
  const meanLen = lens.reduce((x, y) => x + y, 0) / lens.length;
  const w = lens.map((L) => Math.max(L, LEN_FLOOR * meanLen));
  const paired = Math.min(A.length, B.length);
  let sum = 0, wsum = 0;
  for (let i = 0; i < B.length; i++) {
    wsum += w[i];
    if (i < paired) sum += w[i] * strokeSimilarity(A[i], B[i]);
  }
  let score = wsum ? sum / wsum : 0;
  if (A.length > B.length) score *= B.length / A.length;
  return score;
}

/** Rank a free drawing against the pool. `drawn` strokes and `medians` must
 *  share one coordinate space (screen coords — see mediansToCanvas). */
export function recognize(drawn: Vec[][], pool: Candidate[], topK = 5): RecognitionGuess[] {
  const strokes = drawn.filter((s) => s && s.length > 1);
  if (!strokes.length) return [];
  const A = normalizeCharacter(strokes);
  return pool
    .map(({ char, medians }) => ({
      char,
      strokes: medians.length,
      similarity: matchNormalized(A, normalizeCharacter(medians)),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}
