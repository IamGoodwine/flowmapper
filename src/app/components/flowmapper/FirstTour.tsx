import React, { useState } from "react";
import { X, ChevronRight, ChevronLeft, Mic, BookOpen, Layout, Download, Hexagon } from "lucide-react";
import { useTheme } from "./ThemeContext";

// ── Constants ─────────────────────────────────────────────────────────────────

export const TOUR_LS_KEY = "flowmapper_tour_seen";

// ── Illustrations ─────────────────────────────────────────────────────────────

function IllustrationWelcome() {
  return (
    <svg viewBox="0 0 480 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      {/* Background gradient blobs */}
      <defs>
        <radialGradient id="tw-g1" cx="30%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="tw-g2" cx="75%" cy="50%" r="45%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <marker id="tw-arr" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
          <polygon points="0 0, 7 3.5, 0 7" fill="#6366f1" opacity="0.7" />
        </marker>
      </defs>
      <rect width="480" height="200" fill="url(#tw-g1)" />
      <rect width="480" height="200" fill="url(#tw-g2)" />

      {/* Node 1 — Home */}
      <rect x="48" y="72" width="82" height="56" rx="8" fill="#6366f115" stroke="#6366f1" strokeWidth="1.5" />
      <rect x="57" y="81" width="64" height="8" rx="3" fill="#6366f133" />
      <rect x="57" y="94" width="64" height="24" rx="3" fill="#6366f10a" />
      <text x="89" y="143" textAnchor="middle" fill="#a5b4fc" fontSize="10" fontFamily="system-ui">Home</text>

      {/* Arrow 1→2 */}
      <line x1="130" y1="100" x2="172" y2="100" stroke="#6366f1" strokeWidth="1.5" strokeOpacity="0.7" markerEnd="url(#tw-arr)" />
      <rect x="135" y="90" width="32" height="16" rx="5" fill="#1e1b4b" opacity="0.7" />
      <text x="151" y="102" textAnchor="middle" fill="#a5b4fc" fontSize="9" fontFamily="system-ui">Accedi</text>

      {/* Node 2 — Login */}
      <rect x="174" y="72" width="82" height="56" rx="8" fill="#6366f115" stroke="#6366f1" strokeWidth="1.5" />
      <rect x="183" y="81" width="64" height="8" rx="3" fill="#6366f133" />
      <rect x="183" y="94" width="64" height="24" rx="3" fill="#6366f10a" />
      <text x="215" y="143" textAnchor="middle" fill="#a5b4fc" fontSize="10" fontFamily="system-ui">Login</text>

      {/* Arrow 2→3 happy */}
      <line x1="256" y1="100" x2="296" y2="100" stroke="#22c55e" strokeWidth="1.5" strokeOpacity="0.8" markerEnd="url(#tw-arr-ok)" />
      <marker id="tw-arr-ok" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
        <polygon points="0 0, 7 3.5, 0 7" fill="#22c55e" opacity="0.8" />
      </marker>
      <rect x="260" y="90" width="32" height="16" rx="5" fill="#052e16" opacity="0.7" />
      <text x="276" y="102" textAnchor="middle" fill="#86efac" fontSize="9" fontFamily="system-ui">Entra</text>

      {/* Node 3 — Dashboard */}
      <rect x="298" y="72" width="88" height="56" rx="8" fill="#22c55e10" stroke="#22c55e" strokeWidth="1.5" />
      <rect x="307" y="81" width="70" height="8" rx="3" fill="#22c55e22" />
      <rect x="307" y="94" width="70" height="24" rx="3" fill="#22c55e08" />
      <text x="342" y="143" textAnchor="middle" fill="#86efac" fontSize="10" fontFamily="system-ui">Dashboard</text>

      {/* Arrow 2→error, below */}
      <path d="M215 128 Q215 160 340 160" stroke="#ef4444" strokeWidth="1.5" strokeOpacity="0.5" fill="none" strokeDasharray="5,3" />
      <circle cx="340" cy="160" r="4" fill="#ef4444" opacity="0.5" />
      <text x="270" y="175" textAnchor="middle" fill="#fca5a5" fontSize="9" fontFamily="system-ui" opacity="0.7">Credenziali errate</text>

      {/* Dot grid hint */}
      {Array.from({ length: 6 }).map((_, row) =>
        Array.from({ length: 14 }).map((_, col) => (
          <circle key={`${row}-${col}`} cx={30 + col * 32} cy={20 + row * 32} r="0.8" fill="#6366f1" opacity="0.12" />
        ))
      )}
    </svg>
  );
}

function IllustrationVoice() {
  return (
    <svg viewBox="0 0 480 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="tv-g1" cx="35%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="tv-g2" cx="80%" cy="50%" r="45%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
        <marker id="tv-arr" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
          <polygon points="0 0, 7 3.5, 0 7" fill="#22c55e" opacity="0.8" />
        </marker>
      </defs>
      <rect width="480" height="200" fill="url(#tv-g1)" />
      <rect width="480" height="200" fill="url(#tv-g2)" />

      {/* Microphone */}
      <rect x="72" y="54" width="28" height="46" rx="14" fill="#22c55e22" stroke="#22c55e" strokeWidth="2" />
      <rect x="78" y="60" width="16" height="28" rx="8" fill="#22c55e44" />
      {/* Mic stand */}
      <path d="M58 100 Q58 122 86 122 Q114 122 114 100" stroke="#22c55e" strokeWidth="2" fill="none" strokeOpacity="0.7" />
      <line x1="86" y1="122" x2="86" y2="136" stroke="#22c55e" strokeWidth="2" strokeOpacity="0.6" />
      <line x1="72" y1="136" x2="100" y2="136" stroke="#22c55e" strokeWidth="2" strokeOpacity="0.6" />

      {/* Sound waves */}
      {[18, 30, 42].map((r, i) => (
        <circle key={i} cx="86" cy="86" r={r} fill="none" stroke="#22c55e" strokeWidth="1.2"
          strokeOpacity={0.4 - i * 0.1} strokeDasharray="3,3" />
      ))}

      {/* Waveform bars */}
      {[14, 22, 30, 36, 28, 20, 32, 40, 26, 16, 24, 34].map((h, i) => (
        <rect
          key={i}
          x={154 + i * 10}
          y={100 - h / 2}
          width={6}
          height={h}
          rx={3}
          fill="#22c55e"
          opacity={0.5 + (i % 3) * 0.15}
        />
      ))}

      {/* Arrow waveform → nodes */}
      <line x1="290" y1="100" x2="316" y2="100" stroke="#6366f1" strokeWidth="2" strokeOpacity="0.8" markerEnd="url(#tv-arr2)" />
      <marker id="tv-arr2" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
        <polygon points="0 0, 7 3.5, 0 7" fill="#6366f1" opacity="0.8" />
      </marker>
      {/* Sparkle on arrow */}
      <text x="303" y="90" textAnchor="middle" fill="#a5b4fc" fontSize="13">✦</text>

      {/* Mini generated diagram */}
      <rect x="320" y="54" width="54" height="34" rx="6" fill="#6366f115" stroke="#6366f1" strokeWidth="1.3" />
      <text x="347" y="75" textAnchor="middle" fill="#a5b4fc" fontSize="9" fontFamily="system-ui">Home</text>
      <line x1="374" y1="71" x2="390" y2="71" stroke="#6366f1" strokeWidth="1.2" markerEnd="url(#tv-arr)" />
      <rect x="392" y="54" width="54" height="34" rx="6" fill="#6366f115" stroke="#6366f1" strokeWidth="1.3" />
      <text x="419" y="75" textAnchor="middle" fill="#a5b4fc" fontSize="9" fontFamily="system-ui">Login</text>
      <line x1="419" y1="88" x2="419" y2="102" stroke="#6366f1" strokeWidth="1.2" markerEnd="url(#tv-arr)" />
      <rect x="392" y="104" width="54" height="34" rx="6" fill="#22c55e10" stroke="#22c55e" strokeWidth="1.3" />
      <text x="419" y="124" textAnchor="middle" fill="#86efac" fontSize="9" fontFamily="system-ui">Dashboard</text>

      {/* "AI" badge */}
      <rect x="293" y="108" width="28" height="16" rx="5" fill="#6366f1" opacity="0.9" />
      <text x="307" y="120" textAnchor="middle" fill="#fff" fontSize="9" fontFamily="system-ui" fontWeight="bold">AI</text>
    </svg>
  );
}

function IllustrationStudyDocs() {
  return (
    <svg viewBox="0 0 480 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="tsd-g1" cx="30%" cy="55%" r="55%">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
        </radialGradient>
        <marker id="tsd-arr" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
          <polygon points="0 0, 7 3.5, 0 7" fill="#c084fc" opacity="0.8" />
        </marker>
      </defs>
      <rect width="480" height="200" fill="url(#tsd-g1)" />

      {/* Document */}
      <rect x="36" y="36" width="110" height="128" rx="8" fill="#1e1b4b" stroke="#c084fc" strokeWidth="1.5" strokeOpacity="0.6" />
      {/* Doc lines */}
      {[60, 76, 92, 108, 124, 140].map((y, i) => (
        <rect key={i} x="52" y={y} width={i % 3 === 2 ? 50 : 78} height="7" rx="3" fill="#c084fc" opacity={0.12 + (i % 2) * 0.08} />
      ))}
      {/* Dog-ear */}
      <path d="M128 36 L146 54 L128 54 Z" fill="#c084fc" opacity="0.2" />
      <path d="M128 36 L146 54" stroke="#c084fc" strokeWidth="1" opacity="0.4" />

      {/* "flow-doc" label */}
      <rect x="44" y="42" width="52" height="12" rx="3" fill="#c084fc22" />
      <text x="70" y="52" textAnchor="middle" fill="#c084fc" fontSize="8" fontFamily="system-ui" fontWeight="bold">FlowDoc</text>

      {/* Extraction arrows fanning out */}
      <line x1="148" y1="70" x2="196" y2="56" stroke="#c084fc" strokeWidth="1.5" strokeOpacity="0.6" markerEnd="url(#tsd-arr)" />
      <line x1="148" y1="100" x2="196" y2="100" stroke="#c084fc" strokeWidth="1.5" strokeOpacity="0.6" markerEnd="url(#tsd-arr)" />
      <line x1="148" y1="130" x2="196" y2="144" stroke="#c084fc" strokeWidth="1.5" strokeOpacity="0.6" markerEnd="url(#tsd-arr)" />

      {/* Generated nodes */}
      {[
        { x: 198, y: 42, label: "Step 1" },
        { x: 198, y: 88, label: "Step 2" },
        { x: 198, y: 132, label: "Step 3" },
      ].map(({ x, y, label }) => (
        <g key={label}>
          <rect x={x} y={y} width="70" height="28" rx="6" fill="#c084fc10" stroke="#c084fc" strokeWidth="1.3" />
          <text x={x + 35} y={y + 18} textAnchor="middle" fill="#d8b4fe" fontSize="10" fontFamily="system-ui">{label}</text>
        </g>
      ))}

      {/* Vertical connector */}
      <line x1="233" y1="70" x2="233" y2="88" stroke="#c084fc" strokeWidth="1.2" strokeOpacity="0.5" markerEnd="url(#tsd-arr)" />
      <line x1="233" y1="116" x2="233" y2="132" stroke="#c084fc" strokeWidth="1.2" strokeOpacity="0.5" markerEnd="url(#tsd-arr)" />

      {/* More nodes hinting at full diagram */}
      {[
        { x: 296, y: 56, w: 60, h: 26, op: 0.8 },
        { x: 296, y: 96, w: 60, h: 26, op: 0.6 },
        { x: 296, y: 136, w: 60, h: 26, op: 0.4 },
        { x: 374, y: 76, w: 60, h: 26, op: 0.5 },
        { x: 374, y: 116, w: 60, h: 26, op: 0.3 },
      ].map(({ x, y, w, h, op }, i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx="5" fill="none" stroke="#c084fc" strokeWidth="1" strokeOpacity={op} strokeDasharray="4,3" />
      ))}
      {[
        [268, 69, 296, 69],
        [268, 109, 296, 109],
        [268, 149, 296, 149],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c084fc" strokeWidth="1" strokeOpacity="0.4" markerEnd="url(#tsd-arr)" />
      ))}
    </svg>
  );
}

function IllustrationTemplates() {
  const cards = [
    { x: 40, y: 38, label: "Login", color: "#60a5fa" },
    { x: 150, y: 38, label: "Onboarding", color: "#f59e0b" },
    { x: 260, y: 38, label: "Checkout", color: "#22c55e" },
    { x: 370, y: 38, label: "Dashboard", color: "#c084fc" },
    { x: 40, y: 122, label: "Profilo", color: "#c084fc" },
    { x: 150, y: 122, label: "Ricerca", color: "#22c55e" },
    { x: 260, y: 122, label: "Impostazioni", color: "#60a5fa" },
    { x: 370, y: 122, label: "Errore 404", color: "#ef4444" },
  ];
  return (
    <svg viewBox="0 0 480 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="tt-g" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="480" height="200" fill="url(#tt-g)" />

      {cards.map(({ x, y, label, color }) => (
        <g key={label}>
          <rect x={x} y={y} width="88" height="68" rx="8"
            fill={`${color}0d`} stroke={color} strokeWidth="1.3" />
          {/* Mini diagram inside card */}
          <rect x={x + 8} y={y + 10} width="30" height="16" rx="3" fill={`${color}22`} stroke={color} strokeWidth="0.8" />
          <line x1={x + 38} y1={y + 18} x2={x + 50} y2={y + 18} stroke={color} strokeWidth="1" strokeOpacity="0.6" />
          <rect x={x + 50} y={y + 10} width="30" height="16" rx="3" fill={`${color}22`} stroke={color} strokeWidth="0.8" />
          {/* Label */}
          <text x={x + 44} y={y + 58} textAnchor="middle" fill={color} fontSize="9" fontFamily="system-ui"
            fontWeight="500" opacity="0.9">{label}</text>
        </g>
      ))}
    </svg>
  );
}

function IllustrationExport() {
  return (
    <svg viewBox="0 0 480 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="te-g" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
        </radialGradient>
        <marker id="te-arr" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
          <polygon points="0 0, 7 3.5, 0 7" fill="#34d399" opacity="0.7" />
        </marker>
      </defs>
      <rect width="480" height="200" fill="url(#te-g)" />

      {/* Central diagram */}
      <rect x="168" y="60" width="68" height="40" rx="7" fill="#34d39910" stroke="#34d399" strokeWidth="1.5" />
      <rect x="168" y="118" width="68" height="40" rx="7" fill="#34d39910" stroke="#34d399" strokeWidth="1.5" />
      <line x1="202" y1="100" x2="202" y2="118" stroke="#34d399" strokeWidth="1.3" strokeOpacity="0.6" markerEnd="url(#te-arr)" />
      <text x="202" y="84" textAnchor="middle" fill="#6ee7b7" fontSize="10" fontFamily="system-ui">Flusso</text>
      <text x="202" y="142" textAnchor="middle" fill="#6ee7b7" fontSize="10" fontFamily="system-ui">Output</text>

      {/* Export arrows */}
      <line x1="238" y1="84" x2="296" y2="60" stroke="#34d399" strokeWidth="1.3" strokeOpacity="0.7" markerEnd="url(#te-arr)" />
      <line x1="238" y1="100" x2="296" y2="100" stroke="#34d399" strokeWidth="1.3" strokeOpacity="0.7" markerEnd="url(#te-arr)" />
      <line x1="238" y1="116" x2="296" y2="140" stroke="#34d399" strokeWidth="1.3" strokeOpacity="0.7" markerEnd="url(#te-arr)" />

      {/* PDF */}
      <rect x="298" y="44" width="58" height="32" rx="6" fill="#ef444410" stroke="#ef4444" strokeWidth="1.3" />
      <text x="327" y="65" textAnchor="middle" fill="#fca5a5" fontSize="11" fontFamily="system-ui" fontWeight="700">PDF</text>

      {/* SVG */}
      <rect x="298" y="86" width="58" height="28" rx="6" fill="#60a5fa10" stroke="#60a5fa" strokeWidth="1.3" />
      <text x="327" y="105" textAnchor="middle" fill="#93c5fd" fontSize="11" fontFamily="system-ui" fontWeight="700">SVG</text>

      {/* ZIP */}
      <rect x="298" y="124" width="58" height="28" rx="6" fill="#f59e0b10" stroke="#f59e0b" strokeWidth="1.3" />
      <text x="327" y="143" textAnchor="middle" fill="#fcd34d" fontSize="11" fontFamily="system-ui" fontWeight="700">ZIP</text>

      {/* JSON on left */}
      <line x1="166" y1="100" x2="110" y2="100" stroke="#34d399" strokeWidth="1.3" strokeOpacity="0.7" markerEnd="url(#te-arr2)" />
      <marker id="te-arr2" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
        <polygon points="0 0, 7 3.5, 0 7" fill="#34d399" opacity="0.7" />
      </marker>
      <rect x="44" y="82" width="64" height="36" rx="6" fill="#34d39910" stroke="#34d399" strokeWidth="1.3" />
      <text x="76" y="100" textAnchor="middle" fill="#6ee7b7" fontSize="9" fontFamily="system-ui" fontWeight="700">JSON</text>
      <text x="76" y="112" textAnchor="middle" fill="#6ee7b7" fontSize="8" fontFamily="system-ui" opacity="0.7">Import/Export</text>

      {/* Download icon (arrow down into tray) */}
      <text x="395" y="168" textAnchor="middle" fill="#34d399" fontSize="22" opacity="0.25">↓</text>
    </svg>
  );
}

// ── Slide definitions ─────────────────────────────────────────────────────────

interface Slide {
  id: string;
  badge?: { text: string; color: string };
  icon: React.ReactNode;
  title: string;
  description: string;
  illustration: React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    id: "welcome",
    icon: <Hexagon size={18} />,
    title: "Benvenuto in FlowMapper",
    description:
      "Progetta e visualizza flussi utente in modo intuitivo. Connetti schermate, aggiungi razionali UX, usa l'AI per generare diagrammi dalla voce o dalla documentazione.",
    illustration: <IllustrationWelcome />,
  },
  {
    id: "voice",
    badge: { text: "✨ NOVITÀ", color: "#22c55e" },
    icon: <Mic size={18} />,
    title: "Voice to Flow",
    description:
      "Descrivi il tuo flusso a voce e l'AI di Gemini genera automaticamente il diagramma. Gratuito, con fallback al parser locale se non hai una API key. Trovi la funzione nel menu \"Nuovo\".",
    illustration: <IllustrationVoice />,
  },
  {
    id: "studydocs",
    icon: <BookOpen size={18} />,
    title: "Study Docs — FlowDoc",
    description:
      "Hai già una documentazione del flusso? Incollala nel formato FlowDoc e FlowMapper estrae automaticamente schermate e connessioni. Perfetto per allinearsi con il team.",
    illustration: <IllustrationStudyDocs />,
  },
  {
    id: "templates",
    icon: <Layout size={18} />,
    title: "Template predefiniti",
    description:
      "Parti veloce con modelli pronti: login, onboarding, checkout, dashboard e molto altro. Seleziona un template come punto di partenza e personalizzalo a tuo piacimento.",
    illustration: <IllustrationTemplates />,
  },
  {
    id: "export",
    icon: <Download size={18} />,
    title: "Esporta e condividi",
    description:
      "Salva il tuo lavoro come PDF, SVG o archivio ZIP con codice sorgente pronto per GitHub. Usa JSON Import/Export per salvare e ricaricare qualsiasi diagramma in qualsiasi momento.",
    illustration: <IllustrationExport />,
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface FirstTourProps {
  onClose: () => void;
}

export function FirstTour({ onClose }: FirstTourProps) {
  const { theme: t } = useTheme();
  const [current, setCurrent] = useState(0);
  const [dontShow, setDontShow] = useState(false);

  const slide = SLIDES[current];
  const isLast = current === SLIDES.length - 1;
  const isFirst = current === 0;

  const handleClose = () => {
    if (dontShow) {
      localStorage.setItem(TOUR_LS_KEY, "1");
    }
    onClose();
  };

  const handleSkip = () => {
    if (dontShow) {
      localStorage.setItem(TOUR_LS_KEY, "1");
    }
    onClose();
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backdropFilter: "blur(2px)",
  };

  const modal: React.CSSProperties = {
    background: t.panelBg,
    border: `1px solid ${t.panelBorder}`,
    borderRadius: 18,
    width: 560,
    maxWidth: "96vw",
    maxHeight: "92vh",
    overflow: "hidden",
    boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "system-ui, sans-serif",
  };

  const illBg: React.CSSProperties = {
    height: 192,
    background: t.canvasBg,
    borderBottom: `1px solid ${t.panelBorder}`,
    position: "relative",
    overflow: "hidden",
    flexShrink: 0,
  };

  const body: React.CSSProperties = {
    padding: "22px 28px 0",
    flex: 1,
    overflowY: "auto",
  };

  const footer: React.CSSProperties = {
    padding: "16px 28px 22px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    borderTop: `1px solid ${t.panelBorder}`,
    marginTop: 20,
    flexShrink: 0,
  };

  const btnPrimary: React.CSSProperties = {
    background: t.accent,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "9px 20px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
  };

  const btnSecondary: React.CSSProperties = {
    background: "transparent",
    color: t.textMuted,
    border: `1px solid ${t.surfaceBorder}`,
    borderRadius: 8,
    padding: "8px 16px",
    fontWeight: 500,
    fontSize: 13,
    cursor: "pointer",
  };

  return (
    <div style={overlay} onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div style={modal}>
        {/* Illustration area */}
        <div style={illBg}>
          {slide.illustration}

          {/* Close button */}
          <button
            onClick={handleClose}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "rgba(0,0,0,0.35)",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: 5,
            }}
            title="Chiudi"
          >
            <X size={15} />
          </button>

          {/* Badge */}
          {slide.badge && (
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                background: slide.badge.color,
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: 20,
                letterSpacing: "0.04em",
              }}
            >
              {slide.badge.text}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={body}>
          {/* Slide icon + title */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ color: t.accent }}>{slide.icon}</span>
            <h2 style={{ margin: 0, color: t.textPrimary, fontSize: 18, fontWeight: 700 }}>
              {slide.title}
            </h2>
          </div>

          {/* Description */}
          <p style={{ margin: 0, color: t.textSecondary, fontSize: 13, lineHeight: 1.65 }}>
            {slide.description}
          </p>
        </div>

        {/* Footer */}
        <div style={footer}>
          {/* Dot navigation */}
          <div style={{ display: "flex", gap: 6, flex: 1 }}>
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setCurrent(i)}
                style={{
                  width: i === current ? 20 : 7,
                  height: 7,
                  borderRadius: 4,
                  border: "none",
                  cursor: "pointer",
                  background: i === current ? t.accent : t.surfaceBorder,
                  padding: 0,
                  transition: "width 0.2s ease, background 0.2s ease",
                }}
                title={SLIDES[i].title}
              />
            ))}
          </div>

          {/* Don't show again */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: t.textMuted,
              fontSize: 11,
              cursor: "pointer",
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
              style={{ accentColor: t.accent, width: 13, height: 13 }}
            />
            Non mostrare più
          </label>

          {/* Skip (only on non-last slides) */}
          {!isLast && (
            <button style={btnSecondary} onClick={handleSkip}>
              Salta
            </button>
          )}

          {/* Prev */}
          {!isFirst && (
            <button
              style={{ ...btnSecondary, display: "flex", alignItems: "center", gap: 4 }}
              onClick={() => setCurrent((c) => c - 1)}
            >
              <ChevronLeft size={14} />
              Indietro
            </button>
          )}

          {/* Next / Close */}
          <button
            style={btnPrimary}
            onClick={isLast ? handleClose : () => setCurrent((c) => c + 1)}
          >
            {isLast ? (
              "Inizia a usare FlowMapper"
            ) : (
              <>
                Avanti
                <ChevronRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fm-tour-fadein {
          from { opacity: 0; transform: scale(0.96) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
