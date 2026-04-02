import React, { useState, useCallback } from "react";
import {
  X,
  HelpCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Diamond,
  GitBranch,
  Palette,
  FileJson,
  Sparkles,
  AlertTriangle,
  Info,
} from "lucide-react";

/* ─── Copy helper (no Clipboard API) ─── */
function copyToClipboard(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

/* ─── Section component ─── */
function HelpSection({
  title,
  icon,
  color,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-lg"
      style={{ border: `1px solid ${color}25`, background: `${color}08` }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 text-left transition-colors cursor-pointer"
        style={{
          color,
          borderBottom: open ? `1px solid ${color}15` : "none",
          minHeight: 48,
          paddingTop: 12,
          paddingBottom: 12,
        }}
      >
        <span className="flex-shrink-0">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
        <span className="flex-shrink-0">{icon}</span>
        <span style={{ fontSize: 13, lineHeight: 1.4 }}>{title}</span>
      </button>
      {open && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}

/* ─── Code block with copy ─── */
function CodeBlock({ code, label, lang }: { code: string; label?: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    if (copyToClipboard(code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  return (
    <div className="relative mt-2 mb-2">
      {label && (
        <div
          className="flex items-center justify-between px-3 py-1.5 rounded-t-md"
          style={{ background: "#1a1a2e", borderBottom: "1px solid #2d2d44" }}
        >
          <span style={{ color: "#9ca3af", fontSize: 10 }}>
            {lang && <span style={{ color: "#818cf8", marginRight: 6 }}>{lang}</span>}
            {label}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors"
            style={{ color: copied ? "#22c55e" : "#6b7280", background: "#0d0d1a" }}
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? "Copiato!" : "Copia"}
          </button>
        </div>
      )}
      <pre
        className={`px-3 py-2.5 overflow-x-auto ${label ? "rounded-b-md" : "rounded-md"}`}
        style={{
          background: "#0a0a14",
          border: label ? undefined : "1px solid #1f2937",
          color: "#86efac",
          fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
          fontSize: 10,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {code}
      </pre>
    </div>
  );
}

/* ─── Inline tag ─── */
function Tag({ children, color = "#818cf8" }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded mx-0.5"
      style={{ background: `${color}18`, color, fontSize: 10, fontFamily: "monospace" }}
    >
      {children}
    </span>
  );
}

/* ─── FULL PROMPT for Figma Make ─── */
export const FIGMA_MAKE_PROMPT = `Crea anche una pagina al percorso /flow-documentation per il sito che stai costruendo.

Il tuo compito è quello di un UX designer che deve mappare TUTTI gli user flow del sito per consegnarli al team di sviluppo. Per ogni pagina che crei: documenta lo scopo, le azioni possibili, le destinazioni. Classifica ogni percorso come happy, error, secondary, skip o variant. Spiega la motivazione UX di ogni transizione.

La pagina deve usare ESATTAMENTE questo HTML. NON modificare HTML/CSS/JS. Sostituisci SOLO i commenti dentro gli array dell'oggetto flowData con i dati REALI del sito:
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#0f0f1a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}.container{max-width:640px;width:100%;padding:40px 24px}.badge{display:inline-block;padding:4px 12px;border-radius:99px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;background:#6366f120;color:#818cf8;border:1px solid #6366f130;margin-bottom:16px}h1{font-size:24px;font-weight:700;margin-bottom:8px}.subtitle{color:#9ca3af;font-size:14px;margin-bottom:32px;line-height:1.5}.steps{display:flex;flex-direction:column;gap:16px;margin-bottom:32px}.step{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:12px;background:#1a1a2e;border:1px solid #2d2d44}.step-num{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0}.step-text{font-size:14px;line-height:1.5}.step-text strong{color:#e2e8f0}.step-text span{color:#9ca3af}.copy-btn{width:100%;padding:16px 24px;border-radius:12px;border:none;font-size:16px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:10px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;box-shadow:0 4px 24px #6366f140;margin-bottom:16px}.copy-btn:hover{box-shadow:0 8px 32px #6366f160;transform:translateY(-1px)}.copy-btn.copied{background:linear-gradient(135deg,#16a34a,#15803d);box-shadow:0 4px 24px #16a34a40}.toggle-btn{width:100%;padding:10px;border-radius:8px;border:1px solid #2d2d44;background:0 0;color:#6b7280;font-size:12px;cursor:pointer;transition:all .2s}.toggle-btn:hover{color:#9ca3af;border-color:#4b5563}pre{margin-top:12px;padding:16px;border-radius:8px;background:#0a0a14;border:1px solid #2d2d44;color:#86efac;font-family:'Fira Code','JetBrains Mono',monospace;font-size:11px;line-height:1.6;white-space:pre-wrap;word-break:break-all;max-height:400px;overflow:auto;display:none}pre.visible{display:block}.footer{margin-top:24px;text-align:center;color:#4b5563;font-size:11px}.footer a{color:#6366f1;text-decoration:none}</style><div class="container"><div class="badge">FlowMapper</div><h1>Flow Documentation</h1><p class="subtitle">Questa pagina contiene la mappa di tutti i flussi utente del sito.<br>Segui i 3 passi per importarla in FlowMapper.</p><div class="steps"><div class="step"><div class="step-num" style="background:#6366f120;color:#818cf8">1</div><div class="step-text"><strong>Copia il codice</strong><br><span>Clicca il bottone viola qui sotto</span></div></div><div class="step"><div class="step-num" style="background:#818cf820;color:#a5b4fc">2</div><div class="step-text"><strong>Apri FlowMapper</strong><br><span>Vai su FlowMapper e clicca "Importa i tuoi flow"</span></div></div><div class="step"><div class="step-num" style="background:#22c55e20;color:#86efac">3</div><div class="step-text"><strong>Incolla e importa</strong><br><span>Incolla il codice nella casella di testo e clicca "Analizza contenuto"</span></div></div></div><button class="copy-btn" id="copyBtn" onclick="copyJson()"><span id="copyIcon">📋</span><span id="copyLabel">Copia codice per FlowMapper</span></button><button class="toggle-btn" onclick="toggleCode()"><span id="toggleLabel">Mostra codice</span></button><pre id="codeBlock"></pre><div class="footer">Generato automaticamente per <a href="https://iamgoodwine.github.io/flowmapper/index.html" target="_blank">FlowMapper</a></div></div><script>
const flowData = {
"siteUrl": window.location.origin,
"screens": [
// SOSTITUISCI con i dati reali: {"id":"kebab-case","name":"Nome","route":"/percorso","description":"Scopo","userGoal":"Obiettivo utente","interactions":["Azione 1","Azione 2"]}
],
"connections": [
// SOSTITUISCI: {"from":"id","to":"id","trigger":"Azione specifica","flowType":"happy|error|secondary|skip|variant","reason":"Motivazione UX","userIntent":"Intento utente"}
],
"decisions": [
// SOSTITUISCI: {"id":"dec-xxx","question":"Condizione?","yesTarget":"id","noTarget":"id","sourceId":"id-precedente","noFlowType":"error|variant|secondary"}
],
"flows": [
// SOSTITUISCI: {"name":"Nome","flowType":"tipo","steps":["Screen Name","Domanda?","Screen Name"]}
],
"notes": []
};
const j=JSON.stringify(flowData,null,2);document.getElementById('codeBlock').textContent=j;function copyJson(){const b=document.getElementById('copyBtn'),i=document.getElementById('copyIcon'),l=document.getElementById('copyLabel'),t=document.createElement('textarea');t.value=j;t.style.cssText='position:fixed;left:-9999px;opacity:0';document.body.appendChild(t);t.select();try{document.execCommand('copy')}catch(e){}document.body.removeChild(t);b.classList.add('copied');i.textContent='✅';l.textContent='Copiato! Ora apri FlowMapper';setTimeout(()=>{b.classList.remove('copied');i.textContent='📋';l.textContent='Copia codice per FlowMapper'},3000)}function toggleCode(){const b=document.getElementById('codeBlock'),l=document.getElementById('toggleLabel');b.classList.toggle('visible');l.textContent=b.classList.contains('visible')?'Nascondi codice':'Mostra codice'}
</script>
REGOLE: siteUrl=window.location.origin, id kebab-case, flowType solo "happy"/"error"/"secondary"/"skip"/"variant", ogni decision con sourceId, steps usano i name non gli id, documenta SOLO pagine reali del sito, NON modificare HTML/CSS/JS.`;

const FIGMA_MAKE_PROMPT_RETROFIT = `Analizza tutte le pagine del mio sito esistente e crea una nuova pagina al percorso /flow-documentation.

Il tuo compito è quello di un UX designer che deve mappare TUTTI gli user flow del sito per consegnarli al team di sviluppo. Per ogni pagina: esamina lo scopo, le azioni possibili, le destinazioni. Classifica ogni percorso come happy, error, secondary, skip o variant. Spiega la motivazione UX di ogni transizione.

La pagina deve usare ESATTAMENTE questo HTML. NON modificare HTML/CSS/JS. Sostituisci SOLO i commenti dentro gli array dell'oggetto flowData con i dati REALI del sito:
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#0f0f1a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center}.container{max-width:640px;width:100%;padding:40px 24px}.badge{display:inline-block;padding:4px 12px;border-radius:99px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;background:#6366f120;color:#818cf8;border:1px solid #6366f130;margin-bottom:16px}h1{font-size:24px;font-weight:700;margin-bottom:8px}.subtitle{color:#9ca3af;font-size:14px;margin-bottom:32px;line-height:1.5}.steps{display:flex;flex-direction:column;gap:16px;margin-bottom:32px}.step{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:12px;background:#1a1a2e;border:1px solid #2d2d44}.step-num{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0}.step-text{font-size:14px;line-height:1.5}.step-text strong{color:#e2e8f0}.step-text span{color:#9ca3af}.copy-btn{width:100%;padding:16px 24px;border-radius:12px;border:none;font-size:16px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:10px;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;box-shadow:0 4px 24px #6366f140;margin-bottom:16px}.copy-btn:hover{box-shadow:0 8px 32px #6366f160;transform:translateY(-1px)}.copy-btn.copied{background:linear-gradient(135deg,#16a34a,#15803d);box-shadow:0 4px 24px #16a34a40}.toggle-btn{width:100%;padding:10px;border-radius:8px;border:1px solid #2d2d44;background:0 0;color:#6b7280;font-size:12px;cursor:pointer;transition:all .2s}.toggle-btn:hover{color:#9ca3af;border-color:#4b5563}pre{margin-top:12px;padding:16px;border-radius:8px;background:#0a0a14;border:1px solid #2d2d44;color:#86efac;font-family:'Fira Code','JetBrains Mono',monospace;font-size:11px;line-height:1.6;white-space:pre-wrap;word-break:break-all;max-height:400px;overflow:auto;display:none}pre.visible{display:block}.footer{margin-top:24px;text-align:center;color:#4b5563;font-size:11px}.footer a{color:#6366f1;text-decoration:none}</style><div class="container"><div class="badge">FlowMapper</div><h1>Flow Documentation</h1><p class="subtitle">Questa pagina contiene la mappa di tutti i flussi utente del sito.<br>Segui i 3 passi per importarla in FlowMapper.</p><div class="steps"><div class="step"><div class="step-num" style="background:#6366f120;color:#818cf8">1</div><div class="step-text"><strong>Copia il codice</strong><br><span>Clicca il bottone viola qui sotto</span></div></div><div class="step"><div class="step-num" style="background:#818cf820;color:#a5b4fc">2</div><div class="step-text"><strong>Apri FlowMapper</strong><br><span>Vai su FlowMapper e clicca "Importa i tuoi flow"</span></div></div><div class="step"><div class="step-num" style="background:#22c55e20;color:#86efac">3</div><div class="step-text"><strong>Incolla e importa</strong><br><span>Incolla il codice nella casella di testo e clicca "Analizza contenuto"</span></div></div></div><button class="copy-btn" id="copyBtn" onclick="copyJson()"><span id="copyIcon">📋</span><span id="copyLabel">Copia codice per FlowMapper</span></button><button class="toggle-btn" onclick="toggleCode()"><span id="toggleLabel">Mostra codice</span></button><pre id="codeBlock"></pre><div class="footer">Generato automaticamente per <a href="https://iamgoodwine.github.io/flowmapper/index.html" target="_blank">FlowMapper</a></div></div><script>
const flowData = {
"siteUrl": window.location.origin,
"screens": [
// SOSTITUISCI con i dati reali: {"id":"kebab-case","name":"Nome","route":"/percorso","description":"Scopo","userGoal":"Obiettivo utente","interactions":["Azione 1","Azione 2"]}
],
"connections": [
// SOSTITUISCI: {"from":"id","to":"id","trigger":"Azione specifica","flowType":"happy|error|secondary|skip|variant","reason":"Motivazione UX","userIntent":"Intento utente"}
],
"decisions": [
// SOSTITUISCI: {"id":"dec-xxx","question":"Condizione?","yesTarget":"id","noTarget":"id","sourceId":"id-precedente","noFlowType":"error|variant|secondary"}
],
"flows": [
// SOSTITUISCI: {"name":"Nome","flowType":"tipo","steps":["Screen Name","Domanda?","Screen Name"]}
],
"notes": []
};
const j=JSON.stringify(flowData,null,2);document.getElementById('codeBlock').textContent=j;function copyJson(){const b=document.getElementById('copyBtn'),i=document.getElementById('copyIcon'),l=document.getElementById('copyLabel'),t=document.createElement('textarea');t.value=j;t.style.cssText='position:fixed;left:-9999px;opacity:0';document.body.appendChild(t);t.select();try{document.execCommand('copy')}catch(e){}document.body.removeChild(t);b.classList.add('copied');i.textContent='✅';l.textContent='Copiato! Ora apri FlowMapper';setTimeout(()=>{b.classList.remove('copied');i.textContent='📋';l.textContent='Copia codice per FlowMapper'},3000)}function toggleCode(){const b=document.getElementById('codeBlock'),l=document.getElementById('toggleLabel');b.classList.toggle('visible');l.textContent=b.classList.contains('visible')?'Nascondi codice':'Mostra codice'}
</script>
REGOLE: siteUrl=window.location.origin, id kebab-case, flowType solo "happy"/"error"/"secondary"/"skip"/"variant", ogni decision con sourceId, steps usano i name non gli id, NON inventare pagine inesistenti, NON modificare HTML/CSS/JS.`;

const FIGMA_MAKE_PROMPT_UPDATE = `Ho modificato il sito. Aggiorna la pagina /flow-documentation per riflettere le modifiche.

Modifiche effettuate: [DESCRIVI QUI LE MODIFICHE]

Istruzioni:
- Aggiungi nuove screen/connections/decisions/flows per le pagine aggiunte
- Aggiorna i flows esistenti se i percorsi sono cambiati
- Aggiorna le notes con nuove considerazioni tecniche
- NON rimuovere elementi ancora validi
- NON ricreare la pagina da zero — modifica solo il JSON nello script esistente
- Mantieni lo stesso formato (siteUrl dinamico, id kebab-case, etc.)`;

/* ─── Component ─── */
interface FlowDocHelpProps {
  onClose: () => void;
}

export function FlowDocHelp({ onClose }: FlowDocHelpProps) {
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptTab, setPromptTab] = useState<"create" | "retrofit" | "update">("create");

  const activePrompt = promptTab === "create"
    ? FIGMA_MAKE_PROMPT
    : promptTab === "retrofit"
    ? FIGMA_MAKE_PROMPT_RETROFIT
    : FIGMA_MAKE_PROMPT_UPDATE;

  const handleCopyPrompt = useCallback(() => {
    if (copyToClipboard(activePrompt)) {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 3000);
    }
  }, [activePrompt]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)" }}
    >
      <div
        className="flex flex-col rounded-xl overflow-hidden"
        style={{
          background: "#13131f",
          border: "1px solid #2d2d44",
          boxShadow: "0 25px 80px rgba(0,0,0,0.8)",
          width: "min(960px, 95vw)",
          height: "min(780px, 94vh)",
        }}
      >
        {/* ═══ Header ═══ */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid #1f2937" }}
        >
          <div className="flex items-center gap-2.5">
            <HelpCircle size={18} style={{ color: "#a855f7" }} />
            <span style={{ color: "white", fontSize: 15 }}>
              Guida — Flow Documentation Reader
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-xs"
              style={{ background: "#a855f720", color: "#a855f7", border: "1px solid #a855f730" }}
            >
              AI Study
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: "#6b7280" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ═══ Body ═══ */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3" style={{ minHeight: 0 }}>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/*  HERO: COPYABLE PROMPT — Most prominent element                    */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          <div
            className="rounded-xl"
            style={{
              border: "2px solid #a855f780",
              background: "linear-gradient(135deg, #a855f718 0%, #6366f112 40%, #13131f 100%)",
              boxShadow: "0 0 30px #a855f715, inset 0 1px 0 #a855f730",
            }}
          >
            {/* Hero header */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid #a855f725" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center rounded-lg"
                  style={{ width: 36, height: 36, background: "linear-gradient(135deg, #a855f7, #6366f1)" }}
                >
                  <Sparkles size={18} style={{ color: "white" }} />
                </div>
                <div>
                  <div style={{ color: "white", fontSize: 15 }}>
                    Prompt per Figma Make
                  </div>
                  <div style={{ color: "#a78bfa", fontSize: 11 }}>
                    Copia, incolla in Figma Make, personalizza con i tuoi dati
                  </div>
                </div>
              </div>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm transition-all cursor-pointer"
                style={{
                  background: promptCopied
                    ? "linear-gradient(135deg, #14532d, #166534)"
                    : "linear-gradient(135deg, #a855f7, #7c3aed)",
                  color: "white",
                  boxShadow: promptCopied
                    ? "0 0 20px #22c55e30"
                    : "0 0 20px #a855f740, 0 4px 12px rgba(0,0,0,0.3)",
                  border: promptCopied ? "1px solid #22c55e50" : "1px solid #a855f760",
                  fontWeight: 600,
                }}
              >
                {promptCopied ? <Check size={16} /> : <Copy size={16} />}
                {promptCopied ? "Copiato!" : "Copia il prompt"}
              </button>
            </div>

            {/* Quick steps */}
            <div className="px-5 py-3" style={{ borderBottom: "1px solid #a855f715" }}>
              {/* Prompt scenario tabs */}
              <div className="flex items-center gap-1 mb-3">
                {([
                  { key: "create" as const, label: "Sito nuovo", sublabel: "Genera insieme al sito", color: "#a855f7" },
                  { key: "retrofit" as const, label: "Sito esistente", sublabel: "Analizza e documenta", color: "#3b82f6" },
                  { key: "update" as const, label: "Aggiornamento", sublabel: "Dopo modifiche", color: "#22c55e" },
                ] as const).map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => { setPromptTab(tab.key); setPromptCopied(false); }}
                    className="flex-1 flex flex-col items-center gap-0.5 py-2 px-3 rounded-lg transition-all cursor-pointer"
                    style={{
                      background: promptTab === tab.key ? `${tab.color}15` : "transparent",
                      border: `1px solid ${promptTab === tab.key ? `${tab.color}50` : "#2d2d44"}`,
                    }}
                  >
                    <span style={{ color: promptTab === tab.key ? tab.color : "#9ca3af", fontSize: 11, fontWeight: 600 }}>
                      {tab.label}
                    </span>
                    <span style={{ color: promptTab === tab.key ? `${tab.color}99` : "#4b5563", fontSize: 9 }}>
                      {tab.sublabel}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-6 flex-wrap" style={{ fontSize: 11 }}>
                {(promptTab === "update" ? [
                  { n: "1", text: "Descrivi le modifiche nel prompt", color: "#22c55e" },
                  { n: "2", text: "Incollalo in Figma Make", color: "#818cf8" },
                  { n: "3", text: "Ripubblica il sito", color: "#6366f1" },
                  { n: "4", text: "Reimporta in FlowMapper", color: "#a855f7" },
                ] : promptTab === "retrofit" ? [
                  { n: "1", text: "Copia il prompt qui sotto", color: "#3b82f6" },
                  { n: "2", text: "Incollalo in Figma Make", color: "#818cf8" },
                  { n: "3", text: "Pubblica e apri /flow-documentation", color: "#6366f1" },
                  { n: "4", text: "Importa in FlowMapper", color: "#22c55e" },
                ] : [
                  { n: "1", text: "Copia e aggiungi al prompt del sito", color: "#a855f7" },
                  { n: "2", text: "Figma Make crea sito + flow-doc", color: "#818cf8" },
                  { n: "3", text: "Pubblica il sito", color: "#6366f1" },
                  { n: "4", text: "Importa in FlowMapper", color: "#22c55e" },
                ]).map((s) => (
                  <div key={s.n} className="flex items-center gap-2">
                    <span
                      className="flex items-center justify-center rounded-full"
                      style={{
                        width: 20, height: 20,
                        background: `${s.color}25`,
                        color: s.color,
                        fontSize: 10,
                        fontWeight: 700,
                        border: `1px solid ${s.color}40`,
                      }}
                    >
                      {s.n}
                    </span>
                    <span style={{ color: "#d1d5db" }}>{s.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Prompt code block */}
            <div className="px-5 py-4">
              <pre
                className="px-4 py-4 rounded-lg overflow-auto"
                style={{
                  background: "#08081080",
                  border: "1px solid #2d2d44",
                  color: "#d1d5db",
                  fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                  fontSize: 10,
                  lineHeight: 1.65,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 320,
                  backdropFilter: "blur(8px)",
                }}
              >
                {activePrompt}
              </pre>
            </div>
          </div>

          {/* ── CORS note ── */}
          <div
            className="flex items-start gap-2 p-3 rounded-lg"
            style={{ background: "#1e1e2e", border: "1px solid #2d2d44" }}
          >
            <Info size={14} style={{ color: "#818cf8", flexShrink: 0, marginTop: 1 }} />
            <div style={{ color: "#9ca3af", fontSize: 10, lineHeight: 1.6 }}>
              <strong style={{ color: "#d1d5db" }}>Nota CORS:</strong> Se il fetch automatico della pagina fallisce
              per CORS (comune nei siti Figma Make), puoi sempre aprire la pagina /flow-documentation nel browser,
              selezionare tutto il testo (Ctrl+A), copiarlo, e incollarlo manualmente nella modalita "Incolla manualmente"
              del Flow Documentation Reader.
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/*  SECONDARY: Accordion sections — Reference material                */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          <div className="mt-2">
            <div className="flex items-center gap-2 mb-2 px-1">
              <div style={{ height: 1, flex: 1, background: "#2d2d44" }} />
              <span style={{ color: "#6b7280", fontSize: 10, whiteSpace: "nowrap" }}>
                Approfondimenti e riferimenti
              </span>
              <div style={{ height: 1, flex: 1, background: "#2d2d44" }} />
            </div>

            <div className="flex flex-col gap-2">
              {/* ── JSON Format ── */}
              <HelpSection
                title="Formato JSON — Massima precisione (consigliato)"
                icon={<FileJson size={13} />}
                color="#22c55e"
              >
                <div style={{ color: "#9ca3af", fontSize: 11, lineHeight: 1.7 }}>
                  <p>
                    Il formato JSON garantisce il <strong style={{ color: "#86efac" }}>100% di precisione</strong> nel parsing.
                    La pagina <Tag>/flow-documentation</Tag> deve contenere un unico blocco JSON
                    racchiuso tra <Tag color="#22c55e">```json</Tag> e <Tag color="#22c55e">```</Tag>.
                  </p>

                  <div className="mt-3 mb-1" style={{ color: "#e2e8f0", fontSize: 11 }}>
                    Struttura root dell'oggetto:
                  </div>

                  <CodeBlock
                    lang="JSON"
                    label="Struttura completa"
                    code={`{
  "siteUrl": "https://NOME-DEL-TUO-SITO.figma.site",
  "screens": [ ... ],       // OBBLIGATORIO — elenco di tutte le schermate
  "connections": [ ... ],   // OBBLIGATORIO — tutte le transizioni tra schermate
  "decisions": [ ... ],     // Opzionale — nodi decisione (rombi)
  "flows": [ ... ],         // Opzionale — percorsi nominati
  "notes": [ ... ]          // Opzionale — note testuali
}`}
                  />

                  {/* siteUrl */}
                  <div className="mt-4 mb-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: "#818cf8" }} />
                    <span style={{ color: "#e2e8f0", fontSize: 11 }}>siteUrl (opzionale — auto-rilevato)</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.6, marginBottom: 6 }}>
                    L'URL base del tuo sito. FlowMapper lo rileva automaticamente dal dominio corrente (window.location.origin)
                    e lo combina con il campo <Tag>route</Tag> di ogni schermata per generare i link alle anteprime (es:{" "}
                    <Tag color="#818cf8">https://mio-sito.figma.site</Tag> + <Tag>/login</Tag> ={" "}
                    <Tag color="#22c55e">https://mio-sito.figma.site/login</Tag>).
                    Puoi includere questo campo nel JSON per sovrascrivere il valore auto-rilevato.
                  </div>

                  {/* screens */}
                  <div className="mt-4 mb-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: "#3b82f6" }} />
                    <span style={{ color: "#e2e8f0", fontSize: 11 }}>screens (obbligatorio)</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.6, marginBottom: 6 }}>
                    Ogni screen rappresenta una pagina / schermata del sito.
                  </div>
                  <CodeBlock
                    code={`{
  "id": "login",                    // OBBLIGATORIO - ID unico, kebab-case
  "name": "Login",                  // OBBLIGATORIO - Nome leggibile (mostrato nel nodo)
  "route": "/login",                // Consigliato - Percorso URL della pagina
  "description": "Form di accesso"  // Opzionale - Descrizione breve
}`}
                  />
                  <div className="mt-1 mb-3 px-3 py-2 rounded" style={{ background: "#1e1e2e" }}>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>
                      Alias accettati: <Tag>name</Tag> <Tag>label</Tag> <Tag>title</Tag> per il nome;{" "}
                      <Tag>route</Tag> <Tag>path</Tag> <Tag>url</Tag> per il percorso;{" "}
                      <Tag>description</Tag> <Tag>desc</Tag> per la descrizione.{" "}
                      La chiave root puo essere <Tag>screens</Tag>, <Tag>pages</Tag> o <Tag>nodes</Tag>.
                    </div>
                  </div>

                  {/* connections */}
                  <div className="mt-4 mb-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
                    <span style={{ color: "#e2e8f0", fontSize: 11 }}>connections (obbligatorio)</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.6, marginBottom: 6 }}>
                    Ogni connection definisce una transizione tra due schermate.
                  </div>
                  <CodeBlock
                    code={`{
  "from": "login",                              // OBBLIGATORIO - ID dello screen sorgente
  "to": "dashboard",                            // OBBLIGATORIO - ID dello screen destinazione
  "trigger": "Submit form (credenziali OK)",     // OBBLIGATORIO - Azione che innesca la transizione
  "flowType": "happy",                          // OBBLIGATORIO - Tipo di flusso (vedi sotto)
  "condition": "yes",                           // Opzionale - "yes" o "no" (solo per uscite da decisioni)
  "reason": "Autenticazione riuscita"           // Opzionale - Motivazione UX della transizione
}`}
                  />
                  <div className="mt-1 mb-3 px-3 py-2 rounded" style={{ background: "#1e1e2e" }}>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>
                      Alias accettati: <Tag>from</Tag> <Tag>source</Tag> <Tag>sourceId</Tag>;{" "}
                      <Tag>to</Tag> <Tag>target</Tag> <Tag>destination</Tag> <Tag>destinationId</Tag>;{" "}
                      <Tag>trigger</Tag> <Tag>label</Tag> <Tag>action</Tag>;{" "}
                      <Tag>reason</Tag> <Tag>motivation</Tag> <Tag>rationale</Tag>.{" "}
                      La chiave root puo essere <Tag>connections</Tag>, <Tag>edges</Tag>, <Tag>transitions</Tag> o <Tag>links</Tag>.
                    </div>
                  </div>

                  {/* decisions */}
                  <div className="mt-4 mb-1 flex items-center gap-2">
                    <Diamond size={10} style={{ color: "#a855f7" }} />
                    <span style={{ color: "#e2e8f0", fontSize: 11 }}>decisions (opzionale)</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.6, marginBottom: 6 }}>
                    I nodi decisione vengono renderizzati come rombi nel diagramma.
                    Ogni decisione genera automaticamente due archi: SI (verde) e NO (colorato in base al contesto).
                  </div>
                  <CodeBlock
                    code={`{
  "id": "dec-auth",                 // OBBLIGATORIO - ID unico
  "question": "Credenziali valide?", // OBBLIGATORIO - Domanda (max 3-5 parole)
  "yesTarget": "dashboard",         // OBBLIGATORIO - ID screen per SI
  "noTarget": "login",              // OBBLIGATORIO - ID screen per NO
  "sourceId": "login",              // CONSIGLIATO - ID screen che PRECEDE la decisione
  "noFlowType": "error"             // Opzionale - "error"|"variant"|"secondary"|"skip"
}`}
                  />
                  <div className="mt-1 mb-1 px-3 py-2 rounded" style={{ background: "#1e1e2e" }}>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>
                      Alias accettati: <Tag>question</Tag> <Tag>condition</Tag> <Tag>label</Tag>;{" "}
                      <Tag>yesTarget</Tag> <Tag>yes</Tag> <Tag>truePath</Tag>;{" "}
                      <Tag>noTarget</Tag> <Tag>no</Tag> <Tag>falsePath</Tag>;{" "}
                      <Tag>sourceId</Tag> <Tag>source</Tag> <Tag>from</Tag>.{" "}
                      La chiave root puo essere <Tag>decisions</Tag> o <Tag>decisionNodes</Tag>.
                    </div>
                  </div>
                  <div className="mt-1 mb-3 px-3 py-2 rounded" style={{ background: "#0f2a1a", border: "1px solid #16653220" }}>
                    <div style={{ fontSize: 10, color: "#86efac", lineHeight: 1.5 }}>
                      <strong>3 regole d'oro per i diamanti:</strong><br />
                      1. <strong>question</strong> breve (max 3-5 parole): "Saldo OK?", "OTP corretto?"<br />
                      2. <strong>sourceId</strong>: indica sempre la screen che precede la decisione — senza, il diamante resta orfano<br />
                      3. <strong>noFlowType</strong>: usa "error" solo se il NO è un fallimento reale; altrimenti usa "variant" o "secondary"<br />
                      4. Inserisci le "question" direttamente negli <strong>steps dei flows</strong> per la modalità corsie
                    </div>
                  </div>

                  {/* flows */}
                  <div className="mt-4 mb-1 flex items-center gap-2">
                    <GitBranch size={10} style={{ color: "#f59e0b" }} />
                    <span style={{ color: "#e2e8f0", fontSize: 11 }}>flows (opzionale)</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.6, marginBottom: 6 }}>
                    I flows definiscono percorsi utente nominati. Ogni step genera automaticamente
                    una connessione al successivo. Essenziale per la <strong style={{ color: "#86efac" }}>modalita corsie</strong>.
                  </div>
                  <CodeBlock
                    code={`{
  "name": "Happy Path - Acquisto",
  "flowType": "happy",
  "steps": ["Homepage", "Prodotto", "Carrello", "Codice sconto valido?", "Checkout", "Conferma"]
  // CONSIGLIO: inserisci le "question" dei nodi decisione direttamente negli steps,
  // nella posizione corretta. Cosi' il diamante sara' inline nella corsia!
}`}
                  />
                  <div className="mt-1 mb-3 px-3 py-2 rounded" style={{ background: "#1e1e2e" }}>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>
                      Alias accettati: <Tag>name</Tag> <Tag>label</Tag>;{" "}
                      <Tag>steps</Tag> <Tag>routes</Tag> <Tag>pages</Tag>.{" "}
                      La chiave root puo essere <Tag>flows</Tag>, <Tag>paths</Tag> o <Tag>userFlows</Tag>.
                    </div>
                  </div>
                </div>
              </HelpSection>

              {/* ── flowType values ── */}
              <HelpSection
                title="Valori flowType — Tipi di flusso e colori"
                icon={<Palette size={13} />}
                color="#f59e0b"
              >
                <div className="flex flex-col gap-2">
                  {([
                    {
                      type: "happy",
                      color: "#22c55e",
                      label: "Happy Path",
                      desc: "Percorso principale e ideale dell'utente. Tutto va come previsto.",
                      aliases: "happy, main, primary",
                    },
                    {
                      type: "error",
                      color: "#ef4444",
                      label: "Error Flow",
                      desc: "Percorso di errore: validazione fallita, autenticazione negata, timeout, ecc.",
                      aliases: "error, failure, fail",
                    },
                    {
                      type: "secondary",
                      color: "#3b82f6",
                      label: "Secondary Flow",
                      desc: "Percorso secondario ma valido. Es: accesso via social login, percorso alternativo.",
                      aliases: "secondary, sub, alternative",
                    },
                    {
                      type: "skip",
                      color: "#9ca3af",
                      label: "Skip / Conditional",
                      desc: "Transizione condizionale o salto. L'utente salta un passaggio opzionale.",
                      aliases: "skip, conditional",
                    },
                    {
                      type: "variant",
                      color: "#f59e0b",
                      label: "Variant",
                      desc: "Variante del flusso: percorso alternativo che converge con l'happy path.",
                      aliases: "variant, alt, alternative",
                    },
                  ] as const).map((ft) => (
                    <div
                      key={ft.type}
                      className="flex items-start gap-3 px-3 py-2 rounded-md"
                      style={{ background: `${ft.color}0a`, border: `1px solid ${ft.color}20` }}
                    >
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
                        style={{ background: ft.color }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <Tag color={ft.color}>{ft.type}</Tag>
                          <span style={{ color: ft.color, fontSize: 11 }}>{ft.label}</span>
                        </div>
                        <div style={{ color: "#9ca3af", fontSize: 10, marginTop: 2 }}>{ft.desc}</div>
                        <div style={{ color: "#6b7280", fontSize: 9, marginTop: 2 }}>
                          Alias accettati: {ft.aliases}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </HelpSection>

              {/* ── Decision nodes ── */}
              <HelpSection
                title="Nodi decisione — Come creare punti condizionali"
                icon={<Diamond size={13} />}
                color="#a855f7"
              >
                <div style={{ color: "#9ca3af", fontSize: 11, lineHeight: 1.7 }}>
                  <p>
                    I nodi decisione vengono renderizzati come <strong style={{ color: "#c4b5fd" }}>rombi (diamond)</strong> nel
                    diagramma. Ognuno ha due uscite: <span style={{ color: "#86efac" }}>SI</span> e{" "}
                    <span style={{ color: "#fca5a5" }}>NO</span>.
                  </p>

                  <div className="mt-2 mb-1" style={{ color: "#e2e8f0", fontSize: 11 }}>
                    Ci sono due modi per definirli:
                  </div>

                  <div className="mt-2 p-3 rounded-md" style={{ background: "#1e1e2e" }}>
                    <div style={{ color: "#c4b5fd", fontSize: 10 }}>
                      Modo 1 — Nell'array "decisions" (consigliato)
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 10, marginTop: 4 }}>
                      La question viene usata come nome del nodo nel diagramma. yesTarget e noTarget
                      generano automaticamente le connessioni con i badge SI/NO colorati.
                      Non serve creare manualmente le connessioni in uscita.
                    </div>
                  </div>

                  <div className="mt-2 p-3 rounded-md" style={{ background: "#1e1e2e" }}>
                    <div style={{ color: "#c4b5fd", fontSize: 10 }}>
                      Modo 2 — Come connection con condition
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 10, marginTop: 4 }}>
                      Se non usi l'array "decisions", puoi aggiungere <Tag>condition: "yes"</Tag> o{" "}
                      <Tag>condition: "no"</Tag> nelle connections. Il nodo sorgente verra
                      automaticamente riconosciuto come nodo decisione.
                    </div>
                  </div>

                  <CodeBlock
                    label="Esempio completo con decisions"
                    lang="JSON"
                    code={`{
  "screens": [
    { "id": "cart", "name": "Carrello", "route": "/cart" },
    { "id": "checkout", "name": "Checkout", "route": "/checkout" },
    { "id": "promo-page", "name": "Pagina Promo", "route": "/promo" }
  ],
  "decisions": [
    {
      "id": "dec-promo",
      "question": "Ha codice sconto?",
      "yesTarget": "promo-page",
      "noTarget": "checkout",
      "sourceId": "cart",
      "noFlowType": "variant"
    }
  ],
  "flows": [
    {
      "name": "Happy Path",
      "flowType": "happy",
      "steps": ["Carrello", "Ha codice sconto?", "Pagina Promo", "Checkout"]
    }
  ],
  "connections": [
    {
      "from": "cart",
      "to": "dec-promo",
      "trigger": "Click Procedi",
      "flowType": "happy"
    }
  ]
}`}
                  />

                  <div
                    className="mt-2 flex items-start gap-2 p-2 rounded"
                    style={{ background: "#2d1b0e", border: "1px solid #92400e30" }}
                  >
                    <AlertTriangle size={12} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
                    <span style={{ color: "#fde68a", fontSize: 10, lineHeight: 1.5 }}>
                      <strong>Nota:</strong> La "question" nel nodo decisione diventa il nome mostrato dentro il rombo.
                      Mantienila breve (max 3-5 parole) per una resa grafica ottimale. Es: "Utente loggato?",
                      "Carrello vuoto?", "Ha permessi?".
                    </span>
                  </div>
                </div>
              </HelpSection>

              {/* ── Alternative formats ── */}
              <HelpSection
                title="Formati alternativi — Frecce e Markdown (meno precisi)"
                icon={<ArrowRight size={13} />}
                color="#6b7280"
              >
                <div style={{ color: "#9ca3af", fontSize: 11, lineHeight: 1.7 }}>
                  <div
                    className="flex items-start gap-2 p-2 rounded mb-3"
                    style={{ background: "#1e1e2e", border: "1px solid #2d2d44" }}
                  >
                    <Info size={12} style={{ color: "#818cf8", flexShrink: 0, marginTop: 2 }} />
                    <span style={{ color: "#d1d5db", fontSize: 10, lineHeight: 1.5 }}>
                      Questi formati sono supportati come fallback, ma il <strong>JSON strutturato</strong> offre
                      il massimo livello di dettaglio e precisione. Usa questi formati solo se non puoi generare JSON.
                    </span>
                  </div>

                  <div className="mb-1" style={{ color: "#e2e8f0", fontSize: 11 }}>
                    Notazione freccia
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>
                    Una transizione per riga. Il trigger e opzionale tra parentesi. Il parser riconosce:
                    <Tag>→</Tag> <Tag>{"->"}</Tag> <Tag>{"=>"}</Tag>
                  </div>
                  <CodeBlock
                    code={`Homepage → Login (Click "Accedi")
Login → Dashboard (Submit credenziali valide)
Login → Login (Errore autenticazione)
Dashboard → Profilo (Click avatar)`}
                  />

                  <div className="mt-3 mb-1" style={{ color: "#e2e8f0", fontSize: 11 }}>
                    Percorsi con route
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>
                    Ogni riga ha il percorso URL, un trattino, e il nome leggibile.
                  </div>
                  <CodeBlock
                    code={`/home - Homepage
/login - Login
/dashboard - Dashboard
/profile - Profilo utente`}
                  />

                  <div className="mt-3 mb-1" style={{ color: "#e2e8f0", fontSize: 11 }}>
                    Flussi nominati
                  </div>
                  <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>
                    Definisci percorsi interi con nome e tipo.
                    Il parser riconosce: Happy Path, Error Path/Flow, Secondary, Variant.
                  </div>
                  <CodeBlock
                    code={`Happy Path: Homepage → Login → Dashboard → Profilo
Error Flow: Homepage → Login → Login
Secondary Path: Homepage → Registrazione → Dashboard
Variant Path: Homepage → Login → Dashboard → Admin Panel`}
                  />

                  <div
                    className="mt-3 flex items-start gap-2 p-2 rounded"
                    style={{ background: "#2d1500", border: "1px solid #713f1230" }}
                  >
                    <AlertTriangle size={12} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 2 }} />
                    <span style={{ color: "#fde68a", fontSize: 10, lineHeight: 1.5 }}>
                      <strong>Limiti dei formati testuali:</strong> Non supportano reason, description,
                      condition, o nodi decisione espliciti. Il tipo di flusso viene dedotto dal contesto
                      della riga (parole come "error", "skip", "variant"). Per diagrammi complessi,
                      usa sempre il JSON.
                    </span>
                  </div>
                </div>
              </HelpSection>

              {/* ── Best practices ── */}
              <HelpSection
                title="Best practice per diagrammi ottimali"
                icon={<Sparkles size={13} />}
                color="#818cf8"
              >
                <div className="flex flex-col gap-2.5" style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.6 }}>
                  <div className="flex items-start gap-2">
                    <Check size={11} style={{ color: "#22c55e", flexShrink: 0, marginTop: 2 }} />
                    <span>
                      <strong style={{ color: "#e2e8f0" }}>Usa id consistenti.</strong>{" "}
                      I campi "from" e "to" nelle connections devono corrispondere esattamente agli "id" nelle screens.
                      Usa kebab-case: <Tag>user-profile</Tag>, non <Tag>User Profile</Tag>.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={11} style={{ color: "#22c55e", flexShrink: 0, marginTop: 2 }} />
                    <span>
                      <strong style={{ color: "#e2e8f0" }}>Nomi brevi e chiari.</strong>{" "}
                      Il campo "name" viene mostrato dentro il nodo. Mantienilo sotto le 20 caratteri
                      per una resa grafica ottimale.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={11} style={{ color: "#22c55e", flexShrink: 0, marginTop: 2 }} />
                    <span>
                      <strong style={{ color: "#e2e8f0" }}>Trigger descrittivi.</strong>{" "}
                      Descrivi l'azione utente che innesca la transizione: "Click bottone Compra",
                      "Submit form login", "Timeout sessione". Non usare trigger generici come "Navigate".
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={11} style={{ color: "#22c55e", flexShrink: 0, marginTop: 2 }} />
                    <span>
                      <strong style={{ color: "#e2e8f0" }}>Aggiungi le reason.</strong>{" "}
                      Il campo "reason" nelle connections migliora significativamente la comprensione del diagramma.
                      Spiega <em>perche</em> quella transizione esiste dal punto di vista UX.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={11} style={{ color: "#22c55e", flexShrink: 0, marginTop: 2 }} />
                    <span>
                      <strong style={{ color: "#e2e8f0" }}>Definisci piu flowType.</strong>{" "}
                      Non limitarti all'happy path. Un buon diagramma ha almeno un error flow e un secondary flow.
                      Questo aiuta a identificare le aree critiche dell'esperienza utente.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={11} style={{ color: "#22c55e", flexShrink: 0, marginTop: 2 }} />
                    <span>
                      <strong style={{ color: "#e2e8f0" }}>Usa decisioni per i branch.</strong>{" "}
                      Ogni volta che l'utente puo prendere due strade diverse in base a una condizione,
                      crea un nodo decisione. Rendono il diagramma molto piu leggibile.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={11} style={{ color: "#22c55e", flexShrink: 0, marginTop: 2 }} />
                    <span>
                      <strong style={{ color: "#e2e8f0" }}>Solo JSON, nessun testo extra.</strong>{" "}
                      La pagina /flow-documentation deve contenere SOLO il blocco JSON.
                      Non aggiungere titoli, descrizioni o contenuti fuori dal blocco{" "}
                      <Tag color="#22c55e">```json ... ```</Tag>.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Check size={11} style={{ color: "#22c55e", flexShrink: 0, marginTop: 2 }} />
                    <span>
                      <strong style={{ color: "#e2e8f0" }}>Steps nei flows = nomi screen.</strong>{" "}
                      L'array "steps" nei flows deve usare i <strong>nomi leggibili</strong> (campo "name")
                      delle screen, non gli id. Il parser fa fuzzy matching, ma i nomi esatti funzionano meglio.
                    </span>
                  </div>
                </div>
              </HelpSection>
            </div>
          </div>
        </div>

        {/* ═══ Footer ═══ */}
        <div
          className="flex items-center justify-end px-5 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid #1f2937", background: "#0d0d18" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-xs"
            style={{ background: "#1e1e2e", border: "1px solid #2d2d44", color: "#d1d5db" }}
          >
            Ho capito, chiudi
          </button>
        </div>
      </div>
    </div>
  );
}