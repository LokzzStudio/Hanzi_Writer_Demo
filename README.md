# Hanzi Writer — Handwriting Demo

A minimal standalone demo of the Chinese-character writing canvas: pick a
character, watch its stroke order, then write it yourself against a
stroke-order quiz.

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

## The page

Three things, nothing else:

- **Canvas** — [hanzi-writer](https://hanziwriter.org) on a 280×280 canvas
  renderer behind a retina proxy. *Animate* plays the stroke order, *Practice*
  starts the quiz.
- **Character selection** — 一 人 土 木 田 老 言 雨 風 夏 鳥.
- **Leniency** — the single scalar over hanzi-writer's stroke matcher,
  multiplying the error a stroke is allowed on start/end position, shape and
  direction. Stroke *order* is never lenient at any setting.

## Notes

- Stroke data is fetched at runtime from the `hanzi-writer-data` CDN, so the
  page needs network access.
