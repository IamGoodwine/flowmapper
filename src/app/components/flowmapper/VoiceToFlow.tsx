import React, { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Sparkles, X, Key, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { ThemeTokens } from "./ThemeContext";
import type { Screen, Connection, Section } from "./types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceFlowResult {
  screens: Screen[];
  connections: Connection[];
  sections: Section[];
}

interface VoiceToFlowProps {
  theme: ThemeTokens;
  onConfirm: (result: VoiceFlowResult) => void;
  onClose: () => void;
}

// ── Gemini API ────────────────────────────────────────────────────────────────

const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash-8b",
];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RETRIES = 3;
const LS_KEY = "flowmapper_gemini_key";

const SYSTEM_PROMPT = `Sei un assistente esperto in UX che converte descrizioni verbali di flussi utente in JSON strutturato.

Dato il testo che descrive un flusso utente, genera un JSON con questa struttura esatta:
{
  "screens": [
    { "id": "s1", "name": "Nome Schermata", "x": 100, "y": 100, "width": 160, "height": 90, "figmaFrameId": "s1", "nodeKind": "screen" }
  ],
  "connections": [
    { "id": "c1", "sourceId": "s1", "destinationId": "s2", "trigger": "descrizione azione", "flowType": "happy" }
  ],
  "sections": []
}

Regole:
- nodeKind: "screen" per schermate normali, "decision" per punti di scelta/condizione
- Per i nodi "decision" aggiungi il campo "question" con la domanda (es. "Utente autenticato?")
- flowType: "happy" (flusso principale), "secondary" (flusso secondario), "error" (errore), "skip" (condizionale/bypass), "variant" (variante)
- trigger: breve descrizione dell'azione che scatena la transizione (es. "Clicca su Accedi", "Compila il form")
- Posiziona i nodi con x che aumenta di 300 per ogni step, y=100 per il flusso principale, y=400 per flussi secondari/errore
- Gli id devono essere stringhe univoche (s1, s2, ... per screen; c1, c2, ... per connessioni)
- Restituisci SOLO il JSON grezzo, senza markdown, senza backtick, senza spiegazioni.`;

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function callGeminiModel(apiKey: string, model: string, transcript: string): Promise<VoiceFlowResult> {
  const response = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nTesto da analizzare:\n${transcript}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
    })
  });

  if (response.status === 404) throw new Error("MODEL_NOT_FOUND");

  // 429 = rate limit, 503 = overloaded — entrambi retriable
  if (response.status === 429 || response.status === 503) {
    const body = await response.json().catch(() => ({}));
    const msg = (body as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`;
    throw new Error(`RETRIABLE:${msg}`);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = (body as { error?: { message?: string } }).error?.message ?? response.status;
    throw new Error(`GEMINI_ERROR:${detail}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned) as VoiceFlowResult;
}

async function callGemini(
  apiKey: string,
  transcript: string,
  onRetry?: (msg: string) => void
): Promise<VoiceFlowResult> {
  let lastErr: Error = new Error("No models tried");

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await callGeminiModel(apiKey, model, transcript);
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));

        if (lastErr.message.startsWith("RETRIABLE:")) {
          const waitSec = Math.pow(2, attempt); // 1s, 2s, 4s
          onRetry?.(`Gemini sovraccarico — riprovo con ${model} tra ${waitSec}s... (tentativo ${attempt + 1}/${MAX_RETRIES})`);
          await sleep(waitSec * 1000);
          continue; // retry same model
        }

        break; // MODEL_NOT_FOUND or other → try next model
      }
    }
  }
  throw lastErr;
}

// ── Heuristic fallback parser ─────────────────────────────────────────────────

function parseHeuristic(transcript: string): VoiceFlowResult {
  const screens: Screen[] = [];
  const connections: Connection[] = [];

  // Patterns to extract screen names (Italian + English)
  const screenPatterns = [
    /(?:pagina|schermata|sezione|vista|step|passaggio|home|login|dashboard|profilo|carrello|checkout|conferma|errore|successo)\s+(?:di\s+)?([a-zàèéìòùA-Z][a-zA-ZàèéìòùÀÈÉÌÒÙ\s]{1,30})?/gi,
    /(?:va(?:do|i)?|porta|naviga|reindirizza|accede)\s+(?:a(?:lla?|l)?\s+)?([A-ZÀ-Ù][a-zA-ZàèéìòùÀÈÉÌÒÙ\s]{1,25})/g,
  ];

  // Split on transition keywords and extract nodes
  const parts = transcript
    .split(/\s+(?:poi|quindi|dopo|successivamente|e poi|che porta a|il quale va a|che va a|verso|a)\s+/i)
    .map(p => p.trim())
    .filter(Boolean);

  const nodeNames: string[] = [];

  parts.forEach(part => {
    // Clean the part and extract a meaningful name
    const cleaned = part
      .replace(/^(?:l[''']utente|il sistema|l[''']app|l[''']applicazione|l[''']applicativo)\s+/i, "")
      .replace(/^(?:si trova su|è su|apre|vede|visualizza|clicca su|preme)\s+/i, "")
      .replace(/^(?:la\s+|il\s+|lo\s+|un[ao]?\s+)/i, "")
      .trim();

    if (cleaned.length > 1 && cleaned.length < 40) {
      // Capitalize first letter
      const name = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      if (!nodeNames.includes(name)) nodeNames.push(name);
    }
  });

  // Fallback: extract capitalized words as screen names
  if (nodeNames.length < 2) {
    const words = transcript.match(/[A-ZÀ-Ù][a-zA-ZàèéìòùÀÈÉÌÒÙ]{2,}/g) ?? [];
    words.forEach(w => { if (!nodeNames.includes(w)) nodeNames.push(w); });
  }

  // Build screens
  const isDecision = (name: string) =>
    /\?|se |condizione|scelta|decisione|verifica|controlla/i.test(name);

  nodeNames.slice(0, 10).forEach((name, i) => {
    screens.push({
      id: `s${i + 1}`,
      name,
      x: 100 + i * 300,
      y: 100,
      width: 160,
      height: 90,
      figmaFrameId: `s${i + 1}`,
      nodeKind: isDecision(name) ? "decision" : "screen",
      question: isDecision(name) ? name : undefined,
    });
  });

  // Build connections (linear happy path)
  const triggerWords = transcript.match(
    /(?:clicca(?:ndo)? su|preme|seleziona|conferma|invia|accede|effettua il login)[^,.;]*/gi
  ) ?? [];

  screens.forEach((screen, i) => {
    if (i < screens.length - 1) {
      connections.push({
        id: `c${i + 1}`,
        sourceId: screen.id,
        destinationId: screens[i + 1].id,
        trigger: triggerWords[i] ?? "Continua",
        flowType: "happy",
      });
    }
  });

  return { screens, connections, sections: [] };
}

// ── Web Speech API ────────────────────────────────────────────────────────────

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionResultList = {
  [index: number]: SpeechRecognitionResult;
  length: number;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
};

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionErrorEvent = { error: string };

function createSpeechRecognition(): SpeechRecognitionInstance | null {
  const SR = (window as unknown as Record<string, unknown>).SpeechRecognition
    ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  if (!SR) return null;
  return new (SR as new () => SpeechRecognitionInstance)();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VoiceToFlow({ theme: t, onConfirm, onClose }: VoiceToFlowProps) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_KEY) ?? "");
  const [showKeyInput, setShowKeyInput] = useState(!localStorage.getItem(LS_KEY));
  const [keyInput, setKeyInput] = useState("");

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error" | "fallback">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [preview, setPreview] = useState<VoiceFlowResult | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const hasSpeechSupport = !!createSpeechRecognition();

  // ── Speech ──────────────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    const rec = createSpeechRecognition();
    if (!rec) return;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "it-IT";

    rec.onresult = (e) => {
      let final = transcript;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += (final ? " " : "") + t;
        else interim = t;
      }
      setTranscript(final);
      setInterimText(interim);
    };

    rec.onerror = (e) => {
      setErrorMsg(`Errore microfono: ${e.error}`);
      setIsListening(false);
    };

    rec.onend = () => setIsListening(false);

    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
    setStatus("idle");
    setPreview(null);
  }, [transcript]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText("");
  }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  // ── Generate ────────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    const text = transcript.trim();
    if (!text) return;
    setStatus("loading");
    setErrorMsg("");
    setPreview(null);

    try {
      const result = await callGemini(apiKey, text, (msg) => setErrorMsg(msg));
      setPreview(result);
      setStatus("success");
      setErrorMsg("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("RETRIABLE:")) {
        setErrorMsg(`Gemini sovraccarico dopo ${MAX_RETRIES} tentativi su tutti i modelli. Usa il parser locale o riprova tra qualche minuto.`);
      } else {
        setErrorMsg(`Gemini non disponibile: ${msg.replace("GEMINI_ERROR:", "")}. Uso il parser locale.`);
      }
      const fallback = parseHeuristic(text);
      setPreview(fallback);
      setStatus("fallback");
    }
  }, [apiKey, transcript]);

  const handleHeuristic = useCallback(() => {
    const text = transcript.trim();
    if (!text) return;
    setPreview(parseHeuristic(text));
    setStatus("fallback");
  }, [transcript]);

  const handleSaveKey = () => {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem(LS_KEY, k);
    setApiKey(k);
    setShowKeyInput(false);
  };

  // ── Styles ──────────────────────────────────────────────────────────────────

  const overlay: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 9999,
    background: "rgba(0,0,0,0.6)", display: "flex",
    alignItems: "center", justifyContent: "center",
  };

  const modal: React.CSSProperties = {
    background: t.panelBg, border: `1px solid ${t.panelBorder}`,
    borderRadius: 16, padding: 28, width: 540, maxWidth: "95vw",
    maxHeight: "90vh", overflowY: "auto",
    boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
  };

  const btn = (bg: string, color = "#fff"): React.CSSProperties => ({
    background: bg, color, border: "none", borderRadius: 8,
    padding: "8px 16px", cursor: "pointer", fontWeight: 600,
    fontSize: 13, display: "flex", alignItems: "center", gap: 6,
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Mic size={20} color={t.accent} />
            <span style={{ color: t.textPrimary, fontWeight: 700, fontSize: 16 }}>
              Voice to Flow
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: t.textMuted }}>
            <X size={18} />
          </button>
        </div>

        {/* API Key section */}
        {showKeyInput ? (
          <div style={{ background: t.surface, borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Key size={14} color={t.accent} />
              <span style={{ color: t.textPrimary, fontWeight: 600, fontSize: 13 }}>Gemini API Key</span>
            </div>
            <p style={{ color: t.textMuted, fontSize: 12, marginBottom: 10 }}>
              Ottieni la tua chiave gratuita su{" "}
              <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer"
                style={{ color: t.accent }}>aistudio.google.com</a>.
              Viene salvata solo nel browser, mai inviata altrove.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="password"
                placeholder="AIza..."
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSaveKey()}
                style={{
                  flex: 1, background: t.canvasBg, border: `1px solid ${t.surfaceBorder}`,
                  borderRadius: 6, padding: "7px 10px", color: t.text, fontSize: 13,
                }}
              />
              <button style={btn(t.accent)} onClick={handleSaveKey}>Salva</button>
              <button
                style={{ ...btn("transparent", t.textMuted), border: `1px solid ${t.surfaceBorder}` }}
                onClick={() => setShowKeyInput(false)}
              >
                Salta
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              style={{ background: "none", border: "none", cursor: "pointer", color: t.textMuted, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
              onClick={() => { setKeyInput(""); setShowKeyInput(true); }}
            >
              <Key size={12} /> Cambia API key
            </button>
          </div>
        )}

        {/* Mic button */}
        {!showKeyInput && (
          <>
            {!hasSpeechSupport && (
              <div style={{ background: "#7f1d1d22", border: "1px solid #ef4444", borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>
                  Il tuo browser non supporta la Web Speech API. Usa Chrome o Edge, oppure digita il testo manualmente qui sotto.
                </p>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
              {hasSpeechSupport && (
                <button
                  style={{
                    ...btn(isListening ? "#ef4444" : t.accent),
                    padding: "12px 20px", borderRadius: 50, fontSize: 14,
                    animation: isListening ? "pulse 1.5s infinite" : "none",
                  }}
                  onClick={isListening ? stopListening : startListening}
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                  {isListening ? "Stop" : "Registra"}
                </button>
              )}
              {isListening && (
                <span style={{ color: "#ef4444", fontSize: 12, animation: "pulse 1s infinite" }}>
                  ● In ascolto...
                </span>
              )}
            </div>

            {/* Transcript area */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: t.textMuted, fontSize: 11, display: "block", marginBottom: 6 }}>
                TRASCRIZIONE
              </label>
              <textarea
                value={transcript + (interimText ? ` ${interimText}` : "")}
                onChange={e => setTranscript(e.target.value)}
                placeholder={`Es: "L'utente apre la Home, poi clicca su Accedi e va alla pagina di Login. Se le credenziali sono corrette va alla Dashboard, altrimenti vede un messaggio di errore."`}
                rows={5}
                style={{
                  width: "100%", background: t.canvasBg, border: `1px solid ${t.surfaceBorder}`,
                  borderRadius: 8, padding: 12, color: t.text, fontSize: 13,
                  resize: "vertical", boxSizing: "border-box", lineHeight: 1.5,
                }}
              />
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button
                style={{ ...btn(t.accent), flex: 1, justifyContent: "center" }}
                onClick={handleGenerate}
                disabled={!transcript.trim() || status === "loading" || !apiKey}
              >
                {status === "loading"
                  ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> Generazione...</>
                  : <><Sparkles size={15} /> Genera con Gemini</>
                }
              </button>
              <button
                style={{ ...btn(t.surface, t.text), border: `1px solid ${t.accent}`, opacity: transcript.trim() ? 1 : 0.4 }}
                onClick={handleHeuristic}
                disabled={!transcript.trim()}
                title="Usa il parser locale senza AI"
              >
                Parser locale
              </button>
            </div>

            {/* Status messages */}
            {status === "error" && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#7f1d1d22", border: "1px solid #ef4444", borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <AlertCircle size={15} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ color: "#ef4444", fontSize: 12 }}>{errorMsg}</span>
              </div>
            )}

            {(status === "fallback" && errorMsg) && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#78350f22", border: "1px solid #f59e0b", borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <AlertCircle size={15} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ color: "#f59e0b", fontSize: 12 }}>{errorMsg}</span>
              </div>
            )}

            {/* Preview */}
            {preview && (
              <div style={{ background: t.surface, border: `1px solid ${t.surfaceBorder}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <CheckCircle2 size={15} color="#22c55e" />
                  <span style={{ color: t.textPrimary, fontWeight: 600, fontSize: 13 }}>
                    Flusso generato {status === "fallback" ? "(parser locale)" : "(Gemini)"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                  <span style={{ color: t.textMuted, fontSize: 12 }}>
                    📱 <strong style={{ color: t.text }}>{preview.screens.length}</strong> schermate
                  </span>
                  <span style={{ color: t.textMuted, fontSize: 12 }}>
                    🔗 <strong style={{ color: t.text }}>{preview.connections.length}</strong> connessioni
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                  {preview.screens.map(s => (
                    <span key={s.id} style={{
                      background: t.canvasBg, border: `1px solid ${t.surfaceBorder}`,
                      borderRadius: 6, padding: "3px 8px", fontSize: 11, color: t.text,
                    }}>
                      {s.nodeKind === "decision" ? "◇ " : "▭ "}{s.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Confirm / Cancel */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                style={{ ...btn("transparent", t.textMuted), border: `1px solid ${t.surfaceBorder}` }}
                onClick={onClose}
              >
                Annulla
              </button>
              {preview && (
                <button
                  style={btn(t.accent)}
                  onClick={() => { onConfirm(preview); onClose(); }}
                >
                  <CheckCircle2 size={15} /> Importa nel diagramma
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}
