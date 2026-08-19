import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import HanziWriter from 'hanzi-writer';
import { PenTool, Play, RotateCcw, Sliders, Eye, EyeOff, Baby, Target, Volume2, ScanSearch, Eraser, Undo2 } from 'lucide-react';
import { mediansToCanvas, type Pt, type Vec } from '../lib/handwritingScore';
import { recognize, type Candidate, type RecognitionGuess } from '../lib/handwritingRecognize';

/* ────────────────────────────────────────────────────────────────────────────
 * Hanzi Writer — the interactive handwriting lab.
 *
 * The panel below runs the SAME hanzi-writer configuration the game ships
 * (250x250 canvas renderer on a retina proxy, padding 15, the amber/brown
 * palette, drawingWidth 15) so what a reader tunes here is what a player feels.
 * `leniency` is the strictness dial To Do #2 names as a difficulty axis (by age,
 * or as a weapon stat), so it is exposed live rather than quoted.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Shipped value of `config.writing.leniency` in the game repo. */
const GAME_LENIENCY = 2.5;
const CANVAS_SIZE = 250;

/** Copied from the game POC (`src/utils/utils.ts`) — hanzi-writer sizes the
 *  canvas in CSS pixels, so the proxy inflates the backing store by DPR and
 *  pre-scales the context to keep strokes crisp on retina screens. */
const createRetinaCanvasProxy = (canvas: HTMLCanvasElement, scale: number) =>
  new Proxy(canvas, {
    set(target, prop, value) {
      if (prop === 'width' || prop === 'height') {
        (target as any)[prop] = (value as number) * scale;
        const ctx = target.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.scale(scale, scale);
        }
        return true;
      }
      (target as any)[prop] = value;
      return true;
    },
    get(target, prop) {
      if (prop === 'width' || prop === 'height') return (target as any)[prop] / scale;
      const val = (target as any)[prop];
      return typeof val === 'function' ? val.bind(target) : val;
    },
  });

/** Preset ladder — one character per rarity tier (see Characters tab). */
const PRESETS: { char: string; strokes: number; note: string }[] = [
  { char: '一', strokes: 1, note: 'Iron · the protagonist' },
  { char: '木', strokes: 4, note: 'Bronze · the default' },
  { char: '火', strokes: 4, note: 'Bronze · AoE element' },
  { char: '林', strokes: 8, note: 'Gold · forged from 木+木' },
  { char: '森', strokes: 12, note: 'Gold · forged from 林+木' },
  { char: '愛', strokes: 13, note: 'Diamond · dense curves' },
  { char: '龍', strokes: 16, note: 'Diamond · the 潛龍潭 hero' },
];

const leniencyBand = (l: number) => {
  if (l < 1) return { label: 'Punitive', tone: 'text-rose-400', hint: 'Tighter than hanzi-writer\'s own default. Adult stylus territory.' };
  if (l < 1.5) return { label: 'Library default', tone: 'text-amber-400', hint: 'hanzi-writer ships 1.0. Legible on desktop, brutal on a phone.' };
  if (l < 2.2) return { label: 'Strict', tone: 'text-amber-300', hint: 'Rewards real stroke placement; expect mistakes from small hands.' };
  if (l <= 3.0) return { label: 'Shipped', tone: 'text-emerald-400', hint: 'The band the game ships (2.5). Thumb-friendly, still shape-aware.' };
  if (l <= 4.0) return { label: 'Forgiving', tone: 'text-sky-400', hint: 'Approximate shapes pass. Good for the youngest cohort.' };
  return { label: 'Gestural', tone: 'text-indigo-400', hint: 'Nearly stroke-order-only: direction matters, position barely does.' };
};

export default function HanziWriterDemo() {
  const [char, setChar] = useState('木');
  const [draft, setDraft] = useState('木');
  const [leniency, setLeniency] = useState(GAME_LENIENCY);
  const [showOutline, setShowOutline] = useState(true);
  const [acceptBackwards, setAcceptBackwards] = useState(false);

  const [status, setStatus] = useState('Loading character…');
  const [mistakes, setMistakes] = useState(0);
  const [strokesDrawn, setStrokesDrawn] = useState(0);
  const [completions, setCompletions] = useState(0);
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [loadError, setLoadError] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const writerRef = useRef<any>(null);

  const startQuiz = useCallback(() => {
    const writer = writerRef.current;
    if (!writer) return;
    setMistakes(0);
    setStrokesDrawn(0);
    setStatus('Draw the character!');
    writer.quiz({
      onMistake: (data: any) => {
        setMistakes(data.totalMistakes);
        setTotalMistakes((m) => m + 1);
      },
      onCorrectStroke: (data: any) => {
        setStrokesDrawn(data.strokeNum + 1);
      },
      onComplete: (data: any) => {
        setCompletions((c) => c + 1);
        setStatus(
          data.totalMistakes === 0
            ? 'Perfect — no mistakes.'
            : `Complete — ${data.totalMistakes} mistake${data.totalMistakes === 1 ? '' : 's'}.`
        );
      },
    });
  }, []);

  const animate = useCallback(() => {
    const writer = writerRef.current;
    if (!writer) return;
    writer.cancelQuiz();
    setStatus('Watch the stroke order…');
    writer.animateCharacter({
      onComplete: () => setStatus('Tap PRACTICE to draw it yourself.'),
    });
  }, []);

  const pronounce = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(char);
    u.lang = 'zh-HK';
    u.rate = 0.8;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang === 'zh-HK' || v.lang === 'yue-Hant-HK') || voices.find((v) => v.lang.includes('zh'));
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  }, [char]);

  // Every option below is a construction-time option in hanzi-writer, so the
  // writer is rebuilt (not mutated) whenever the reader moves a control.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setLoadError(false);
    setMistakes(0);
    setStrokesDrawn(0);
    setStatus('Loading character…');

    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = window.devicePixelRatio || 1;
    canvas.style.width = `${CANVAS_SIZE}px`;
    canvas.style.height = `${CANVAS_SIZE}px`;

    const writer = HanziWriter.create(createRetinaCanvasProxy(canvas, scale) as any, char, {
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
      padding: 15,
      renderer: 'canvas',
      strokeAnimationSpeed: 1.5,
      delayBetweenStrokes: 100,
      showOutline,
      strokeColor: '#fcd34d',
      radicalColor: '#fcd34d',
      outlineColor: '#5a3a20',
      drawingColor: '#fcd34d',
      drawingWidth: 15,
      leniency,
      acceptBackwardsStrokes: acceptBackwards,
      onLoadCharDataError: () => {
        setLoadError(true);
        setStatus('No stroke data for this character.');
      },
      onLoadCharDataSuccess: () => setStatus('Tap PRACTICE to draw it yourself.'),
    } as any);

    writerRef.current = writer;
    writer.animateCharacter({ onComplete: () => setStatus('Tap PRACTICE to draw it yourself.') });

    return () => {
      try {
        writer.cancelQuiz();
        (writer as any)._renderState?.cancelAll?.();
      } catch {
        /* the writer is being discarded anyway */
      }
      writerRef.current = null;
    };
  }, [char, leniency, showOutline, acceptBackwards]);

  const commitDraft = (value: string) => {
    // One hanzi per canvas: keep the last CJK glyph the reader typed or pasted.
    const glyphs = Array.from(value).filter((c) => /[㐀-鿿豈-﫿]/.test(c));
    const next = glyphs.length ? glyphs[glyphs.length - 1] : '';
    setDraft(next);
    if (next) setChar(next);
  };

  const band = leniencyBand(leniency);
  const accuracy = completions > 0 ? totalMistakes / completions : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-8"
    >
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/20 z-0" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[100px] mix-blend-color-dodge -translate-y-1/2 translate-x-1/3" />

        <div className="relative z-10 p-10 md:p-16 pb-6 border-b border-slate-800/50">
          <div className="max-w-4xl">
            <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-6 flex items-center gap-4">
              <PenTool className="w-12 h-12 text-amber-400" />
              Hanzi Writer
            </h2>
            <p className="text-xl text-slate-300 leading-relaxed font-light">
              Writing is the only way a Hero gains EXP, and the heaviest-weighted modality in the memory model (the constant lives on the Memory Model page, and only there).
              Every attack in combat is a real stroke-order quiz rendered by <strong className="text-white">hanzi-writer</strong> — the same widget below.
              Mistakes never fail an attempt; they only cost <strong className="text-white">time</strong>, which is the player's scarcest combat resource.
            </p>
          </div>
        </div>

        <div className="relative z-10 p-6 pt-4 md:p-10 md:pt-6 bg-slate-950/30 space-y-8">

          {/* ── Interactive lab ─────────────────────────────────────────── */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-sm font-medium flex items-center gap-2">
              <Target className="w-4 h-4" />
              Live Widget — draw on the canvas, tune the recogniser
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-6 md:p-8">

              {/* Canvas column */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative rounded-2xl border-2 border-[#5a3a20] bg-[#1a1a1a] shadow-[0_0_30px_rgba(252,211,77,0.08)] p-2">
                  <canvas
                    ref={canvasRef}
                    width={CANVAS_SIZE}
                    height={CANVAS_SIZE}
                    className="touch-none block rounded-xl"
                    style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
                  />
                  {loadError && (
                    <div className="absolute inset-2 rounded-xl bg-slate-950/90 flex items-center justify-center text-center p-4">
                      <p className="text-rose-300 text-sm leading-relaxed">
                        No stroke data for <span className="font-bold text-white text-lg">{char}</span>.
                        <br />
                        <span className="text-slate-500 text-xs">hanzi-writer-data covers ~9,500 common hanzi.</span>
                      </p>
                    </div>
                  )}
                </div>

                <div className="h-6 text-center text-sm font-medium text-amber-200/90">{status}</div>

                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={animate}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-all text-sm font-medium"
                  >
                    <Play className="w-4 h-4" /> Animate
                  </button>
                  <button
                    onClick={startQuiz}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 hover:text-amber-100 transition-all text-sm font-bold"
                  >
                    <PenTool className="w-4 h-4" /> Practice
                  </button>
                  <button
                    onClick={pronounce}
                    title="Pronounce (zh-HK, rate 0.8) — the game's TTS settings"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-all text-sm font-medium"
                  >
                    <Volume2 className="w-4 h-4" /> Say it
                  </button>
                </div>

                {/* Session readout */}
                <div className="w-full grid grid-cols-4 gap-2 mt-2">
                  {[
                    { label: 'Strokes', value: strokesDrawn },
                    { label: 'Mistakes', value: mistakes },
                    { label: 'Completed', value: completions },
                    { label: 'Miss / run', value: completions ? accuracy.toFixed(1) : '—' },
                  ].map((s) => (
                    <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-lg py-2 px-1 text-center">
                      <div className="font-mono text-lg text-white leading-tight">{s.value}</div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => { setCompletions(0); setTotalMistakes(0); setMistakes(0); setStrokesDrawn(0); }}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Reset counters
                </button>
              </div>

              {/* Controls column */}
              <div className="space-y-6">

                {/* Character */}
                <div>
                  <label className="flex justify-between items-center text-sm font-bold mb-2">
                    <span className="text-slate-200 font-display">Character</span>
                    <span className="text-xs font-normal text-slate-500">any hanzi — typed or pasted</span>
                  </label>
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => commitDraft(e.target.value)}
                    placeholder="木"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-center text-3xl text-white outline-none focus:border-amber-500/60 transition-colors"
                  />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {PRESETS.map((p) => (
                      <button
                        key={p.char}
                        onClick={() => { setDraft(p.char); setChar(p.char); }}
                        title={`${p.strokes} strokes — ${p.note}`}
                        className={`w-11 h-11 rounded-lg text-xl font-bold transition-all border ${
                          char === p.char
                            ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        {p.char}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Leniency */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <label className="flex justify-between items-center text-sm font-bold mb-2">
                    <span className="text-amber-300 font-display flex items-center gap-2">
                      <Sliders className="w-4 h-4" /> Leniency
                    </span>
                    <input
                      type="number"
                      min="0.2" max="6" step="0.1"
                      value={leniency}
                      onChange={(e) => setLeniency(Math.max(0.2, Math.min(6, parseFloat(e.target.value) || 0.2)))}
                      className="w-20 bg-slate-950 border border-slate-700 rounded p-1 text-right font-mono text-white text-xs outline-none focus:border-amber-500/60"
                    />
                  </label>
                  <input
                    type="range"
                    min="0.2" max="6" step="0.1"
                    value={leniency}
                    onChange={(e) => setLeniency(parseFloat(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-600 mt-1">
                    <span>0.2 strict</span>
                    <span>2.5 shipped</span>
                    <span>6.0 gestural</span>
                  </div>
                  <div className="mt-3 flex items-start gap-2">
                    <span className={`text-xs font-bold uppercase tracking-wider ${band.tone} shrink-0`}>{band.label}</span>
                    <span className="text-xs text-slate-400 leading-relaxed">{band.hint}</span>
                  </div>
                  {Math.abs(leniency - GAME_LENIENCY) > 0.001 && (
                    <button
                      onClick={() => setLeniency(GAME_LENIENCY)}
                      className="mt-3 text-xs text-slate-500 hover:text-amber-300 transition-colors flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3 h-3" /> back to the shipped {GAME_LENIENCY}
                    </button>
                  )}
                </div>

                {/* Secondary toggles */}
                <div className="space-y-3">
                  <button
                    onClick={() => setShowOutline((v) => !v)}
                    className="w-full flex items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 hover:border-slate-600 rounded-xl p-4 transition-colors text-left group"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        {showOutline ? <Eye className="w-4 h-4 text-emerald-400" /> : <EyeOff className="w-4 h-4 text-slate-500" />}
                        Outline hint
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        The ghost glyph under the drawing — 摹 with it, 臨 without. A three-character 釋菜 at 三禮堂 buys a weapon its 入臨: hints removed, +2s writing time.
                      </div>
                    </div>
                    <div className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${showOutline ? 'bg-emerald-500/70' : 'bg-slate-700'}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${showOutline ? 'left-6' : 'left-1'}`} />
                    </div>
                  </button>

                  <button
                    onClick={() => setAcceptBackwards((v) => !v)}
                    className="w-full flex items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 hover:border-slate-600 rounded-xl p-4 transition-colors text-left"
                  >
                    <div>
                      <div className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        <Baby className="w-4 h-4 text-sky-400" />
                        Accept backwards strokes
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Off in the shipped build: direction is part of what writing teaches. The gentlest accessibility lever if leniency alone is not enough — and, like leniency, a candidate for varying by age or riding the weapon (To Do #2).
                      </div>
                    </div>
                    <div className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${acceptBackwards ? 'bg-sky-500/70' : 'bg-slate-700'}`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${acceptBackwards ? 'left-6' : 'left-1'}`} />
                    </div>
                  </button>
                </div>

                <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 font-mono text-[11px] leading-relaxed text-slate-400 overflow-x-auto">
                  <div className="text-slate-500 mb-1">// live configuration</div>
                  HanziWriter.create(canvas, <span className="text-amber-300">'{char}'</span>, {'{'}
                  <br />&nbsp;&nbsp;width: 250, height: 250, padding: 15, renderer: <span className="text-amber-300">'canvas'</span>,
                  <br />&nbsp;&nbsp;showOutline: <span className="text-emerald-400">{String(showOutline)}</span>, drawingWidth: 15,
                  <br />&nbsp;&nbsp;leniency: <span className="text-emerald-400">{leniency.toFixed(1)}</span>,
                  <br />&nbsp;&nbsp;acceptBackwardsStrokes: <span className="text-emerald-400">{String(acceptBackwards)}</span>,
                  <br />{'}'})
                </div>
              </div>
            </div>
          </div>

          {/* ── Design notes ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

            <div className="md:col-span-2 bg-slate-950/50 border border-slate-800 p-8 rounded-xl hover:border-amber-500/30 transition-colors">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <Sliders className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="font-display font-bold text-xl text-white">What Leniency Actually Does</h3>
              </div>
              <div className="space-y-4 text-slate-400 text-sm leading-relaxed">
                <p>
                  hanzi-writer scores each drawn stroke against the reference on three counts — <strong className="text-white">start/end position</strong>,
                  <strong className="text-white"> shape</strong> and <strong className="text-white">direction</strong> — and <code className="text-amber-300">leniency</code> multiplies
                  the error a stroke is allowed on all of them. It is a single scalar over the whole matcher, not a per-axis dial: at 6.0 a
                  roughly-placed line in the right direction passes; at 0.2 a two-millimetre drift fails.
                </p>
                <p>
                  <strong className="text-white">Stroke order is never lenient.</strong> Whatever the value, stroke <em>n</em> must be attempted before
                  stroke <em>n+1</em> — which is exactly the thing the game claims to teach. Leniency buys tolerance for small hands, never for wrong sequence.
                </p>
                <div className="bg-slate-900 rounded-lg border border-slate-800 p-4 font-mono text-xs text-center">
                  <span className="text-slate-300">config.writing.leniency = </span>
                  <span className="text-emerald-400 font-bold">2.5</span>
                  <span className="text-slate-500"> &nbsp;(library default: 1.0)</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Leniency sets the <em>floor</em> — what the recogniser will accept at all — and the floor is the whole judgement:
                  an accepted stroke is an accepted stroke, with nothing graded above it. Mistakes cost <em>time</em>, never damage.
                  Where the bar rises for an improving hand, it is this floor that rises (by age, or riding the weapon — To Do #2), never a verdict on beauty.
                </p>
              </div>
            </div>

            <div className="md:col-span-2 bg-slate-950/50 border border-slate-800 p-8 rounded-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                  <Target className="w-5 h-5 text-indigo-400" />
                </div>
                <h3 className="font-display font-bold text-xl text-white">Where Writing Is Asked For</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-800">
                    <tr>
                      <th className="py-3 pr-4">Context</th>
                      <th className="py-3 pr-4">Prompt</th>
                      <th className="py-3 pr-4">Reward</th>
                      <th className="py-3">Failure cost</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-400 divide-y divide-slate-800/60">
                    <tr>
                      <td className="py-3 pr-4 font-bold text-white">Calligraphy Attack</td>
                      <td className="py-3 pr-4">The front line's own characters, cycling in slot order</td>
                      <td className="py-3 pr-4">A cast + <span className="text-amber-300">combo ×(1 + 0.3c)</span> + 1 EXP + a write memory event</td>
                      <td className="py-3 text-rose-300">Seconds off the turn budget T (11–20s, weapon-set)</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-bold text-white">Practice (Hero modal)</td>
                      <td className="py-3 pr-4">One owned hero, on demand</td>
                      <td className="py-3 pr-4">+1 EXP up to Lv4, write event at any level</td>
                      <td className="py-3 text-slate-500">None — practice is never wasted for retention</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-bold text-white">Recruit / Trace 臨帖</td>
                      <td className="py-3 pr-4">The drawn hero, to claim or boost it</td>
                      <td className="py-3 pr-4">RECRUITED (+1 EXP) or BOOST (+5 EXP)</td>
                      <td className="py-3 text-slate-500">None — the draw is already paid for</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-4 font-bold text-white">Rescue 拯救</td>
                      <td className="py-3 pr-4">A faded hero pleading in the modal</td>
                      <td className="py-3 pr-4">Retention restored, RECOVERED celebration</td>
                      <td className="py-3 text-rose-300">The hero keeps decaying toward forgotten</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-4 leading-relaxed">
                Note the shape: writing is never a gate on <em>entering</em> content, only on <em>extracting value</em> from it. That is the pillar —
                learning is the gameplay, not a lock on it.
              </p>
            </div>
          </div>

          {/* ── 默寫 — the blank canvas ──────────────────── */}
          <BlankCanvasRecognizer />
        </div>
      </div>
    </motion.div>
  );
}

/** Default candidate pool — early-count and elemental staples, the 氵 family,
 *  the pairs whole-character normalisation exists to separate (士/土, 未/末)
 *  and one bench. Closed-set, and editable below. */
const RECOGNIZER_POOL =
  '一二三十人入大天上下山水火木土士日月田口目耳手心中王玉未末林森花草魚鳥馬牛羊犬門雨車刀力弓愛龍凳江河海';

function BlankCanvasRecognizer() {
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const [poolText, setPoolText] = useState<string>(RECOGNIZER_POOL);
  const [guesses, setGuesses] = useState<RecognitionGuess[] | null>(null);
  const [poolStatus, setPoolStatus] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Pt[][]>([]);
  const liveRef = useRef<Pt[]>([]);
  const drawingRef = useRef(false);
  /** char → medians in canvas coords; null = no stroke data for that char. */
  const cacheRef = useRef(new Map<string, Vec[][] | null>());

  const poolChars = useMemo(() => {
    const seen = new Set<string>();
    for (const c of Array.from<string>(poolText)) if (/[㐀-鿿豈-﫿]/.test(c)) seen.add(c);
    return Array.from(seen);
  }, [poolText]);

  const ensurePool = useCallback(async (chars: string[]): Promise<Candidate[]> => {
    const missing = chars.filter((c) => !cacheRef.current.has(c));
    if (missing.length) {
      setPoolStatus(`loading ${missing.length} candidate${missing.length === 1 ? '' : 's'}…`);
      await Promise.all(
        missing.map((c) =>
          (HanziWriter as any).loadCharacterData(c)
            .then((d: any) => {
              cacheRef.current.set(c, d?.medians ? mediansToCanvas(d.medians, CANVAS_SIZE, 15) : null);
            })
            .catch(() => cacheRef.current.set(c, null))
        )
      );
    }
    const loaded = chars.filter((c) => cacheRef.current.get(c));
    setPoolStatus(`ranked against ${loaded.length} of ${chars.length} candidates`);
    return loaded.map((c) => ({ char: c, medians: cacheRef.current.get(c)! }));
  }, []);

  const runRecognize = useCallback(async (drawn: Pt[][]) => {
    if (!drawn.length) { setGuesses(null); return; }
    const pool = await ensurePool(poolChars);
    setGuesses(recognize(drawn, pool, 5));
  }, [poolChars, ensurePool]);

  // Re-rank the current drawing when the reader edits the pool.
  useEffect(() => {
    if (strokesRef.current.length) void runRecognize(strokesRef.current);
  }, [runRecognize]);

  // Full repaint on every committed change; the in-flight stroke is drawn
  // incrementally in onPointerMove on the same (persistent) transform.
  useEffect(() => {
    strokesRef.current = strokes;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== CANVAS_SIZE * dpr) {
      canvas.width = CANVAS_SIZE * dpr;
      canvas.height = CANVAS_SIZE * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 米字格 guides — the practice-paper grid, since there is no outline here.
    ctx.save();
    ctx.strokeStyle = 'rgba(90, 58, 32, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(CANVAS_SIZE / 2, 8); ctx.lineTo(CANVAS_SIZE / 2, CANVAS_SIZE - 8);
    ctx.moveTo(8, CANVAS_SIZE / 2); ctx.lineTo(CANVAS_SIZE - 8, CANVAS_SIZE / 2);
    ctx.moveTo(8, 8); ctx.lineTo(CANVAS_SIZE - 8, CANVAS_SIZE - 8);
    ctx.moveTo(CANVAS_SIZE - 8, 8); ctx.lineTo(8, CANVAS_SIZE - 8);
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = '#fcd34d';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokes) {
      if (s.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
      ctx.stroke();
    }
  }, [strokes]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (CANVAS_SIZE / r.width),
      y: (e.clientY - r.top) * (CANVAS_SIZE / r.height),
      t: performance.now(),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    liveRef.current = [at(e)];
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const p = at(e);
    const prev = liveRef.current[liveRef.current.length - 1];
    liveRef.current.push(p);
    const ctx = e.currentTarget.getContext('2d');
    if (ctx && prev) {
      ctx.strokeStyle = '#fcd34d';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  };

  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const stroke = liveRef.current;
    liveRef.current = [];
    if (stroke.length < 2) return;
    const next = [...strokesRef.current, stroke];
    setStrokes(next);
    void runRecognize(next);
  };

  const undoStroke = () => {
    const next = strokesRef.current.slice(0, -1);
    setStrokes(next);
    if (next.length) void runRecognize(next); else setGuesses(null);
  };

  const clearInk = () => {
    setStrokes([]);
    setGuesses(null);
  };

  const top = guesses?.[0];
  const margin = guesses && guesses.length > 1 ? guesses[0].similarity - guesses[1].similarity : 1;
  const verdict = !top
    ? null
    : top.similarity >= 0.6 && margin >= 0.06
      ? { label: 'Recognised', tone: 'text-emerald-400', bar: 'bg-emerald-500/70' }
      : top.similarity >= 0.45
        ? { label: 'Best guess — unsure', tone: 'text-amber-400', bar: 'bg-amber-500/70' }
        : { label: 'Not convinced', tone: 'text-rose-400', bar: 'bg-rose-500/60' };

  return (
    <div className="bg-slate-950/50 border border-slate-800 rounded-xl overflow-hidden">
      <div className="p-4 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-300 text-sm font-medium flex items-center gap-2">
        <ScanSearch className="w-4 h-4" />
        默寫 — the blank canvas: no outline, no target, the recogniser names what you wrote
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 p-6 md:p-8">

        {/* Canvas column */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative rounded-2xl border-2 border-[#5a3a20] bg-[#1a1a1a] shadow-[0_0_30px_rgba(252,211,77,0.08)] p-2">
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="touch-none block rounded-xl cursor-crosshair"
              style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>

          <div className="h-5 text-center text-xs font-medium text-slate-500">
            {strokes.length
              ? `${strokes.length} stroke${strokes.length === 1 ? '' : 's'} — ${poolStatus || 'ranking…'}`
              : 'Write any pool character from memory — the ranking updates on every stroke.'}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={undoStroke}
              disabled={!strokes.length}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-all text-sm font-medium disabled:opacity-40 disabled:pointer-events-none"
            >
              <Undo2 className="w-4 h-4" /> Undo stroke
            </button>
            <button
              onClick={clearInk}
              disabled={!strokes.length}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 transition-all text-sm font-medium disabled:opacity-40 disabled:pointer-events-none"
            >
              <Eraser className="w-4 h-4" /> Clear
            </button>
          </div>
        </div>

        {/* Reading column */}
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-bold text-white mb-3">The recogniser's reading</h4>
            {!guesses?.length ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-sm">
                The top five land here after your first stroke, re-ranked live as the character grows.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-5 flex items-center gap-5">
                  <div className="text-6xl font-display text-white leading-none">{top!.char}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline text-xs mb-1.5">
                      <span className={`font-bold uppercase tracking-wider ${verdict!.tone}`}>{verdict!.label}</span>
                      <span className="font-mono text-slate-300">{(top!.similarity * 100).toFixed(0)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                      <div className={`h-full ${verdict!.bar}`} style={{ width: `${Math.round(top!.similarity * 100)}%` }} />
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-600 mt-1.5">
                      {top!.strokes} strokes canonical · {strokes.length} drawn
                    </div>
                  </div>
                </div>
                {guesses.slice(1).map((g) => (
                  <div key={g.char} className="bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-2 flex items-center gap-4">
                    <div className="text-2xl font-display text-slate-300 leading-none w-8 text-center">{g.char}</div>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                      <div className="h-full bg-slate-600" style={{ width: `${Math.round(g.similarity * 100)}%` }} />
                    </div>
                    <span className="font-mono text-xs text-slate-500 w-9 text-right">{(g.similarity * 100).toFixed(0)}%</span>
                  </div>
                ))}
                {top!.similarity < 0.6 && (
                  <p className="text-xs text-slate-500 leading-relaxed pt-1">
                    Nothing in the pool matches well. If the character you wrote isn't in the candidate pool, the recogniser
                    <em> cannot</em> name it — it is closed-set — so add it below and it will re-rank.
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="flex justify-between items-center text-sm font-bold mb-2">
              <span className="text-slate-200 font-display">Candidate pool</span>
              <span className="text-xs font-normal text-slate-500">{poolChars.length} characters — closed-set</span>
            </label>
            <textarea
              rows={2}
              value={poolText}
              onChange={(e) => setPoolText(e.target.value)}
              spellCheck={false}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-lg tracking-[0.2em] text-white outline-none focus:border-emerald-500/60 transition-colors resize-none"
            />
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              The recogniser only ever answers from this pool — which is the game's real situation: 紫陽齋 knows which character it
              animated, an Ink Soldier knows its own answer, the tournament knows both duellists. Recognition is
              <strong className="text-slate-400"> closed-set verification, never open OCR</strong>. Paste your own characters to stress it —
              士/土 and 未/末 are in by default because layout is the only thing separating them.
            </p>
          </div>
        </div>
      </div>

      {/* Where the mechanism is asked for, and how it reads */}
      <div className="px-6 pb-6 md:px-8 md:pb-8 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-slate-900/50 border border-teal-500/30 p-4 rounded-xl">
            <h5 className="text-xs font-bold text-teal-300 mb-1.5">紫陽齋 · 格物致知</h5>
            <p className="text-xs text-slate-500 leading-relaxed">
              Watch a courtyard character perform its strokes once, then write it whole on the blank 宣紙 — ten characters up the stroke ladder, and the study door opens, 豁然貫通.
            </p>
          </div>
          <div className="bg-slate-900/50 border border-red-500/30 p-4 rounded-xl">
            <h5 className="text-xs font-bold text-red-300 mb-1.5">右軍祠 · the tournament</h5>
            <p className="text-xs text-slate-500 leading-relaxed">
              All 40 arms and the player, 1v1 elimination on a blank canvas, hosted by 几. The champion takes 鼠鬚筆 and the errand that comes with it.
            </p>
          </div>
          <div className="bg-slate-900/50 border border-purple-500/30 p-4 rounded-xl">
            <h5 className="text-xs font-bold text-purple-300 mb-1.5">Ebbinghaus fights</h5>
            <p className="text-xs text-slate-500 leading-relaxed">
              Blocking an Ink Soldier means answering its question — written from memory, while the question itself distorts through the three stages of forgetting.
            </p>
          </div>
        </div>

        <div className="bg-slate-950/60 border-l-2 border-slate-700 p-4 text-xs text-slate-500 leading-relaxed space-y-2">
          <p>
            <strong className="text-slate-400">How it reads a drawing.</strong> The whole character is normalised once — one centre, one
            scale — so a stroke's position and relative length stay part of the answer. A per-stroke normalisation could not tell them
            apart; a recogniser cannot, because layout is exactly what separates 士 from 土. Strokes are then paired
            in order and direction-sensitive, and unmatched strokes divide the score — stroke count is part of the answer too.
          </p>
          <p>
            <strong className="text-slate-400">Honest limitations.</strong> A correct shape in the wrong stroke order scores low — deliberate,
            since order is what the game teaches, but it means this is a writing recogniser, not a shape matcher. Position and size on the
            canvas are forgiven; rotation is not. And the constants are demonstration values, like everything else on this page — the shipped
            build would tune the accept threshold per context (a 格物致知 gate can be stricter than a mid-combat answer).
          </p>
        </div>
      </div>
    </div>
  );
}
