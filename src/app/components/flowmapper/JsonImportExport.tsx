import React, { useState, useRef, useCallback } from "react";
import {
  X,
  Download,
  Upload,
  Copy,
  Check,
  FileJson,
  AlertTriangle,
  Info,
} from "lucide-react";
import type { Screen, Connection } from "./types";
import { autoLayout } from "./layout";

/* ─── Serialization format ───────────────────────────── */

interface FlowMapperJSON {
  version: 1;
  exportedAt: string;
  name: string;
  screens: Screen[];
  connections: Connection[];
}

/* ─── Export helpers ──────────────────────────────────── */

function serializeDiagram(
  screens: Screen[],
  connections: Connection[],
  name: string
): string {
  const data: FlowMapperJSON = {
    version: 1,
    exportedAt: new Date().toISOString(),
    name,
    screens,
    connections,
  };
  return JSON.stringify(data, null, 2);
}

function downloadJSON(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Import validation ──────────────────────────────── */

interface ImportValidation {
  valid: boolean;
  data?: FlowMapperJSON;
  errors: string[];
  warnings: string[];
}

function validateImport(raw: string): ImportValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, errors: ["JSON non valido: errore di parsing."], warnings };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { valid: false, errors: ["Il file non contiene un oggetto JSON valido."], warnings };
  }

  if (parsed.version !== 1) {
    warnings.push(`Versione ${parsed.version ?? "sconosciuta"} — potrebbe non essere compatibile.`);
  }

  if (!Array.isArray(parsed.screens)) {
    errors.push("Campo 'screens' mancante o non e un array.");
  } else {
    for (let i = 0; i < parsed.screens.length; i++) {
      const s = parsed.screens[i];
      if (!s.id) errors.push(`Screen[${i}] manca il campo 'id'.`);
      if (!s.name && !s.question) warnings.push(`Screen[${i}] non ha ne nome ne question.`);
      if (typeof s.x !== "number" || typeof s.y !== "number") {
        warnings.push(`Screen[${i}] ha coordinate mancanti — verra riposizionato.`);
      }
    }
  }

  if (!Array.isArray(parsed.connections)) {
    errors.push("Campo 'connections' mancante o non e un array.");
  } else {
    const screenIds = new Set(
      (parsed.screens || []).map((s: any) => s.id)
    );
    for (let i = 0; i < parsed.connections.length; i++) {
      const c = parsed.connections[i];
      if (!c.id) errors.push(`Connection[${i}] manca il campo 'id'.`);
      if (!c.sourceId) errors.push(`Connection[${i}] manca 'sourceId'.`);
      if (!c.destinationId) errors.push(`Connection[${i}] manca 'destinationId'.`);
      if (c.sourceId && !screenIds.has(c.sourceId)) {
        warnings.push(`Connection[${i}] referenzia un sourceId inesistente: ${c.sourceId}`);
      }
      if (c.destinationId && !screenIds.has(c.destinationId)) {
        warnings.push(`Connection[${i}] referenzia un destinationId inesistente: ${c.destinationId}`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  return {
    valid: true,
    data: parsed as FlowMapperJSON,
    errors,
    warnings,
  };
}

/* ─── Component ──────────────────────────────────────── */

export interface JsonImportResult {
  screens: Screen[];
  connections: Connection[];
}

interface JsonImportExportProps {
  screens: Screen[];
  connections: Connection[];
  onImport: (result: JsonImportResult) => void;
  onClose: () => void;
}

export function JsonImportExport({
  screens,
  connections,
  onImport,
  onClose,
}: JsonImportExportProps) {
  const [activeTab, setActiveTab] = useState<"export" | "import">(
    screens.length > 0 ? "export" : "import"
  );
  const [exportName, setExportName] = useState("flowmapper-diagram");
  const [copied, setCopied] = useState(false);

  // Import state
  const [importText, setImportText] = useState("");
  const [validation, setValidation] = useState<ImportValidation | null>(null);
  const [preserveLayout, setPreserveLayout] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportJSON = serializeDiagram(screens, connections, exportName);

  /* ── Export actions ── */
  const handleDownload = () => {
    downloadJSON(exportJSON, `${exportName || "flowmapper"}.json`);
  };

  const handleCopy = useCallback(() => {
    try {
      // Fallback: use a temporary textarea + execCommand for environments
      // where the Clipboard API is blocked by permissions policy
      const textarea = document.createElement("textarea");
      textarea.value = exportJSON;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // If even execCommand fails, show a user-friendly message
      alert("Impossibile copiare negli appunti. Usa il pulsante Download.");
    }
  }, [exportJSON]);

  /* ── Import actions ── */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setImportText(text);
      setValidation(validateImport(text));
    };
    reader.readAsText(file);
  };

  const handleTextChange = (text: string) => {
    setImportText(text);
    if (text.trim()) {
      setValidation(validateImport(text));
    } else {
      setValidation(null);
    }
  };

  const handleImportConfirm = () => {
    if (!validation?.valid || !validation.data) return;
    let importedScreens = validation.data.screens.map((s) => ({ ...s }));
    const importedConnections = validation.data.connections.map((c) => ({ ...c }));

    if (!preserveLayout) {
      // Recalculate layout from scratch
      importedScreens = autoLayout(importedScreens, importedConnections);
    } else {
      // Fill in missing coordinates for screens that don't have them
      const hasMissing = importedScreens.some(
        (s) => typeof s.x !== "number" || typeof s.y !== "number"
      );
      if (hasMissing) {
        importedScreens = autoLayout(importedScreens.map((s) => ({
          ...s,
          x: typeof s.x === "number" ? s.x : 0,
          y: typeof s.y === "number" ? s.y : 0,
        })), importedConnections);
      }
    }

    onImport({ screens: importedScreens, connections: importedConnections });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }}
    >
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: "min(92vw, 600px)",
          maxHeight: "min(88vh, 680px)",
          background: "#0d0d1a",
          border: "1px solid #1f2937",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid #1f2937" }}
        >
          <div className="flex items-center gap-2.5">
            <FileJson size={18} style={{ color: "#818cf8" }} />
            <div>
              <div
                style={{
                  color: "#e2e8f0",
                  fontSize: 15,
                  fontFamily: "system-ui",
                }}
              >
                Importa / Esporta JSON
              </div>
              <div style={{ color: "#6b7280", fontSize: 10 }}>
                Salva e carica i tuoi diagrammi come file JSON
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:opacity-70"
            style={{ color: "#6b7280" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: "1px solid #1f2937" }}>
          {(["export", "import"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-2.5 text-sm transition-colors flex items-center justify-center gap-1.5"
              style={{
                color: activeTab === tab ? "#818cf8" : "#6b7280",
                borderBottom:
                  activeTab === tab
                    ? "2px solid #6366f1"
                    : "2px solid transparent",
                background: "transparent",
                fontFamily: "system-ui",
                fontSize: 12,
              }}
            >
              {tab === "export" ? (
                <>
                  <Download size={12} /> Esporta
                </>
              ) : (
                <>
                  <Upload size={12} /> Importa
                </>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {activeTab === "export" ? (
            <>
              {/* Export name */}
              <div>
                <label
                  style={{ color: "#9ca3af", fontSize: 10 }}
                >
                  Nome file
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={exportName}
                    onChange={(e) => setExportName(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-md text-sm outline-none"
                    style={{
                      background: "#1e1e2e",
                      border: "1px solid #2d2d44",
                      color: "white",
                    }}
                  />
                  <span
                    style={{ color: "#6b7280", fontSize: 12 }}
                  >
                    .json
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div
                className="flex items-center gap-3 px-3 py-2 rounded-md"
                style={{ background: "#1e1e2e" }}
              >
                <span style={{ color: "#9ca3af", fontSize: 11 }}>
                  {screens.length} nodi
                </span>
                <span style={{ color: "#4b5563" }}>·</span>
                <span style={{ color: "#9ca3af", fontSize: 11 }}>
                  {connections.length} connessioni
                </span>
                <span style={{ color: "#4b5563" }}>·</span>
                <span style={{ color: "#9ca3af", fontSize: 11 }}>
                  {(new Blob([exportJSON]).size / 1024).toFixed(1)} KB
                </span>
                <span style={{ color: "#4b5563" }}>·</span>
                <span style={{ color: "#22c55e", fontSize: 11 }}>
                  posizioni incluse
                </span>
              </div>

              {/* Preview */}
              <div>
                <label
                  style={{ color: "#9ca3af", fontSize: 10 }}
                >
                  Anteprima JSON
                </label>
                <pre
                  className="mt-1 p-3 rounded-lg text-xs overflow-auto"
                  style={{
                    background: "#0a0a14",
                    border: "1px solid #1f2937",
                    color: "#86efac",
                    maxHeight: 240,
                    fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
                    fontSize: 10,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {screens.length === 0
                    ? "// Nessun diagramma da esportare.\n// Genera prima un diagramma, poi torna qui."
                    : exportJSON.length > 3000
                      ? exportJSON.slice(0, 3000) + "\n\n// ... (troncato per l'anteprima)"
                      : exportJSON}
                </pre>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={handleDownload}
                  disabled={screens.length === 0}
                  className="flex-1 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all hover:opacity-90 disabled:opacity-30"
                  style={{
                    background:
                      screens.length > 0
                        ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                        : "#2d2d44",
                    color: "white",
                  }}
                >
                  <Download size={13} />
                  Scarica JSON
                </button>
                <button
                  onClick={handleCopy}
                  disabled={screens.length === 0}
                  className="py-2 px-4 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all hover:opacity-90 disabled:opacity-30"
                  style={{
                    background: "#1e1e2e",
                    border: "1px solid #2d2d44",
                    color: copied ? "#22c55e" : "#9ca3af",
                  }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Copiato!" : "Copia"}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* File upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-6 rounded-lg flex flex-col items-center gap-2 transition-all hover:opacity-80"
                style={{
                  background: "#0f0f20",
                  border: "2px dashed #2d2d44",
                  color: "#6b7280",
                }}
              >
                <Upload size={24} />
                <span style={{ fontSize: 12 }}>
                  Clicca per caricare un file .json
                </span>
                <span style={{ fontSize: 10, color: "#4b5563" }}>
                  oppure incolla il JSON nel campo sotto
                </span>
              </button>

              {/* JSON text input */}
              <div>
                <label
                  style={{ color: "#9ca3af", fontSize: 10 }}
                >
                  JSON da importare
                </label>
                <textarea
                  value={importText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder='Incolla qui il JSON esportato da FlowMapper...\n\n{"version": 1, "screens": [...], "connections": [...]}'
                  rows={8}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-xs outline-none resize-none"
                  style={{
                    background: "#0a0a14",
                    border: `1px solid ${validation && !validation.valid ? "#7f1d1d" : "#1f2937"}`,
                    color: "#e2e8f0",
                    fontFamily:
                      "'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
                    fontSize: 10,
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* Validation result */}
              {validation && (
                <div className="flex flex-col gap-2">
                  {validation.valid ? (
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{
                        background: "#0d2818",
                        border: "1px solid #14532d",
                      }}
                    >
                      <Check size={14} style={{ color: "#22c55e" }} />
                      <div>
                        <div style={{ color: "#86efac", fontSize: 12 }}>
                          JSON valido!
                        </div>
                        <div style={{ color: "#6b7280", fontSize: 10 }}>
                          {validation.data?.screens.length} nodi ·{" "}
                          {validation.data?.connections.length} connessioni
                          {validation.data?.name
                            ? ` · "${validation.data.name}"`
                            : ""}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex flex-col gap-1 px-3 py-2 rounded-lg"
                      style={{
                        background: "#2d1212",
                        border: "1px solid #7f1d1d",
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle
                          size={13}
                          style={{ color: "#f87171" }}
                        />
                        <span style={{ color: "#f87171", fontSize: 12 }}>
                          JSON non valido
                        </span>
                      </div>
                      {validation.errors.map((err, i) => (
                        <div
                          key={i}
                          style={{ color: "#fca5a5", fontSize: 10, paddingLeft: 20 }}
                        >
                          • {err}
                        </div>
                      ))}
                    </div>
                  )}

                  {validation.warnings.length > 0 && (
                    <div
                      className="flex flex-col gap-1 px-3 py-2 rounded-lg"
                      style={{
                        background: "#2d2000",
                        border: "1px solid #713f12",
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <Info size={13} style={{ color: "#fbbf24" }} />
                        <span style={{ color: "#fbbf24", fontSize: 11 }}>
                          {validation.warnings.length} avvisi
                        </span>
                      </div>
                      {validation.warnings.slice(0, 5).map((w, i) => (
                        <div
                          key={i}
                          style={{
                            color: "#fde68a",
                            fontSize: 10,
                            paddingLeft: 20,
                          }}
                        >
                          • {w}
                        </div>
                      ))}
                      {validation.warnings.length > 5 && (
                        <div
                          style={{
                            color: "#92400e",
                            fontSize: 10,
                            paddingLeft: 20,
                          }}
                        >
                          ... e altri {validation.warnings.length - 5} avvisi
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Layout option + Import button */}
              {validation?.valid && (() => {
                const posCount = validation.data?.screens.filter(
                  (s) => typeof s.x === "number" && typeof s.y === "number"
                ).length ?? 0;
                const totalCount = validation.data?.screens.length ?? 0;
                const allHavePos = posCount === totalCount && totalCount > 0;
                return (
                  <div
                    className="flex flex-col gap-2 px-3 py-2.5 rounded-lg"
                    style={{ background: "#111122", border: "1px solid #1f2937" }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label
                          className="flex items-center gap-2"
                          style={{ cursor: "pointer" }}
                        >
                          <input
                            type="checkbox"
                            checked={preserveLayout}
                            onChange={(e) => setPreserveLayout(e.target.checked)}
                            style={{ accentColor: "#22c55e" }}
                          />
                          <span style={{ color: "#e2e8f0", fontSize: 12 }}>
                            Mantieni layout salvato
                          </span>
                        </label>
                      </div>
                      {allHavePos ? (
                        <span
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                          style={{ background: "#0d2818", color: "#22c55e", fontSize: 9 }}
                        >
                          <Check size={9} />
                          {posCount}/{totalCount} posizioni
                        </span>
                      ) : (
                        <span
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                          style={{ background: "#2d2000", color: "#fbbf24", fontSize: 9 }}
                        >
                          <AlertTriangle size={9} />
                          {posCount}/{totalCount} posizioni
                        </span>
                      )}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 10, lineHeight: 1.4 }}>
                      {preserveLayout
                        ? "Le posizioni x/y dei nodi salvate nel JSON verranno ripristinate esattamente. I nodi senza coordinate verranno riposizionati automaticamente."
                        : "Tutte le posizioni verranno ricalcolate con auto-layout, ignorando le coordinate salvate nel JSON."}
                    </div>
                  </div>
                );
              })()}

              <button
                onClick={handleImportConfirm}
                disabled={!validation?.valid}
                className="w-full py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all hover:opacity-90 disabled:opacity-30"
                style={{
                  background:
                    validation?.valid
                      ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                      : "#2d2d44",
                  color: "white",
                }}
              >
                <Upload size={13} />
                {preserveLayout ? "Importa con layout salvato" : "Importa con auto-layout"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}