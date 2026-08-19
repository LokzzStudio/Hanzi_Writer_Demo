import { useState, useRef, useEffect, useCallback } from 'react';
import HanziWriter from 'hanzi-writer';
import { PenTool, Play } from 'lucide-react';

const DEFAULT_LENIENCY = 2.5;
const CANVAS_SIZE = 280;

/** hanzi-writer sizes the canvas in CSS pixels, so the proxy inflates the
 *  backing store by DPR and pre-scales the context to keep strokes crisp. */
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

const CHARACTERS = ['一', '人', '土', '木', '田', '老', '言', '雨', '風', '夏', '鳥'];

export default function HanziWriterDemo() {
  const [char, setChar] = useState('一');
  const [leniency, setLeniency] = useState(DEFAULT_LENIENCY);
  const [loadError, setLoadError] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const writerRef = useRef<any>(null);

  const startQuiz = useCallback(() => {
    writerRef.current?.quiz();
  }, []);

  const animate = useCallback(() => {
    const writer = writerRef.current;
    if (!writer) return;
    writer.cancelQuiz();
    writer.animateCharacter();
  }, []);

  // Leniency is a construction-time option, so the writer is rebuilt (not
  // mutated) whenever the character or the slider changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setLoadError(false);

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
      showOutline: true,
      strokeColor: '#fcd34d',
      radicalColor: '#fcd34d',
      outlineColor: '#5a3a20',
      drawingColor: '#fcd34d',
      drawingWidth: 15,
      leniency,
      acceptBackwardsStrokes: false,
      onLoadCharDataError: () => setLoadError(true),
    } as any);

    writerRef.current = writer;
    writer.animateCharacter();

    return () => {
      try {
        writer.cancelQuiz();
        (writer as any)._renderState?.cancelAll?.();
      } catch {
        /* the writer is being discarded anyway */
      }
      writerRef.current = null;
    };
  }, [char, leniency]);

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center gap-8">

      {/* Canvas */}
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
            <p className="text-rose-300 text-sm">
              No stroke data for <span className="font-bold text-white text-lg">{char}</span>.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
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
      </div>

      {/* Character selection */}
      <div className="w-full flex flex-wrap justify-center gap-2">
        {CHARACTERS.map((c) => (
          <button
            key={c}
            onClick={() => setChar(c)}
            className={`w-12 h-12 rounded-lg text-2xl font-bold transition-all border ${
              char === c
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Leniency */}
      <div className="w-full bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <label className="flex justify-between items-center text-sm font-bold mb-3">
          <span className="text-amber-300 font-display">Leniency</span>
          <span className="font-mono text-white text-xs">{leniency.toFixed(1)}</span>
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
          <span>6.0 gestural</span>
        </div>
      </div>
    </div>
  );
}
