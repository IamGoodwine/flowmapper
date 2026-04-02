import React, { useState, useEffect } from "react";
import type { Screen, Connection, SelectedItem, FlowType } from "./types";
import { FLOW_COLORS, FLOW_LABELS } from "./types";
import {
  Eye, EyeOff, Loader2, Globe, Layout, Lightbulb,
  BookOpen, Copy, Check, ExternalLink, ArrowRight, ArrowLeft,
  Link2, X, Sparkles,
} from "lucide-react";
import { isFigmaMakeUrl } from "./figma-api";
import { useTheme } from "./ThemeContext";
import { FIGMA_MAKE_PROMPT } from "./FlowDocHelp";

// ─── Clipboard helper ──────────────────────────────────
function copyText(text: string): boolean {
  // Use execCommand fallback directly — clipboard API is blocked in iframes
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

// ═══════════════════════════════════════════════════════
//  Tutorial Modal — "Come importare i tuoi flow"
// ═══════════════════════════════════════════════════════

interface TutorialModalProps {
  onClose: () => void;
  onOpenFlowDoc?: () => void;
}

function TutorialModal({ onClose, onOpenFlowDoc }: TutorialModalProps) {
  const { theme: t } = useTheme();
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);

  const steps = [
    {
      num: 1,
      title: "Copia il prompt",
      body: "Questo prompt speciale dice a Figma Make di aggiungere al tuo sito una pagina nascosta che descrive tutti i tuoi flussi utente in formato JSON.\n\nNon ti preoccupare del contenuto tecnico: Figma Make fa tutto da solo!",
      action: "copy" as const,
    },
    {
      num: 2,
      title: "Incollalo in Figma Make",
      body: "Apri il tuo progetto in Figma Make.\n\nNella chat, incolla il prompt che hai appena copiato dopo le tue istruzioni. Poi clicca \"Make\" e aspetta che finisca.",
      tip: "Puoi aggiungere il prompt anche a un sito che hai gia' creato: Figma Make capira' da solo quali pagine e flow esistono.",
      action: "none" as const,
    },
    {
      num: 3,
      title: "Pubblica il sito",
      body: "Quando Figma Make ha finito, clicca il bottone \"Publish\" in alto a destra per mettere online il tuo sito.\n\nAdesso il sito ha una pagina segreta raggiungibile all'indirizzo /flow-documentation.",
      tip: "Puoi verificare che tutto funziona visitando tuosito.com/flow-documentation nel browser.",
      action: "none" as const,
    },
    {
      num: 4,
      title: "Importa in FlowMapper",
      body: "Ultimo step! Clicca il bottone qui sotto per aprire lo strumento Study Docs.\n\nIncolla l'URL del tuo sito pubblicato (es. https://miosito.figma.site) e FlowMapper generera' il diagramma automaticamente!",
      action: "import" as const,
    },
  ];

  const current = steps[step];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-lg mx-4 rounded-2xl overflow-hidden"
        style={{
          background: t.panelBg,
          border: `1px solid ${t.panelBorder}`,
          boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 pt-5 pb-4 flex items-start justify-between"
          style={{ borderBottom: `1px solid ${t.panelBorder}` }}
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} style={{ color: "#a855f7" }} />
              <span style={{ color: t.text, fontSize: 16 }}>
                Come importare i tuoi flow
              </span>
            </div>
            <span style={{ color: t.textMuted, fontSize: 12 }}>
              4 step per generare il tuo diagramma in automatico
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: t.textMuted, background: "transparent" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-6 pt-4 pb-0">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className="flex-1 rounded-full transition-all"
                style={{
                  height: 3,
                  background: i <= step ? "#a855f7" : t.surfaceBorder,
                  opacity: i <= step ? 1 : 0.5,
                }}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5" style={{ minHeight: 240 }}>
          {/* Step badge + title */}
          <div className="flex items-center gap-3 mb-4">
            <span
              className="flex items-center justify-center rounded-full flex-shrink-0"
              style={{
                width: 32, height: 32,
                background: "#a855f718",
                color: "#a855f7",
                fontSize: 14,
                fontWeight: 700,
                border: "1px solid #a855f730",
              }}
            >
              {current.num}
            </span>
            <span style={{ color: t.text, fontSize: 15 }}>
              {current.title}
            </span>
          </div>

          {/* Description */}
          <p style={{
            color: t.textMuted,
            fontSize: 13,
            lineHeight: 1.65,
            margin: 0,
            whiteSpace: "pre-line",
          }}>
            {current.body}
          </p>

          {/* Tip box */}
          {current.tip && (
            <div
              className="mt-4 px-3 py-2.5 rounded-lg flex items-start gap-2"
              style={{
                background: t.mode === "dark" ? "#1a1a2e" : "#f5f3ff",
                border: `1px solid ${t.mode === "dark" ? "#a855f720" : "#a855f730"}`,
              }}
            >
              <Lightbulb size={13} style={{ color: "#a855f7", flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: t.textPrimary, fontSize: 11, lineHeight: 1.5 }}>
                {current.tip}
              </span>
            </div>
          )}

          {/* Action: copy prompt */}
          {current.action === "copy" && (
            <button
              onClick={() => {
                if (copyText(FIGMA_MAKE_PROMPT)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 3000);
                }
              }}
              className="mt-5 w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm transition-all cursor-pointer"
              style={{
                background: copied
                  ? "linear-gradient(135deg, #14532d, #166534)"
                  : "linear-gradient(135deg, #a855f7, #7c3aed)",
                color: "white",
                border: "none",
                boxShadow: copied
                  ? "0 4px 15px rgba(34,197,94,0.25)"
                  : "0 4px 15px rgba(168,85,247,0.3)",
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copiato! Ora vai allo step 2 \u2192" : "Copia il prompt"}
            </button>
          )}

          {/* Action: open Study Docs */}
          {current.action === "import" && (
            <button
              onClick={() => {
                onClose();
                onOpenFlowDoc?.();
              }}
              className="mt-5 w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm transition-all cursor-pointer"
              style={{
                background: "linear-gradient(135deg, #a855f7, #7c3aed)",
                color: "white",
                border: "none",
                boxShadow: "0 4px 15px rgba(168,85,247,0.3)",
              }}
            >
              <ExternalLink size={15} />
              Apri Study Docs e importa
            </button>
          )}
        </div>

        {/* Footer nav */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderTop: `1px solid ${t.panelBorder}` }}
        >
          <button
            onClick={() => { setStep(Math.max(0, step - 1)); setCopied(false); }}
            disabled={isFirst}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer"
            style={{
              color: isFirst ? t.textDim : t.textPrimary,
              background: isFirst ? "transparent" : t.surface,
              border: isFirst ? "1px solid transparent" : `1px solid ${t.surfaceBorder}`,
              opacity: isFirst ? 0.4 : 1,
            }}
          >
            <ArrowLeft size={12} />
            Indietro
          </button>

          {/* Step dots */}
          <div className="flex items-center gap-2">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => { setStep(i); setCopied(false); }}
                className="transition-all cursor-pointer"
                style={{
                  width: step === i ? 18 : 7,
                  height: 7,
                  borderRadius: 4,
                  background: i <= step ? "#a855f7" : t.surfaceBorder,
                  border: "none",
                  opacity: i <= step ? 1 : 0.5,
                }}
              />
            ))}
          </div>

          <button
            onClick={() => { setStep(Math.min(steps.length - 1, step + 1)); setCopied(false); }}
            disabled={isLast}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer"
            style={{
              color: isLast ? t.textDim : "white",
              background: isLast ? "transparent" : "#a855f7",
              border: isLast ? "1px solid transparent" : "1px solid #a855f760",
              opacity: isLast ? 0.4 : 1,
            }}
          >
            Avanti
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  URL Input Modal — "Inserisci URL manualmente"
// ═══════════════════════════════════════════════════════

interface UrlModalProps {
  onClose: () => void;
  onAnalyze: (url: string, token: string) => void;
  onOpenScanner: (url: string) => void;
  loading: boolean;
  error: string | null;
}

function UrlModal({ onClose, onAnalyze, onOpenScanner, loading, error }: UrlModalProps) {
  const { theme: t } = useTheme();
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const isMakeMode = isFigmaMakeUrl(url);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, loading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isMakeMode) {
      onClose();
      onOpenScanner(url.trim());
    } else {
      onAnalyze(url.trim(), token.trim());
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl overflow-hidden"
        style={{
          background: t.panelBg,
          border: `1px solid ${t.panelBorder}`,
          boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 pt-5 pb-4 flex items-start justify-between"
          style={{ borderBottom: `1px solid ${t.panelBorder}` }}
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link2 size={16} style={{ color: t.accent }} />
              <span style={{ color: t.text, fontSize: 16 }}>
                Inserisci URL
              </span>
            </div>
            <span style={{ color: t.textMuted, fontSize: 12 }}>
              Analizza un prototipo Figma o un sito Figma Make
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: t.textMuted, background: "transparent" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-3">
          <div>
            <label
              className="block mb-1.5"
              style={{ color: t.textSecondary, fontSize: 11 }}
            >
              URL del prototipo o sito
            </label>
            <input
              type="text"
              placeholder="https://figma.com/proto/... oppure 'mock'"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{
                background: t.surface,
                border: `1px solid ${isMakeMode ? t.accent : t.surfaceBorder}`,
                color: t.text,
              }}
            />
          </div>

          {/* Figma Make badge */}
          {isMakeMode && (
            <div
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
              style={{
                background: t.accentBg,
                border: `1px solid ${t.accentBorder}`,
              }}
            >
              <Globe size={12} style={{ color: t.accentLight }} />
              <span className="text-xs" style={{ color: t.accentLight }}>
                Figma Make mode
              </span>
              <span className="text-xs" style={{ color: t.textMuted }}>
                — nessun token necessario
              </span>
            </div>
          )}

          {/* Token — solo per Figma API */}
          {!isMakeMode && (
            <div>
              <label
                className="block mb-1.5"
                style={{ color: t.textSecondary, fontSize: 11 }}
              >
                Personal Access Token (Figma)
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  placeholder="figd_..."
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full px-3 py-2.5 pr-9 rounded-lg text-sm outline-none"
                  style={{
                    background: t.surface,
                    border: `1px solid ${t.surfaceBorder}`,
                    color: t.text,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ color: t.textMuted, background: "transparent", border: "none" }}
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div
              className="text-xs px-3 py-2 rounded-lg"
              style={{
                background: t.mode === "dark" ? "#2d1b1b" : "#fef2f2",
                color: t.dangerText,
                border: `1px solid ${t.mode === "dark" ? "#5c2828" : "#fecaca"}`,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (!url.trim())}
            className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer mt-1"
            style={{
              background: loading ? "#3730a3" : t.accent,
              color: "white",
              border: "none",
              opacity: !url.trim() && !loading ? 0.5 : 1,
              cursor: loading || !url.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? (
              "Analisi in corso..."
            ) : isMakeMode ? (
              <>
                <Layout size={14} />
                Flow Builder
              </>
            ) : (
              "Analizza prototipo"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  Sidebar — main component
// ═══════════════════════════════════════════════════════

interface SidebarProps {
  onAnalyze: (url: string, token: string, extraRoutes?: string[]) => void;
  onOpenScanner: (url: string) => void;
  onOpenFlowDoc?: () => void;
  loading: boolean;
  error: string | null;
  screens: Screen[];
  connections: Connection[];
  selectedItem: SelectedItem | null;
  onUpdateConnection?: (id: string, updates: Partial<Connection>) => void;
  hiddenFlowTypes?: Set<FlowType>;
  onToggleFlowType?: (type: FlowType) => void;
  onSoloFlowType?: (type: FlowType) => void;
  onShowAllFlowTypes?: () => void;
}

export function Sidebar({
  onAnalyze,
  onOpenScanner,
  onOpenFlowDoc,
  loading,
  error,
  screens,
  connections,
  selectedItem,
  onUpdateConnection,
  hiddenFlowTypes = new Set(),
  onToggleFlowType,
  onSoloFlowType,
  onShowAllFlowTypes,
}: SidebarProps) {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [urlModalOpen, setUrlModalOpen] = useState(false);

  const selectedScreen =
    selectedItem?.type === "node"
      ? screens.find((s) => s.id === selectedItem.id)
      : null;
  const selectedConnection =
    selectedItem?.type === "edge"
      ? connections.find((c) => c.id === selectedItem.id)
      : null;

  const incomingConns = selectedScreen
    ? connections.filter((c) => c.destinationId === selectedScreen.id)
    : [];
  const outgoingConns = selectedScreen
    ? connections.filter((c) => c.sourceId === selectedScreen.id)
    : [];

  const theme = useTheme();
  const t = theme.theme;

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        width: 260,
        minWidth: 260,
        background: t.panelBg,
        borderRight: `1px solid ${t.panelBorder}`,
      }}
    >
      {/* Header */}
      <div
        className="px-4 pt-5 pb-3"
        style={{ borderBottom: `1px solid ${t.panelBorder}` }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span style={{ color: t.accent, fontSize: 20 }}>&#x2B21;</span>
          <span
            style={{ color: t.accentLight, fontSize: 16, fontFamily: "system-ui" }}
          >
            FlowMapper
          </span>
        </div>
        <span style={{ color: t.textMuted, fontSize: 11 }}>
          Figma Prototype Analyzer
        </span>
      </div>

      {/* ═══ CTA Buttons ═══ */}
      <div
        className="px-4 py-3 flex flex-col gap-2"
        style={{ borderBottom: `1px solid ${t.panelBorder}` }}
      >
        {/* Primary: Import flow tutorial */}
        <button
          onClick={() => setTutorialOpen(true)}
          className="w-full py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
          style={{
            background: "linear-gradient(135deg, #a855f7, #7c3aed)",
            color: "white",
            border: "none",
            boxShadow: "0 2px 10px rgba(168,85,247,0.25)",
          }}
        >
          <BookOpen size={14} />
          Importa i tuoi flow
        </button>

        {/* Secondary: Manual URL */}
        <button
          onClick={() => setUrlModalOpen(true)}
          className="w-full py-2 rounded-lg text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
          style={{
            background: "transparent",
            color: t.textSecondary,
            border: `1px solid ${t.surfaceBorder}`,
          }}
        >
          <Link2 size={12} />
          Inserisci URL manualmente
        </button>

        {loading && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: t.accentBg, border: `1px solid ${t.accentBorder}` }}
          >
            <Loader2 size={12} className="animate-spin" style={{ color: t.accentLight }} />
            <span className="text-xs" style={{ color: t.accentLight }}>
              Analisi in corso...
            </span>
          </div>
        )}

        {error && !urlModalOpen && (
          <div
            className="text-xs px-2 py-1.5 rounded"
            style={{ background: t.mode === "dark" ? "#2d1b1b" : "#fef2f2", color: t.dangerText }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Legend */}
      <div
        className="px-4 py-3"
        style={{ borderBottom: `1px solid ${t.panelBorder}` }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: t.textSecondary }}>
            Legend
          </span>
          {hiddenFlowTypes.size > 0 && onShowAllFlowTypes && (
            <button
              onClick={onShowAllFlowTypes}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
              style={{
                background: t.surface,
                border: `1px solid ${t.surfaceBorder}`,
                color: t.accentLight,
                cursor: "pointer",
                fontSize: 9,
              }}
              title="Mostra tutti i tipi (0)"
            >
              <Eye size={10} />
              Mostra tutti
            </button>
          )}
        </div>
        {(["happy", "secondary", "variant", "error", "skip"] as FlowType[]).map(
          (type, idx) => {
            const isHidden = hiddenFlowTypes.has(type);
            const count = connections.filter((c) => c.flowType === type).length;
            const shortcutKey = String(idx + 1);
            const ALL_TYPES: FlowType[] = ["happy", "secondary", "variant", "error", "skip"];
            const isSolo =
              !isHidden &&
              ALL_TYPES.filter((ft) => ft !== type).every((ft) => hiddenFlowTypes.has(ft));
            return (
              <div
                key={type}
                className="flex items-center gap-2 mb-1.5"
                style={{ opacity: isHidden ? 0.35 : 1, transition: "opacity 0.15s" }}
              >
                <svg width={24} height={8} style={{ flexShrink: 0 }}>
                  <line
                    x1={0}
                    y1={4}
                    x2={24}
                    y2={4}
                    stroke={FLOW_COLORS[type]}
                    strokeWidth={2}
                    strokeDasharray={
                      type === "skip"
                        ? "4,3"
                        : type === "error"
                        ? "6,3"
                        : undefined
                    }
                  />
                </svg>
                <span
                  className="text-xs flex-1"
                  style={{ color: isHidden ? t.textMuted : t.textPrimary }}
                >
                  {FLOW_LABELS[type]}
                  {count > 0 && (
                    <span style={{ color: t.textDim, marginLeft: 4 }}>
                      ({count})
                    </span>
                  )}
                </span>
                <span
                  className="rounded"
                  style={{
                    fontSize: 8,
                    lineHeight: "14px",
                    width: 14,
                    textAlign: "center" as const,
                    display: "inline-block",
                    background: isSolo ? t.accentBg : t.surface,
                    border: isSolo ? `1px solid ${t.accent}` : `1px solid ${t.surfaceBorder}`,
                    color: isSolo ? t.accentLight : t.textDim,
                    flexShrink: 0,
                  }}
                  title={`Premi ${shortcutKey} per toggle, Alt+${shortcutKey} per solo`}
                >
                  {shortcutKey}
                </span>
                {onToggleFlowType && (
                  <button
                    onClick={(e) => {
                      if (e.altKey && onSoloFlowType) {
                        onSoloFlowType(type);
                      } else {
                        onToggleFlowType(type);
                      }
                    }}
                    className="p-0.5 rounded transition-colors"
                    style={{
                      color: isHidden ? t.textDim : t.textSecondary,
                      cursor: "pointer",
                      background: "transparent",
                      border: "none",
                      display: "flex",
                      alignItems: "center",
                    }}
                    title={
                      isHidden
                        ? `Mostra ${FLOW_LABELS[type]} (${shortcutKey})\nAlt+click = solo`
                        : `Nascondi ${FLOW_LABELS[type]} (${shortcutKey})\nAlt+click = solo`
                    }
                  >
                    {isHidden ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                )}
              </div>
            );
          }
        )}
      </div>

      {/* Detail panel */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3"
        style={{ borderBottom: `1px solid ${t.panelBorder}` }}
      >
        <div className="text-xs mb-2" style={{ color: t.textSecondary }}>
          Details
        </div>
        {!selectedItem && (
          <div className="text-xs" style={{ color: t.textDim }}>
            Click a screen or arrow to inspect
          </div>
        )}

        {selectedScreen && (
          <div className="flex flex-col gap-2">
            <div className="p-2 rounded-md" style={{ background: t.surface }}>
              <div className="text-sm" style={{ color: t.text }}>
                {selectedScreen.name}
              </div>
              <div className="text-xs mt-1" style={{ color: t.textMuted }}>
                {selectedScreen.pageUrl ? (
                  <>Route: {selectedScreen.figmaFrameId}</>
                ) : (
                  <>ID: {selectedScreen.figmaFrameId}</>
                )}
              </div>
              {selectedScreen.pageUrl && (
                <a
                  href={selectedScreen.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-xs transition-colors"
                  style={{ color: t.accentLight }}
                >
                  <Globe size={10} />
                  Open live page
                </a>
              )}
            </div>
            {incomingConns.length > 0 && (
              <div>
                <div className="text-xs mb-1" style={{ color: t.textSecondary }}>
                  Incoming ({incomingConns.length})
                </div>
                {incomingConns.map((c) => {
                  const src = screens.find((s) => s.id === c.sourceId);
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-1.5 mb-1 text-xs"
                      style={{ color: t.textPrimary }}
                    >
                      <span
                        className="px-1.5 py-0.5 rounded text-xs"
                        style={{
                          background: FLOW_COLORS[c.flowType] + "22",
                          color: FLOW_COLORS[c.flowType],
                          fontSize: 9,
                        }}
                      >
                        {c.flowType}
                      </span>
                      <span>{src?.name || c.sourceId}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {outgoingConns.length > 0 && (
              <div>
                <div className="text-xs mb-1" style={{ color: t.textSecondary }}>
                  Outgoing ({outgoingConns.length})
                </div>
                {outgoingConns.map((c) => {
                  const dst = screens.find((s) => s.id === c.destinationId);
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-1.5 mb-1 text-xs"
                      style={{ color: t.textPrimary }}
                    >
                      <span
                        className="px-1.5 py-0.5 rounded text-xs"
                        style={{
                          background: FLOW_COLORS[c.flowType] + "22",
                          color: FLOW_COLORS[c.flowType],
                          fontSize: 9,
                        }}
                      >
                        {c.flowType}
                      </span>
                      <span>{dst?.name || c.destinationId}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {selectedConnection &&
          (() => {
            const src = screens.find(
              (s) => s.id === selectedConnection.sourceId
            );
            const dst = screens.find(
              (s) => s.id === selectedConnection.destinationId
            );
            return (
              <div className="flex flex-col gap-2">
                <div
                  className="p-2 rounded-md"
                  style={{ background: t.surface }}
                >
                  <div className="text-sm" style={{ color: t.text }}>
                    {src?.name} &rarr; {dst?.name}
                  </div>
                  <div
                    className="text-xs mt-1"
                    style={{ color: t.textMuted }}
                  >
                    Trigger: {selectedConnection.trigger}
                  </div>
                  {selectedConnection.condition && (
                    <div className="mt-1">
                      <span
                        className="px-2 py-0.5 rounded text-xs"
                        style={{
                          background: t.mode === "dark" ? "#1e2533" : "#f0f4ff",
                          color: t.textPrimary,
                        }}
                      >
                        {selectedConnection.condition === "yes" ? "SI'" : "NO"}
                      </span>
                    </div>
                  )}
                  <div className="mt-2">
                    <div className="text-xs mb-1.5" style={{ color: t.textSecondary }}>
                      Tipo di flusso
                    </div>
                    <div className="flex flex-col gap-1">
                      {(["happy", "secondary", "variant", "error", "skip"] as FlowType[]).map(
                        (type) => {
                          const isActive = selectedConnection.flowType === type;
                          return (
                            <button
                              key={type}
                              onClick={() =>
                                onUpdateConnection?.(selectedConnection.id, { flowType: type })
                              }
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-all text-left"
                              style={{
                                background: isActive
                                  ? FLOW_COLORS[type] + "18"
                                  : "transparent",
                                border: isActive
                                  ? `1px solid ${FLOW_COLORS[type]}44`
                                  : "1px solid transparent",
                                color: isActive ? FLOW_COLORS[type] : t.textMuted,
                                cursor: "pointer",
                              }}
                            >
                              <svg width={18} height={6} style={{ flexShrink: 0 }}>
                                <line
                                  x1={0}
                                  y1={3}
                                  x2={18}
                                  y2={3}
                                  stroke={isActive ? FLOW_COLORS[type] : t.textDim}
                                  strokeWidth={2}
                                  strokeDasharray={
                                    type === "skip"
                                      ? "4,3"
                                      : type === "error"
                                      ? "6,3"
                                      : undefined
                                  }
                                />
                              </svg>
                              <span>{FLOW_LABELS[type]}</span>
                              {isActive && (
                                <span
                                  className="ml-auto w-1.5 h-1.5 rounded-full"
                                  style={{ background: FLOW_COLORS[type] }}
                                />
                              )}
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>
                {selectedConnection.reason && (
                  <div
                    className="p-2 rounded-md flex flex-col gap-1"
                    style={{ background: t.reasonBg, border: `1px solid ${t.reasonBorder}` }}
                  >
                    <div className="flex items-center gap-1" style={{ color: t.reasonHeaderText, fontSize: 10 }}>
                      <Lightbulb size={10} />
                      Motivazione UX
                    </div>
                    <div className="text-xs" style={{ color: t.reasonText }}>
                      {selectedConnection.reason}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
      </div>

      {/* Stats */}
      <div className="px-4 py-3 flex gap-2">
        <div
          className="flex-1 p-2 rounded-md text-center"
          style={{ background: t.surface }}
        >
          <div className="text-lg" style={{ color: t.text }}>
            {screens.length}
          </div>
          <div className="text-xs" style={{ color: t.textMuted }}>
            {screens.filter(s => s.nodeKind === "decision").length > 0
              ? `Schermate (${screens.filter(s => s.nodeKind !== "decision").length} + ${screens.filter(s => s.nodeKind === "decision").length} \u25C6)`
              : "Screens"}
          </div>
        </div>
        <div
          className="flex-1 p-2 rounded-md text-center"
          style={{ background: t.surface }}
        >
          <div className="text-lg" style={{ color: t.text }}>
            {connections.length}
          </div>
          <div className="text-xs" style={{ color: t.textMuted }}>
            Connections
          </div>
        </div>
      </div>

      {/* ═══ Modals ═══ */}
      {tutorialOpen && (
        <TutorialModal
          onClose={() => setTutorialOpen(false)}
          onOpenFlowDoc={onOpenFlowDoc}
        />
      )}
      {urlModalOpen && (
        <UrlModal
          onClose={() => setUrlModalOpen(false)}
          onAnalyze={onAnalyze}
          onOpenScanner={onOpenScanner}
          loading={loading}
          error={error}
        />
      )}
    </div>
  );
}