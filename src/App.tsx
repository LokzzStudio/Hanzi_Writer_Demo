import HanziWriterDemo from './components/HanziWriterDemo';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-200 selection:bg-amber-500/30 selection:text-amber-100 flex items-center justify-center">
      <main className="w-full p-4 md:p-8">
        <HanziWriterDemo />
      </main>
    </div>
  );
}
