# Hanzi Writer — Handwriting Demo

A minimal demo of the Chinese-character writing canvas: pick a character, watch
its stroke order, then write it yourself against a stroke-order quiz, with
sound on every stroke.

## Open it

Double-click `index.html`. That is the whole thing — no install, no build step,
no server.

To put it online, push the repo and turn on GitHub Pages (Settings → Pages →
deploy from branch, root folder). The page is then live at
`https://<user>.github.io/<repo>/`.

An internet connection is needed either way: `hanzi-writer` and its stroke data
load from a CDN.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The entire demo — markup, styles and script in one file |
| `sound/` | The four stroke clips |

## The page

- **Canvas** — [hanzi-writer](https://hanziwriter.org) on a 280×280 canvas
  renderer behind a retina proxy. *Animate* plays the stroke order, *Practice*
  starts the quiz.
- **Character selection** — 一 人 土 木 田 老 言 雨 風 夏 鳥.
- **Grid** — 無 none, 田 the two centre lines, 米 those plus the diagonals.
- **Theme** — 淺色 an ivory sheet, 深色 a dark one. The page keeps its dark
  ground either way; only the paper, its guides and the ink change. The choice
  is remembered, and defaults to the system preference.

## Sound

| Trigger | Clip |
| --- | --- |
| Each stroke of the *Animate* demonstration begins | `brush_stroke` |
| The pen touches down during a quiz | `brush_stroke` |
| A correct stroke is completed | `correct_stroke`, pitched up the scale |
| A wrong stroke is drawn | `wrong_stroke` |
| The whole character is finished | `correct_word_abcd` |

Browsers block sound until the page has been clicked, so the first *Animate* or
*Practice* press is what unlocks it.

### The rising scale

Correct strokes climb a major scale — do re mi fa so la ti do' — one degree per
stroke, by resampling the clip rather than by holding eight recordings. The
playback rate for degree *n* is `2^(semitones/12)`, so do' comes out at exactly
double speed, an octave up. `preservesPitch` has to be switched off, or the
browser shortens the clip without raising the note.

The note is taken from the stroke's own number, not from a running count, so a
mistake never advances the scale.

The eleven characters are a stroke ladder — 一 1, 人 2, 土 3, 木 4, 田 5, 老 6,
言 7, 雨 8, 風 9, 夏 10, 鳥 11 — so 雨 lands the octave exactly on its last
stroke. Longer characters roll on into the next octave (re' mi' fa') and keep
climbing.
