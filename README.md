# Hanzi Writer — Handwriting Demo

A standalone demo of the Chinese-character handwriting layer: a stroke-order
quiz on a guided canvas, and a blank-canvas recogniser that names what was
written from a closed candidate pool.

Extracted from the Hanzi Heroes GDD as a single self-contained page.

## Run

```bash
npm install
npm run dev      # http://localhost:3001
```

```bash
npm run build    # production bundle into dist/
npm run preview  # serve the built bundle
npm run lint     # tsc --noEmit
```

## What's in here

| Path | What it is |
| --- | --- |
| `src/components/HanziWriterDemo.tsx` | The whole page — guided quiz widget + 默寫 blank-canvas recogniser |
| `src/lib/handwritingScore.ts` | Pure scoring module: precision grade + seven style metrics, plus the median/resample helpers |
| `src/lib/handwritingRecognize.ts` | Pure closed-set recogniser: ranks a drawing against a candidate pool |

### The two panels

**Guided quiz.** [hanzi-writer](https://hanziwriter.org) on a 250×250 canvas
renderer behind a retina proxy. Type or paste any hanzi, or pick a preset.
Live controls for `leniency` (the single scalar over the stroke matcher),
`showOutline`, and `acceptBackwardsStrokes`. Stroke *order* is never lenient at
any setting.

**默寫 — blank canvas.** No outline, no target. Strokes are captured with
pointer events, the whole character is normalised once (bounding box, not
per-stroke), strokes are paired in order and scored direction-sensitively, and
the top five candidates re-rank on every stroke. Closed-set by design — a
character outside the pool cannot be named, only mismatched. The pool is
editable in the textarea.

## Notes

- Character stroke data is fetched at runtime from the `hanzi-writer-data` CDN
  (~9,500 common hanzi), so the page needs network access.
- Pronunciation uses the browser's `speechSynthesis` with `zh-HK` at rate 0.8;
  availability of a Cantonese voice varies by platform.
- Scoring and recognition constants are demonstration values, not calibrated
  against real samples.
