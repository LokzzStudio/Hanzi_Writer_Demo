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

## Sound

| Trigger | Clip |
| --- | --- |
| Each stroke of the *Animate* demonstration begins | `brush_stroke` |
| The pen touches down during a quiz | `brush_stroke` |
| A correct stroke is completed | `correct_stroke` |
| A wrong stroke is drawn | `wrong_stroke` |
| The whole character is finished | `correct_word_abcd` |

Browsers block sound until the page has been clicked, so the first *Animate* or
*Practice* press is what unlocks it.
