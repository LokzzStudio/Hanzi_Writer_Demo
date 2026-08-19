import HanziWriterDemo from './components/HanziWriterDemo';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-200 selection:bg-amber-500/30 selection:text-amber-100">
      <main className="max-w-6xl mx-auto p-4 md:p-8">
        <HanziWriterDemo />
      </main>
    </div>
  );
}
