import React, { useState, useCallback, useRef } from "react";
import {
  X,
  Plus,
  Globe,
  Layout,
  Trash2,
  ArrowRight,
  ChevronDown,
  Copy,
  ClipboardPaste,
  ExternalLink,
  Lightbulb,
  Link,
} from "lucide-react";
import type { ManualFlow, FlowType, ScannerResult } from "./types";
import { FLOW_COLORS, FLOW_LABELS } from "./types";

/* ═══ Clipboard helper ════════════════════════════════ */

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => execCommandCopy(text));
  }
  return execCommandCopy(text);
}

function execCommandCopy(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy") ? resolve() : reject(new Error("execCommand copy failed"));
    } catch (e) {
      reject(e);
    } finally {
      document.body.removeChild(ta);
    }
  });
}

/* ═══ Props & types ═════════════════════════════════════ */

interface MakePageScannerProps {
  baseUrl: string;
  onConfirm: (result: ScannerResult) => void;
  onClose: () => void;
}

const FLOW_TYPE_OPTIONS: { value: FlowType; label: string; color: string }[] = [
  { value: "happy", label: "Happy Path", color: FLOW_COLORS.happy },
  { value: "secondary", label: "Secondary", color: FLOW_COLORS.secondary },
  { value: "variant", label: "Variant", color: FLOW_COLORS.variant },
  { value: "error", label: "Error", color: FLOW_COLORS.error },
  { value: "skip", label: "Skip", color: FLOW_COLORS.skip },
];

/** Common route suggestions for Figma Make sites */
const COMMON_ROUTES = [
  "/", "/login", "/signup", "/dashboard", "/profile",
  "/settings", "/onboarding", "/pricing", "/404",
  "/checkout", "/success", "/error",
];

/* ═══ Helpers ═══════════════════════════════════════════ */

function routeToName(route: string): string {
  if (route === "/") return "Home";
  return route
    .split("/")
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " "))
    .join(" > ");
}

function normalizeRoute(input: string): string {
  let route = input.trim();
  if (route.startsWith("http")) {
    try {
      const u = new URL(route);
      route = u.pathname;
    } catch {}
  }
  if (!route.startsWith("/")) route = "/" + route;
  if (route.length > 1 && route.endsWith("/")) route = route.slice(0, -1);
  return route;
}

let nextId = 1;
const uid = () => `flow-${nextId++}`;

interface FlowStep {
  id: string;
  route: string;
}

interface FlowLane {
  id: string;
  name: string;
  flowType: FlowType;
  steps: FlowStep[];
}

/* ═══ Component ════════════════════════════════════════ */

export function MakePageScanner({
  baseUrl,
  onConfirm,
  onClose,
}: MakePageScannerProps) {
  // ─── Editable base URL ─────────────────────────
  const [editableUrl, setEditableUrl] = useState(baseUrl);
  const base = editableUrl.replace(/\/+$/, "");
  const hasValidUrl = base.length > 0;

  // ─── Flow lanes ────────────────────────────────
  const [lanes, setLanes] = useState<FlowLane[]>([
    {
      id: uid(),
      name: "Main Flow",
      flowType: "happy",
      steps: [{ id: uid(), route: "/" }],
    },
  ]);

  // ─── Quick-add route input ────────────────────
  const [quickRoute, setQuickRoute] = useState("");
  const [activeLaneForAdd, setActiveLaneForAdd] = useState<string | null>(null);
  const quickInputRef = useRef<HTMLInputElement>(null);

  // ─── Paste multi-URL panel ────────────────────
  const [showPastePanel, setShowPastePanel] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // ─── Quick-pick suggestions ───────────────────
  const [showSuggestions, setShowSuggestions] = useState(false);

  // ─── Flow type picker ─────────────────────────
  const [typePickerLane, setTypePickerLane] = useState<string | null>(null);

  // ─── Lane name editing ────────────────────────
  const [editingLaneName, setEditingLaneName] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  // ─── URL copied feedback ──────────────────────
  const [urlCopied, setUrlCopied] = useState(false);

  // ═══ Lane operations ═════════════════════════

  const addLane = useCallback(() => {
    const laneCount = lanes.length;
    const defaultType: FlowType = laneCount === 0 ? "happy" : laneCount === 1 ? "secondary" : "variant";
    setLanes((prev) => [
      ...prev,
      {
        id: uid(),
        name: `Flow ${laneCount + 1}`,
        flowType: defaultType,
        steps: [{ id: uid(), route: "/" }],
      },
    ]);
  }, [lanes.length]);

  const removeLane = useCallback((laneId: string) => {
    setLanes((prev) => prev.filter((l) => l.id !== laneId));
  }, []);

  const setLaneType = useCallback((laneId: string, flowType: FlowType) => {
    setLanes((prev) =>
      prev.map((l) => (l.id === laneId ? { ...l, flowType } : l))
    );
    setTypePickerLane(null);
  }, []);

  const setLaneName = useCallback((laneId: string, name: string) => {
    setLanes((prev) =>
      prev.map((l) => (l.id === laneId ? { ...l, name } : l))
    );
  }, []);

  // ═══ Step operations ═════════════════════════

  const addStepToLane = useCallback((laneId: string, route: string) => {
    const normalized = normalizeRoute(route);
    if (!normalized) return;
    setLanes((prev) =>
      prev.map((l) =>
        l.id === laneId
          ? { ...l, steps: [...l.steps, { id: uid(), route: normalized }] }
          : l
      )
    );
  }, []);

  const removeStep = useCallback((laneId: string, stepId: string) => {
    setLanes((prev) =>
      prev.map((l) =>
        l.id === laneId
          ? { ...l, steps: l.steps.filter((s) => s.id !== stepId) }
          : l
      )
    );
  }, []);

  const updateStepRoute = useCallback((laneId: string, stepId: string, route: string) => {
    setLanes((prev) =>
      prev.map((l) =>
        l.id === laneId
          ? {
              ...l,
              steps: l.steps.map((s) =>
                s.id === stepId ? { ...s, route: normalizeRoute(route) } : s
              ),
            }
          : l
      )
    );
  }, []);

  const moveStep = useCallback((laneId: string, stepId: string, direction: -1 | 1) => {
    setLanes((prev) =>
      prev.map((l) => {
        if (l.id !== laneId) return l;
        const idx = l.steps.findIndex((s) => s.id === stepId);
        if (idx < 0) return l;
        const newIdx = idx + direction;
        if (newIdx < 0 || newIdx >= l.steps.length) return l;
        const newSteps = [...l.steps];
        [newSteps[idx], newSteps[newIdx]] = [newSteps[newIdx], newSteps[idx]];
        return { ...l, steps: newSteps };
      })
    );
  }, []);

  // ═══ Quick add handler ═════════════════════════

  const handleQuickAdd = useCallback(() => {
    if (!quickRoute.trim() || !activeLaneForAdd) return;
    addStepToLane(activeLaneForAdd, quickRoute);
    setQuickRoute("");
    setActiveLaneForAdd(null);
  }, [quickRoute, activeLaneForAdd, addStepToLane]);

  // ═══ Paste handler ═════════════════════════════

  const handlePasteImport = useCallback(() => {
    const lines = pasteText
      .split(/[\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map(normalizeRoute)
      .filter(Boolean);
    if (lines.length === 0) return;

    const steps: FlowStep[] = lines.map((route) => ({ id: uid(), route }));
    setLanes((prev) => [
      ...prev,
      {
        id: uid(),
        name: `Imported Flow`,
        flowType: prev.length === 0 ? "happy" : "secondary",
        steps,
      },
    ]);
    setPasteText("");
    setShowPastePanel(false);
  }, [pasteText]);

  // ═══ Duplicate lane ════════════════════════════

  const duplicateLane = useCallback((laneId: string) => {
    setLanes((prev) => {
      const lane = prev.find((l) => l.id === laneId);
      if (!lane) return prev;
      return [
        ...prev,
        {
          id: uid(),
          name: `${lane.name} (copy)`,
          flowType: "variant",
          steps: lane.steps.map((s) => ({ id: uid(), route: s.route })),
        },
      ];
    });
  }, []);

  // ═══ Confirm ═══════════════════════════════════

  const validLanes = lanes.filter((l) => l.steps.length >= 2);
  const allRoutes = Array.from(
    new Set(lanes.flatMap((l) => l.steps.map((s) => s.route)))
  );
  const canConfirm = validLanes.length > 0 && hasValidUrl;

  const handleConfirm = useCallback(() => {
    const flows: ManualFlow[] = validLanes.map((lane) => ({
      name: lane.name,
      routes: lane.steps.map((s) => s.route),
      flowType: lane.flowType,
    }));
    const routes = Array.from(
      new Set(flows.flatMap((f) => f.routes))
    );
    onConfirm({ routes, flows, baseUrl: editableUrl.trim() });
  }, [validLanes, onConfirm, editableUrl]);

  // All routes currently in any lane
  const usedRoutes = new Set(lanes.flatMap((l) => l.steps.map((s) => s.route)));

  // ═══ Render ════════════════════════════════════

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="flex flex-col rounded-xl overflow-hidden"
        style={{
          background: "#13131f",
          border: "1px solid #2d2d44",
          boxShadow: "0 25px 80px rgba(0,0,0,0.8)",
          width: "min(740px, 95vw)",
          height: "min(720px, 92vh)",
        }}
      >
        {/* ═══ Header ═══ */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid #1f2937" }}
        >
          <div className="flex items-center gap-2.5">
            <Layout size={18} style={{ color: "#818cf8" }} />
            <span style={{ color: "white", fontSize: 15 }}>
              Flow Builder
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-xs"
              style={{
                background: "#a855f720",
                color: "#a855f7",
                border: "1px solid #a855f730",
              }}
            >
              Figma Make
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ═══ URL input bar ═══ */}
        <div
          className="flex items-center gap-2.5 px-5 py-2.5 flex-shrink-0"
          style={{ borderBottom: "1px solid #1f2937", background: "#0f0f1a" }}
        >
          <Link size={13} style={{ color: hasValidUrl ? "#818cf8" : "#4b5563", flexShrink: 0 }} />
          <input
            type="text"
            value={editableUrl}
            onChange={(e) => setEditableUrl(e.target.value)}
            placeholder="https://my-site.figma.site"
            className="flex-1 px-2.5 py-1.5 rounded-md text-xs outline-none"
            style={{
              background: "#1e1e2e",
              border: hasValidUrl ? "1px solid #4f46e540" : "1px solid #f59e0b50",
              color: "white",
              fontFamily: "monospace",
            }}
          />
          {hasValidUrl && (
            <>
              <button
                onClick={() => {
                  copyToClipboard(base).then(() => {
                    setUrlCopied(true);
                    setTimeout(() => setUrlCopied(false), 2000);
                  });
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors flex-shrink-0"
                style={{
                  background: urlCopied ? "#22c55e15" : "#1e1e2e",
                  border: urlCopied ? "1px solid #22c55e40" : "1px solid #2d2d44",
                  color: urlCopied ? "#22c55e" : "#9ca3af",
                  cursor: "pointer",
                }}
                title="Copia URL del sito"
              >
                {urlCopied ? "Copiato!" : <><Globe size={10} /> Copia URL</>}
              </button>
              <a
                href={base}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors flex-shrink-0"
                style={{
                  background: "#1e1e2e",
                  border: "1px solid #2d2d44",
                  color: "#818cf8",
                  textDecoration: "none",
                }}
              >
                <ExternalLink size={10} />
                Apri sito
              </a>
            </>
          )}
          {!hasValidUrl && (
            <span className="text-xs flex-shrink-0" style={{ color: "#f59e0b" }}>
              Inserisci l'URL del tuo sito
            </span>
          )}
        </div>

        {/* ═══ How-to bar + actions ═══ */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid #1f2937", background: "#0d0d18" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Lightbulb size={13} style={{ color: "#f59e0b", flexShrink: 0 }} />
            <span className="text-xs" style={{ color: "#9ca3af" }}>
              Apri il tuo sito in un altro tab, naviga tra le pagine e copia i percorsi (es. <code style={{ color: "#818cf8" }}>/login</code>, <code style={{ color: "#818cf8" }}>/dashboard</code>) per aggiungerli qui sotto.
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => { setShowPastePanel(!showPastePanel); setShowSuggestions(false); }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors"
              style={{
                background: showPastePanel ? "#4f46e520" : "#1e1e2e",
                border: showPastePanel ? "1px solid #4f46e580" : "1px solid #2d2d44",
                color: showPastePanel ? "#818cf8" : "#9ca3af",
                cursor: "pointer",
              }}
            >
              <ClipboardPaste size={10} />
              Incolla URL
            </button>
            <button
              onClick={() => { setShowSuggestions(!showSuggestions); setShowPastePanel(false); }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors"
              style={{
                background: showSuggestions ? "#f59e0b18" : "#1e1e2e",
                border: showSuggestions ? "1px solid #f59e0b50" : "1px solid #2d2d44",
                color: showSuggestions ? "#f59e0b" : "#9ca3af",
                cursor: "pointer",
              }}
            >
              <Lightbulb size={10} />
              Suggerimenti
            </button>
          </div>
        </div>

        {/* ═══ Paste panel ═══ */}
        {showPastePanel && (
          <div
            className="px-5 py-3 flex flex-col gap-2 flex-shrink-0"
            style={{ borderBottom: "1px solid #1f2937", background: "#0a0a14" }}
          >
            <div className="text-xs" style={{ color: "#9ca3af" }}>
              Incolla URL completi o percorsi (uno per riga, oppure separati da virgole). Verra creato un nuovo flusso con tutte le pagine in ordine.
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`${base}/login\n${base}/dashboard\n/settings\n/profile`}
              className="w-full px-3 py-2 rounded-md text-xs outline-none resize-none"
              style={{
                background: "#1e1e2e",
                border: "1px solid #2d2d44",
                color: "white",
                height: 90,
                fontFamily: "monospace",
              }}
              autoFocus
            />
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: "#4b5563" }}>
                Tip: naviga il sito in un altro tab, copia gli URL dalla barra degli indirizzi
              </span>
              <button
                onClick={handlePasteImport}
                disabled={!pasteText.trim()}
                className="px-3 py-1.5 rounded-md text-xs transition-colors"
                style={{
                  background: pasteText.trim() ? "#4f46e5" : "#1e1e2e",
                  color: pasteText.trim() ? "white" : "#4b5563",
                  cursor: pasteText.trim() ? "pointer" : "not-allowed",
                  border: "none",
                }}
              >
                Importa come Flow
              </button>
            </div>
          </div>
        )}

        {/* ═══ Suggestions panel ═══ */}
        {showSuggestions && (
          <div
            className="px-5 py-3 flex flex-col gap-2 flex-shrink-0"
            style={{ borderBottom: "1px solid #1f2937", background: "#0a0a14" }}
          >
            <div className="text-xs" style={{ color: "#9ca3af" }}>
              Route comuni — clicca per aggiungere al primo flusso disponibile:
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {COMMON_ROUTES.map((route) => {
                const alreadyUsed = usedRoutes.has(route);
                return (
                  <button
                    key={route}
                    disabled={alreadyUsed}
                    onClick={() => {
                      const targetLane = activeLaneForAdd || lanes[0]?.id;
                      if (targetLane) addStepToLane(targetLane, route);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors"
                    style={{
                      background: alreadyUsed ? "#1a1a2e" : "#1e1e2e",
                      border: alreadyUsed ? "1px solid #2d2d44" : "1px solid #4f46e540",
                      color: alreadyUsed ? "#4b5563" : "#818cf8",
                      cursor: alreadyUsed ? "default" : "pointer",
                      fontFamily: "monospace",
                      textDecoration: alreadyUsed ? "line-through" : "none",
                      opacity: alreadyUsed ? 0.5 : 1,
                    }}
                  >
                    {!alreadyUsed && <Plus size={9} />}
                    {route}
                  </button>
                );
              })}
            </div>
            <div className="text-xs" style={{ color: "#4b5563" }}>
              Oppure scrivi direttamente le route personalizzate nel campo "Aggiungi pagina" di ogni flusso.
            </div>
          </div>
        )}

        {/* ═══ Flow lanes ═══ */}
        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ minHeight: 0 }}>
          {lanes.length === 0 && (
            <div
              className="flex flex-col items-center justify-center h-full gap-3"
              style={{ color: "#4b5563" }}
            >
              <Layout size={32} />
              <span className="text-sm">Nessun flusso</span>
              <span className="text-xs" style={{ color: "#374151" }}>
                Clicca "+ Aggiungi flusso" per iniziare a costruire i tuoi user flow
              </span>
            </div>
          )}

          {lanes.map((lane) => {
            const color = FLOW_COLORS[lane.flowType] || "#6b7280";
            const isValid = lane.steps.length >= 2;

            return (
              <div
                key={lane.id}
                className="mb-3 rounded-lg"
                style={{
                  border: `1px solid ${color}30`,
                  background: `${color}08`,
                }}
              >
                {/* Lane header */}
                <div
                  className="flex items-center justify-between px-3 py-2"
                  style={{ borderBottom: `1px solid ${color}20` }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Flow type badge */}
                    <div className="relative">
                      <button
                        onClick={() =>
                          setTypePickerLane(typePickerLane === lane.id ? null : lane.id)
                        }
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs cursor-pointer"
                        style={{
                          background: `${color}25`,
                          color,
                          border: `1px solid ${color}40`,
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: color }}
                        />
                        {FLOW_LABELS[lane.flowType]}
                        <ChevronDown size={10} />
                      </button>

                      {typePickerLane === lane.id && (
                        <div
                          className="absolute top-full left-0 mt-1 py-1 rounded-md z-50"
                          style={{
                            background: "#1e1e2e",
                            border: "1px solid #2d2d44",
                            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                            minWidth: 140,
                          }}
                        >
                          {FLOW_TYPE_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setLaneType(lane.id, opt.value)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors"
                              style={{
                                color: lane.flowType === opt.value ? opt.color : "#d1d5db",
                                background: lane.flowType === opt.value ? `${opt.color}15` : "transparent",
                                border: "none",
                                cursor: "pointer",
                              }}
                            >
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ background: opt.color }}
                              />
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Lane name (editable) */}
                    {editingLaneName === lane.id ? (
                      <input
                        type="text"
                        value={editingNameValue}
                        onChange={(e) => setEditingNameValue(e.target.value)}
                        onBlur={() => {
                          if (editingNameValue.trim()) {
                            setLaneName(lane.id, editingNameValue.trim());
                          }
                          setEditingLaneName(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (editingNameValue.trim()) {
                              setLaneName(lane.id, editingNameValue.trim());
                            }
                            setEditingLaneName(null);
                          }
                          if (e.key === "Escape") setEditingLaneName(null);
                        }}
                        className="px-2 py-0.5 rounded text-xs outline-none"
                        style={{
                          background: "#1e1e2e",
                          border: "1px solid #4f46e5",
                          color: "white",
                          width: 140,
                        }}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="text-xs cursor-pointer truncate"
                        style={{ color: "#d1d5db" }}
                        onClick={() => {
                          setEditingLaneName(lane.id);
                          setEditingNameValue(lane.name);
                        }}
                        title="Clicca per rinominare"
                      >
                        {lane.name}
                      </span>
                    )}

                    {!isValid && (
                      <span className="text-xs" style={{ color: "#f59e0b", fontSize: 10 }}>
                        servono 2+ step
                      </span>
                    )}
                  </div>

                  {/* Lane actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => duplicateLane(lane.id)}
                      className="p-1 rounded transition-colors"
                      style={{ color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}
                      title="Duplica flusso come variante"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={() => removeLane(lane.id)}
                      className="p-1 rounded transition-colors"
                      style={{ color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}
                      title="Elimina flusso"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Steps */}
                <div className="px-3 py-2">
                  <div className="flex items-center flex-wrap gap-1.5">
                    {lane.steps.map((step, stepIdx) => (
                      <div key={step.id} className="contents">
                        {/* Step pill */}
                        <div
                          className="group flex items-center gap-1 px-2 py-1.5 rounded-md relative"
                          style={{
                            background: "#1a1a2e",
                            border: "1px solid #2d2d44",
                          }}
                        >
                          {/* Reorder buttons */}
                          <div className="flex flex-col mr-0.5">
                            {stepIdx > 0 && (
                              <button
                                onClick={() => moveStep(lane.id, step.id, -1)}
                                className="text-xs opacity-0 group-hover:opacity-60 transition-opacity"
                                style={{ color: "#9ca3af", lineHeight: "0.8", fontSize: 8, background: "none", border: "none", cursor: "pointer" }}
                                title="Sposta a sinistra"
                              >
                                &#9664;
                              </button>
                            )}
                            {stepIdx < lane.steps.length - 1 && (
                              <button
                                onClick={() => moveStep(lane.id, step.id, 1)}
                                className="text-xs opacity-0 group-hover:opacity-60 transition-opacity"
                                style={{ color: "#9ca3af", lineHeight: "0.8", fontSize: 8, background: "none", border: "none", cursor: "pointer" }}
                                title="Sposta a destra"
                              >
                                &#9654;
                              </button>
                            )}
                          </div>

                          {/* Route input */}
                          <input
                            type="text"
                            defaultValue={step.route}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val) updateStepRoute(lane.id, step.id, val);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                            className="text-xs outline-none bg-transparent"
                            style={{
                              color: "#e5e7eb",
                              width: Math.max(50, step.route.length * 7 + 10),
                              maxWidth: 180,
                              fontFamily: "monospace",
                              border: "none",
                            }}
                            title="Modifica percorso"
                          />

                          {/* Screen name label */}
                          <span
                            className="text-xs ml-0.5"
                            style={{ color: "#6b7280", fontSize: 9 }}
                          >
                            {routeToName(step.route)}
                          </span>

                          {/* Remove step */}
                          <button
                            onClick={() => removeStep(lane.id, step.id)}
                            className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ color: "#6b7280", background: "none", border: "none", cursor: "pointer" }}
                            title="Rimuovi step"
                          >
                            <X size={10} />
                          </button>
                        </div>

                        {/* Arrow between steps */}
                        {stepIdx < lane.steps.length - 1 && (
                          <ArrowRight size={14} style={{ color, flexShrink: 0 }} />
                        )}
                      </div>
                    ))}

                    {/* Add step button */}
                    {activeLaneForAdd === lane.id ? (
                      <div
                        className="flex items-center gap-1 rounded-md overflow-hidden"
                        style={{
                          border: `1px solid ${color}60`,
                          background: "#1a1a2e",
                        }}
                      >
                        <input
                          ref={quickInputRef}
                          type="text"
                          value={quickRoute}
                          onChange={(e) => setQuickRoute(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleQuickAdd();
                            if (e.key === "Escape") {
                              setActiveLaneForAdd(null);
                              setQuickRoute("");
                            }
                          }}
                          onBlur={() => {
                            setTimeout(() => {
                              setActiveLaneForAdd(null);
                              setQuickRoute("");
                            }, 200);
                          }}
                          placeholder="/route o URL completo..."
                          className="px-2 py-1 text-xs outline-none bg-transparent"
                          style={{
                            color: "white",
                            width: 180,
                            fontFamily: "monospace",
                            border: "none",
                          }}
                          autoFocus
                        />
                        <button
                          onClick={handleQuickAdd}
                          className="px-2 py-1 text-xs"
                          style={{ color, background: `${color}20`, border: "none", cursor: "pointer" }}
                        >
                          Aggiungi
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setActiveLaneForAdd(lane.id);
                          setQuickRoute("");
                          setTimeout(() => quickInputRef.current?.focus(), 50);
                        }}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs transition-colors"
                        style={{
                          border: `1px dashed ${color}40`,
                          color: `${color}aa`,
                          background: "transparent",
                          cursor: "pointer",
                        }}
                        title="Aggiungi una pagina a questo flusso"
                      >
                        <Plus size={12} />
                        Aggiungi pagina
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Add flow button */}
          <button
            onClick={addLane}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-xs transition-colors"
            style={{
              border: "1px dashed #2d2d44",
              color: "#818cf8",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            <Plus size={14} />
            Aggiungi flusso
          </button>
        </div>

        {/* ═══ Footer ═══ */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid #1f2937" }}
        >
          <div className="flex items-center gap-3">
            {!canConfirm ? (
              <span className="text-xs" style={{ color: "#f59e0b" }}>
                {!hasValidUrl
                  ? "Inserisci un URL valido per il tuo sito Figma Make"
                  : "Ogni flusso ha bisogno di almeno 2 pagine per generare le connessioni"}
              </span>
            ) : (
              <span className="text-xs" style={{ color: "#9ca3af" }}>
                {validLanes.length} flusso{validLanes.length !== 1 ? "i" : ""} &middot;{" "}
                {allRoutes.length} pagin{allRoutes.length !== 1 ? "e" : "a"} unic{allRoutes.length !== 1 ? "he" : "a"}
              </span>
            )}
          </div>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="flex items-center gap-1.5 px-5 py-2 rounded-md text-sm transition-colors"
            style={{
              background: canConfirm ? "#4f46e5" : "#1e1e2e",
              color: canConfirm ? "white" : "#4b5563",
              cursor: canConfirm ? "pointer" : "not-allowed",
              border: "none",
            }}
          >
            <Layout size={14} />
            Genera Diagramma
          </button>
        </div>
      </div>
    </div>
  );
}