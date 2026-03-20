import { useState } from 'react';
import { Bot, Download, Settings, FileJson, Mail, Workflow, CheckCircle2, FlaskConical, KeyRound, BookOpen } from 'lucide-react';
import FormWizard from './components/FormWizard';
import { buildAgentConfig, downloadZip } from './lib/builder';

function App() {
  const [isFormComplete, setIsFormComplete] = useState(false);
  const [agentConfig, setAgentConfig] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleFormComplete = (formData: any) => {
    const config = buildAgentConfig(formData);
    setAgentConfig(config);
    setIsFormComplete(true);
  };

  const handleDownload = async () => {
    if (!agentConfig) return;
    setIsGenerating(true);
    try {
      await downloadZip(agentConfig);
    } catch (err) {
      console.error('Download failed', err);
      alert('Failed to generate ZIP. Check console for details.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center">
      {/* Header */}
      <header className="w-full bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary-100 text-primary-600 rounded-xl relative overflow-hidden">
              <Bot size={28} className="relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-tr from-primary-200 to-transparent opacity-50"></div>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Generator Agenta N8N</h1>
              <p className="text-sm text-slate-500 font-medium">Automatyczny kreator workflow</p>
            </div>
          </div>
          <nav className="flex space-x-4">
            <a href="https://n8n.io" target="_blank" rel="noreferrer" className="text-sm font-semibold text-slate-400 hover:text-primary-600 transition-colors">
              n8n.io
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-12 flex flex-col md:flex-row gap-8">

        {/* Left Col - Form Wizard */}
        <div className="flex-1">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 h-full min-h-[550px] flex flex-col transition-all">
            <h2 className="text-lg font-bold mb-8 flex items-center text-slate-800">
              <Settings className="w-5 h-5 mr-3 text-slate-400" />
              Konfiguracja Agenta
            </h2>

            {!isFormComplete ? (
              <FormWizard onComplete={handleFormComplete} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
                  <CheckCircle2 size={40} />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Konfiguracja Gotowa!</h3>
                <p className="text-slate-500 max-w-md">
                  Twoje parametry zostały zapisane. Możesz teraz wygenerować i pobrać unikalne szablony workflow dla N8N.
                </p>
                <button
                  onClick={() => setIsFormComplete(false)}
                  className="mt-8 text-primary-600 font-semibold hover:text-primary-700 transition-colors"
                >
                  ← Edytuj konfigurację
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Col - Preview & Download */}
        <div className="w-full md:w-96 flex flex-col gap-6">
          <div className="bg-slate-900 rounded-3xl p-8 text-white text-center relative overflow-hidden shadow-xl">
            <div className="absolute top-0 right-0 -mt-10 -mr-10 bg-primary-500 w-40 h-40 rounded-full blur-3xl opacity-30 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 -mb-10 -ml-10 bg-indigo-500 w-40 h-40 rounded-full blur-3xl opacity-30 pointer-events-none"></div>

            <Workflow size={56} className="mx-auto mb-6 text-primary-300 relative z-10" />

            <h3 className="text-2xl font-bold mb-3 relative z-10">Eksport Paczki</h3>
            <p className="text-sm text-slate-300 mb-8 relative z-10 font-medium">
              Spakuj parametry i wygeneruj gotowe pliki importu n8n (JSON + Instrukcje).
            </p>

            <button
              onClick={handleDownload}
              disabled={!isFormComplete || isGenerating}
              className={`w-full py-3.5 px-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all relative z-10 ${isFormComplete && !isGenerating
                ? 'bg-primary-500 hover:bg-primary-400 text-white hover:scale-[1.02] active:scale-[0.98]'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
            >
              {isGenerating ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Generowanie...
                </div>
              ) : (
                <>
                  <Download size={20} />
                  Pobierz JSON & ZIP
                </>
              )}
            </button>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 transition-all">
            <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-300"></span>
              Zawartość Paczki
            </h3>
            <ul className="space-y-4">
              <li className="flex items-center text-sm font-medium text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mr-4">
                  <FileJson size={16} />
                </div>
                6x Skonfigurowane Workflow
              </li>
              <li className="flex items-center text-sm font-medium text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mr-4">
                  <Bot size={16} />
                </div>
                setup_agent_tools.sh – Skrypt instalacyjny MCP
              </li>
              <li className="flex items-center text-sm font-medium text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center mr-4">
                  <Mail size={16} />
                </div>
                Katalog "prompts" z promptami AI
              </li>
              <li className="flex items-center text-sm font-medium text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center mr-4">
                  <BookOpen size={16} />
                </div>
                ai_installer_prompt.md – Instrukcja krok-po-kroku
              </li>
              <li className="flex items-center text-sm font-medium text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center mr-4">
                  <KeyRound size={16} />
                </div>
                .env.example – Szablon autoryzacji API
              </li>
              <li className="flex items-center text-sm font-medium text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center mr-4">
                  <FlaskConical size={16} />
                </div>
                tests/ – Payloady testowe (3 scenariusze)
              </li>
              <li className="flex items-center text-sm font-medium text-slate-700">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center mr-4">
                  <Settings size={16} />
                </div>
                agent_config.json + checklista wdrożenia
              </li>
            </ul>
          </div>
        </div>

      </main >
    </div >
  );
}

export default App;
