/* ────────────────────────────────────────────────────────────────────────────
 * Handwriting quality scoring — 書法品級 + the seven style metrics.
 *
 * Ported from the Magic Scroll prototype's scoring pass, faithful to
 * `handwriting-scoring-explained.md` + `handwriting-scoring-compare.html`
 * ("new method" branch, verbatim formulas and constants). Two outputs,
 * deliberately kept apart:
 *
 *   PRECISION → the 5-level grade (丁/丙/乙/甲/完美). Judged. Feeds combat as
 *              the 書法品級 multiplier (Core Mechanics §7).
 *   METRICS   → seven bounded style knobs. Never judged; in Magic Scroll they
 *              shape the summoned tree, and every one of them is clamped so the
 *              worst hand still produces a beautiful (just different) result.
 *
 * Precision compares each stroke against the character's canonical stroke
 * spine (hanzi-writer-data medians) after per-stroke Procrustes normalisation,
 * with discrete Fréchet distance as the shape metric — so only EXCESS wobble
 * counts and legitimately curved strokes (乙, 橫折) are not punished for being
 * curved.
 *
 * Constants are the prototype's (300×300 canvas, 木) and are demonstration
 * values — the spec defers final numbers to calibration against real child
 * samples on real devices.
 *
 * Pure module: no DOM, no React. Deterministic.
 * ──────────────────────────────────────────────────────────────────────────── */

/** A captured pen sample. `t` is a monotonic ms clock (performance.now()). */
export interface Pt { x: number; y: number; t: number }
/** A geometric point (medians carry no timing). */
export interface Vec { x: number; y: number }

export interface ScoringConstants {
  /** Precision cut-offs for 完美 / 甲 / 乙 / 丙 — below the last is 丁. */
  tiers: [number, number, number, number];
  /** Fréchet distance that maps to similarity 0 (Procrustes units). */
  simDivisor: number;
  /** Points each stroke is resampled to before comparison. */
  resample: number;
  /** Pen speed (px/ms) → trunk thickness coefficient. */
  thicknessK: number;
  /** Shape deviation → waviness coefficient. */
  wavinessK: number;
  /** ms per stroke that reads as "energy 1.0", and the range below it. */
  energyBase: number;
  energyRange: number;
  /** Speed coefficient-of-variation → smoothness coefficient. */
  smoothnessK: number;
  /** Angular deviation (degrees) that saturates lean at ±1. */
  leanDeg: number;
  /* ── 快準正 attack bonus ── */
  bonusMax: number;   // P_max
  bonusK: number;     // sharpness exponent k
  bonusFloor: number; // precision that maps to 正 = 0
  wSmooth: number; wWave: number; wBalance: number;   // 準's internal mix
  tolSpread: number; tolAspect: number;               // balance tolerances
  wFast: number; wPrecise: number; wUpright: number;  // geometric-mean weights
}

/** Defaults are the prototype's, verbatim (300×300 canvas, 木). They are
 *  placeholders for demonstration — real values need device calibration
 *  against child samples. */
export const DEFAULT_SCORING: ScoringConstants = {
  tiers: [0.92, 0.78, 0.62, 0.45],
  simDivisor: 1.0,
  resample: 40,
  thicknessK: 0.9,
  wavinessK: 3,
  energyBase: 1400,
  energyRange: 1100,
  smoothnessK: 0.8,
  leanDeg: 30,
  bonusMax: 0.6,
  bonusK: 1.5,
  bonusFloor: 0.45,
  wSmooth: 0.4, wWave: 0.3, wBalance: 0.3,
  tolSpread: 0.5, tolAspect: 0.3,
  wFast: 1, wPrecise: 1, wUpright: 1,
};

/** The ladder, with the combat multipliers from Core Mechanics §7. */
export const TIERS = [
  { name: '完美', roman: 'Perfect', mult: 1.10 },
  { name: '甲', roman: 'Very good', mult: 1.05 },
  { name: '乙', roman: 'Good', mult: 1.00 },
  { name: '丙', roman: 'Fair', mult: 0.95 },
  { name: '丁', roman: 'Needs practice', mult: 0.90 },
] as const;
export type Tier = (typeof TIERS)[number];

export const tierFor = (precision: number, C = DEFAULT_SCORING): Tier => {
  const [t1, t2, t3, t4] = C.tiers;
  if (precision >= t1) return TIERS[0];
  if (precision >= t2) return TIERS[1];
  if (precision >= t3) return TIERS[2];
  if (precision >= t4) return TIERS[3];
  return TIERS[4];
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** Arc-length resample to exactly N evenly spaced points. */
export function resample(pts: Vec[], N: number): Vec[] {
  if (pts.length < 2) {
    const p = pts[0] ?? { x: 0, y: 0 };
    return Array.from({ length: N }, () => ({ x: p.x, y: p.y }));
  }
  let total = 0;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    total += dist(pts[i], pts[i - 1]);
    cum.push(total);
  }
  if (total === 0) return Array.from({ length: N }, () => ({ x: pts[0].x, y: pts[0].y }));
  const out: Vec[] = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = (total * i) / (N - 1);
    while (j < pts.length - 2 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const f = (target - cum[j]) / seg;
    out.push({
      x: pts[j].x + (pts[j + 1].x - pts[j].x) * f,
      y: pts[j].y + (pts[j + 1].y - pts[j].y) * f,
    });
  }
  return out;
}

/** Centre at the origin and scale to unit RMS radius — removes position and
 *  size from the comparison so only SHAPE is judged. */
export function procrustes(pts: Vec[]): Vec[] {
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  let s = 0;
  for (const p of pts) s += (p.x - cx) ** 2 + (p.y - cy) ** 2;
  s = Math.sqrt(s / n) || 1;
  return pts.map((p) => ({ x: (p.x - cx) / s, y: (p.y - cy) / s }));
}

/** Discrete Fréchet distance — the "dog-walking" distance: the shortest leash
 *  that lets both curves be traversed forwards. Sensitive to a single bad
 *  excursion in a way a mean distance is not. */
export function frechet(P: Vec[], Q: Vec[]): number {
  const n = P.length, m = Q.length;
  const ca = Array.from({ length: n }, () => new Float64Array(m));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const d = dist(P[i], Q[j]);
      if (i === 0 && j === 0) ca[i][j] = d;
      else if (i === 0) ca[i][j] = Math.max(ca[0][j - 1], d);
      else if (j === 0) ca[i][j] = Math.max(ca[i - 1][0], d);
      else ca[i][j] = Math.max(Math.min(ca[i - 1][j], ca[i - 1][j - 1], ca[i][j - 1]), d);
    }
  }
  return ca[n - 1][m - 1];
}

/** 0–1 shape similarity of a drawn stroke against its canonical median. */
export function shapeSimilarity(drawn: Vec[], ideal: Vec[], C = DEFAULT_SCORING): number {
  if (drawn.length < 2 || ideal.length < 2) return 0;
  const N = Math.max(4, Math.round(C.resample));
  const a = procrustes(resample(drawn, N));
  const b = procrustes(resample(ideal, N));
  return clamp(1 - frechet(a, b) / (C.simDivisor || 1), 0, 1);
}

/** Mean point-wise deviation after normalisation — the waviness feedstock.
 *  (Fréchet answers "worst excursion"; this answers "how far off throughout".) */
export function shapeDeviation(drawn: Vec[], ideal: Vec[], C = DEFAULT_SCORING): number {
  if (drawn.length < 2 || ideal.length < 2) return 0;
  const N = Math.max(4, Math.round(C.resample));
  const a = procrustes(resample(drawn, N));
  const b = procrustes(resample(ideal, N));
  let s = 0;
  for (let i = 0; i < N; i++) s += dist(a[i], b[i]);
  return s / N;
}

const chordAngle = (s: Vec[]) => Math.atan2(s[s.length - 1].y - s[0].y, s[s.length - 1].x - s[0].x);

export interface StyleMetrics {
  trunkLean: number;     // −1…1
  canopySpread: number;  // 0.5…1.5
  aspectRatio: number;   // 0.7…1.3
  thickness: number;     // 0.5…1.5
  waviness: number;      // 0…1
  energy: number;        // 0…1
  smoothness: number;    // 0…1
}

export interface AttackBonus {
  fast: number;      // 快
  precise: number;   // 準
  upright: number;   // 正
  balance: number;   // the framing term inside 準
  g: number;         // weighted geometric mean
  chance: number;    // P = P_max · G^k
}

export interface HandwritingScore {
  precision: number;
  /** Per-stroke similarity, positional: stroke i against median i. */
  perStroke: { index: number; similarity: number }[];
  tier: Tier;
  metrics: StyleMetrics;
  bonus: AttackBonus;
  strokesScored: number;
  strokesWritten: number;
}

/**
 * `drawn[i]` is the pen trace of stroke i; `ideal[i]` its canonical median in
 * the same coordinate space. Mirrors the compare tool's `analyzeNew` verbatim.
 */
export function scoreHandwriting(
  drawn: Pt[][],
  ideal: Vec[][],
  C: ScoringConstants = DEFAULT_SCORING
): HandwritingScore | null {
  const strokes = drawn.filter((s) => s && s.length > 0);
  const pts = strokes.flat();
  if (pts.length < 2 || ideal.length === 0) return null;

  // ── Precision: mean per-stroke shape similarity (positional pairing) ─────
  const n = Math.min(strokes.length, ideal.length);
  const perStroke: { index: number; similarity: number }[] = [];
  for (let i = 0; i < n; i++) {
    perStroke.push({ index: i, similarity: shapeSimilarity(strokes[i], ideal[i], C) });
  }
  const precision = perStroke.reduce((a, b) => a + b.similarity, 0) / (perStroke.length || 1);

  // ── Geometry of what was drawn, and of the model ─────────────────────────
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const W = Math.max(...xs) - Math.min(...xs) || 1;
  const H = Math.max(...ys) - Math.min(...ys) || 1;

  const iPts = ideal.flat();
  const iXs = iPts.map((p) => p.x), iYs = iPts.map((p) => p.y);
  const iW = Math.max(...iXs) - Math.min(...iXs) || 1;
  const iH = Math.max(...iYs) - Math.min(...iYs) || 1;
  const iAsp = iH / iW;

  // ── Timing: speed from real Δx/Δt (the trace carries `t`) ────────────────
  let length = 0;
  const sampleSpeeds: number[] = [];
  for (const s of strokes) {
    for (let i = 1; i < s.length; i++) {
      const d = dist(s[i], s[i - 1]);
      length += d;
      const dt = s[i].t - s[i - 1].t || 16;
      sampleSpeeds.push(d / dt);
    }
  }
  const t0 = strokes[0][0].t;
  const last = strokes[strokes.length - 1];
  const totalMs = last[last.length - 1].t - t0;
  const speed = totalMs > 0 ? length / totalMs : 0.5;
  const meanSpeed = sampleSpeeds.reduce((a, b) => a + b, 0) / (sampleSpeeds.length || 1);
  const sd = Math.sqrt(
    sampleSpeeds.reduce((a, b) => a + (b - meanSpeed) ** 2, 0) / (sampleSpeeds.length || 1)
  );
  const cv = meanSpeed > 0 ? sd / meanSpeed : 1;

  // ── Lean: the trunk stroke's angle vs the model's (stroke index 1) ───────
  const lean =
    strokes.length > 1 && ideal.length > 1 && strokes[1].length > 1 && ideal[1].length > 1
      ? (chordAngle(strokes[1]) - chordAngle(ideal[1])) / ((C.leanDeg * Math.PI) / 180)
      : 0;

  let dev = 0, devCount = 0;
  for (let i = 0; i < n; i++) { dev += shapeDeviation(strokes[i], ideal[i], C); devCount++; }

  const metrics: StyleMetrics = {
    trunkLean: clamp(lean, -1, 1),
    canopySpread: clamp(W / iW, 0.5, 1.5),
    aspectRatio: clamp((H / W) / iAsp, 0.7, 1.3),
    thickness: clamp(1.5 - speed * C.thicknessK, 0.5, 1.5),
    waviness: clamp((devCount ? dev / devCount : 0) * C.wavinessK, 0, 1),
    energy: clamp((C.energyBase - totalMs / strokes.length) / C.energyRange, 0, 1),
    smoothness: clamp(1 - cv * C.smoothnessK, 0, 1),
  };

  // ── 快準正: three qualities, combined as a WEIGHTED GEOMETRIC MEAN so that
  //    a zero on any axis zeroes the bonus — all three or nothing. ──────────
  const fast = clamp(metrics.energy, 0, 1);
  const bLean = clamp(1 - Math.abs(metrics.trunkLean), 0, 1);
  const bSpread = clamp(1 - Math.abs(metrics.canopySpread - 1) / C.tolSpread, 0, 1);
  const bAspect = clamp(1 - Math.abs(metrics.aspectRatio - 1) / C.tolAspect, 0, 1);
  const balance = (bLean + bSpread + bAspect) / 3;
  const precise = clamp(
    C.wSmooth * metrics.smoothness + C.wWave * (1 - metrics.waviness) + C.wBalance * balance,
    0, 1
  );
  const upright = clamp((precision - C.bonusFloor) / (1 - C.bonusFloor), 0, 1);

  const vals = [fast, precise, upright];
  const wts = [C.wFast, C.wPrecise, C.wUpright].map((w) => Math.max(0, w));
  const wSum = wts.reduce((a, b) => a + b, 0);
  let g = 0;
  if (wSum > 0) {
    let logSum = 0, zeroed = false;
    for (let i = 0; i < 3; i++) {
      if (wts[i] === 0) continue;
      if (vals[i] <= 0) { zeroed = true; break; }
      logSum += wts[i] * Math.log(vals[i]);
    }
    g = zeroed ? 0 : Math.exp(logSum / wSum);
  }

  return {
    precision,
    perStroke,
    tier: tierFor(precision, C),
    metrics,
    bonus: { fast, precise, upright, balance, g, chance: clamp(C.bonusMax * Math.pow(g, C.bonusK), 0, 1) },
    strokesScored: n,
    strokesWritten: strokes.length,
  };
}

/** hanzi-writer-data medians live in the makemeahanzi glyph box — x ∈ [0, 1024],
 *  y ∈ [−124, 900], y-axis pointing UP (hanzi-writer's own CHARACTER_BOUNDS).
 *  This mirrors its Positioner exactly: scale (size−2·pad)/1024, then
 *  screen y = size − pad − (y + 124)·s — so the medians sit where the glyph is
 *  actually drawn. */
export function mediansToCanvas(medians: number[][][], size: number, padding: number): Vec[][] {
  const s = (size - 2 * padding) / 1024;
  return medians.map((stroke) =>
    stroke.map(([x, y]) => ({ x: padding + x * s, y: size - padding - (y + 124) * s }))
  );
}
