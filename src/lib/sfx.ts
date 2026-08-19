/* ────────────────────────────────────────────────────────────────────────────
 * Sound effects.
 *
 * Web Audio rather than <audio> elements: the brush stroke fires on every
 * stroke and has to be able to overlap its own tail, and a decoded buffer
 * starts without the load/seek latency an element replays with.
 *
 * Browsers start an AudioContext suspended until a user gesture, so `primeSfx`
 * is called both on mount (to start decoding early) and from every control
 * that can precede a sound (to resume it).
 * ──────────────────────────────────────────────────────────────────────────── */

import brushUrl from '../sound/magic_scroll_sfx_brush_stroke.wav';
import correctStrokeUrl from '../sound/magic_scroll_sfx_correct_stroke.wav';
import wrongStrokeUrl from '../sound/magic_scroll_sfx_wrong_stroke.wav';
import correctWordUrl from '../sound/magic_scroll_sfx_correct_word_abcd.wav';

export type SfxName = 'brush' | 'correctStroke' | 'wrongStroke' | 'correctWord';

const SOURCES: Record<SfxName, string> = {
  brush: brushUrl,
  correctStroke: correctStrokeUrl,
  wrongStroke: wrongStrokeUrl,
  correctWord: correctWordUrl,
};

const buffers = new Map<SfxName, AudioBuffer>();
let ctx: AudioContext | null = null;
let loadStarted = false;

/** Start decoding the clips, and resume the context if a gesture allows it. */
export function primeSfx() {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
  if (!AudioCtx) return;

  if (!ctx) ctx = new AudioCtx();
  if (ctx.state === 'suspended') void ctx.resume();

  if (loadStarted) return;
  loadStarted = true;

  for (const name of Object.keys(SOURCES) as SfxName[]) {
    fetch(SOURCES[name])
      .then((r) => r.arrayBuffer())
      .then((data) => ctx!.decodeAudioData(data))
      .then((buffer) => buffers.set(name, buffer))
      .catch(() => {
        /* a missing clip must never break the canvas */
      });
  }
}

/** Fire and forget. Silent until the clip has decoded. */
export function playSfx(name: SfxName) {
  const buffer = buffers.get(name);
  if (!ctx || !buffer || ctx.state !== 'running') return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
}
