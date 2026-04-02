import React, { useEffect, useRef, useState, useCallback } from "react";
import type { Screen, Connection } from "./types";
import { FLOW_COLORS } from "./types";
import { X, ChevronLeft, ArrowRight, ArrowLeft, ExternalLink, Globe, Smartphone, Monitor, Pencil, Check } from "lucide-react";

interface ScreenPreviewModalProps {
  initialScreenId: string;
  connections: Connection[];
  screens: Screen[];
  onClose: () => void;
  onSelectScreen: (id: string) => void;
  onUpdateScreen?: (id: string, updates: Partial<Screen>) => void;
}

export function ScreenPreviewModal({
  initialScreenId,
  connections,
  screens,
  onClose,
  onSelectScreen,
  onUpdateScreen,
}: ScreenPreviewModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [currentId, setCurrentId] = useState(initialScreenId);
  const [history, setHistory] = useState<string[]>([initialScreenId]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [transitionDir, setTransitionDir] = useState<"none" | "left" | "right">("none");
  const [isAnimating, setIsAnimating] = useState(false);
  const [viewMode, setViewMode] = useState<"mobile" | "desktop">("mobile");

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editQuestion, setEditQuestion] = useState("");
  const [editPageUrl, setEditPageUrl] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const screen = screens.find((s) => s.id === currentId);
  const incoming = connections.filter((c) => c.destinationId === currentId);
  const outgoing = connections.filter((c) => c.sourceId === currentId);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const isDecision = screen?.nodeKind === "decision";

  /** Enter edit mode, populate fields from current screen */
  const startEditing = () => {
    if (!screen || !onUpdateScreen) return;
    setEditName(screen.name);
    setEditQuestion(screen.question || "");
    setEditPageUrl(screen.pageUrl || "");
    setIsEditing(true);
    setTimeout(() => nameInputRef.current?.focus(), 40);
  };

  /** Save edits and exit edit mode */
  const saveEditing = () => {
    if (!screen || !onUpdateScreen) return;
    const updates: Partial<Screen> = {};
    if (isDecision) {
      const q = editQuestion.trim();
      if (q && q !== screen.question) {
        updates.question = q;
        updates.name = q; // decision name mirrors question
      }
    } else {
      const n = editName.trim();
      if (n && n !== screen.name) updates.name = n;
    }
    const url = editPageUrl.trim();
    if (url !== (screen.pageUrl || "")) {
      updates.pageUrl = url || undefined;
    }
    if (Object.keys(updates).length > 0) {
      onUpdateScreen(screen.id, updates);
    }
    setIsEditing(false);
  };

  /** Cancel edit mode */
  const cancelEditing = () => setIsEditing(false);

  // Exit edit mode when navigating to a different screen
  useEffect(() => {
    setIsEditing(false);
  }, [currentId]);

  const navigateTo = useCallback(
    (targetId: string, direction: "left" | "right" = "left") => {
      if (targetId === currentId || isAnimating) return;
      onSelectScreen(targetId);
      setTransitionDir(direction);
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentId(targetId);
        const newHistory = [...history.slice(0, historyIndex + 1), targetId];
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setTransitionDir("none");
        setIsAnimating(false);
      }, 200);
    },
    [currentId, history, historyIndex, isAnimating, onSelectScreen]
  );

  const goBack = useCallback(() => {
    if (!canGoBack || isAnimating) return;
    const prevId = history[historyIndex - 1];
    onSelectScreen(prevId);
    setTransitionDir("right");
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentId(prevId);
      setHistoryIndex((i) => i - 1);
      setTransitionDir("none");
      setIsAnimating(false);
    }, 200);
  }, [canGoBack, history, historyIndex, isAnimating, onSelectScreen]);

  const goForward = useCallback(() => {
    if (!canGoForward || isAnimating) return;
    const nextId = history[historyIndex + 1];
    onSelectScreen(nextId);
    setTransitionDir("left");
    setIsAnimating(true);
    setTimeout(() => {
      setCurrentId(nextId);
      setHistoryIndex((i) => i + 1);
      setTransitionDir("none");
      setIsAnimating(false);
    }, 200);
  }, [canGoForward, history, historyIndex, isAnimating, onSelectScreen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (isEditing) {
        if (e.key === "Escape") cancelEditing();
        return; // don't intercept arrows while editing
      }
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" || e.key === "Backspace") goBack();
      if (e.key === "ArrowRight") goForward();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, goBack, goForward, isEditing]);

  if (!screen) return null;

  const animClass =
    transitionDir === "left"
      ? "modal-slide-out-left"
      : transitionDir === "right"
        ? "modal-slide-out-right"
        : "modal-slide-in";

  const isDesktopView = viewMode === "desktop";
  const frameW = isDesktopView ? 720 : 280;
  const frameH = isDesktopView ? 540 : 560;
  const frameRadius = isDesktopView ? 10 : 20;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div
        className="relative flex gap-5 max-h-[90vh]"
        style={{ animation: "fadeScaleIn 0.2s ease-out" }}
      >
        {/* Phone / Desktop frame with screenshot */}
        <div className="flex flex-col items-center gap-3">
          {/* Navigation bar + view mode switch */}
          <div className="flex items-center gap-2 w-full justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={goBack}
                disabled={!canGoBack}
                className="p-1.5 rounded-md transition-all"
                style={{
                  background: canGoBack ? "#1e1e2e" : "transparent",
                  border: `1px solid ${canGoBack ? "#4f46e5" : "#1f2937"}`,
                  color: canGoBack ? "#818cf8" : "#2d2d44",
                  cursor: canGoBack ? "pointer" : "not-allowed",
                }}
                title="Back (Arrow Left)"
              >
                <ChevronLeft size={14} />
              </button>
              <div
                className="px-3 py-1 rounded-full text-xs truncate max-w-[200px]"
                style={{
                  background: "#1e1e2e",
                  border: "1px solid #2d2d44",
                  color: "#d1d5db",
                }}
              >
                {historyIndex + 1} / {history.length} &middot; {screen.name}
              </div>
              <button
                onClick={goForward}
                disabled={!canGoForward}
                className="p-1.5 rounded-md transition-all"
                style={{
                  background: canGoForward ? "#1e1e2e" : "transparent",
                  border: `1px solid ${canGoForward ? "#4f46e5" : "#1f2937"}`,
                  color: canGoForward ? "#818cf8" : "#2d2d44",
                  cursor: canGoForward ? "pointer" : "not-allowed",
                }}
                title="Forward (Arrow Right)"
              >
                <ChevronLeft size={14} style={{ transform: "rotate(180deg)" }} />
              </button>
            </div>

            <div
              className="flex items-center rounded-lg p-0.5 gap-0.5"
              style={{ background: "#1e1e2e", border: "1px solid #2d2d44" }}
            >
              <button
                onClick={() => setViewMode("mobile")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-xs"
                style={{
                  background: viewMode === "mobile" ? "#4f46e5" : "transparent",
                  color: viewMode === "mobile" ? "white" : "#6b7280",
                  cursor: "pointer",
                }}
                title="Mobile view"
              >
                <Smartphone size={12} />
                <span>Mobile</span>
              </button>
              <button
                onClick={() => setViewMode("desktop")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all text-xs"
                style={{
                  background: viewMode === "desktop" ? "#4f46e5" : "transparent",
                  color: viewMode === "desktop" ? "white" : "#6b7280",
                  cursor: "pointer",
                }}
                title="Desktop view"
              >
                <Monitor size={12} />
                <span>Desktop</span>
              </button>
            </div>
          </div>

          {/* Frame */}
          <div
            className="relative flex-shrink-0 overflow-hidden"
            style={{
              width: frameW,
              height: frameH,
              background: "#1e1e2e",
              border: `2px solid ${screen.pageUrl ? "#6366f1" : "#2d2d44"}`,
              boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
              borderRadius: frameRadius,
              transition: "width 0.3s ease, height 0.3s ease, border-radius 0.3s ease",
            }}
          >
            {!screen.pageUrl && !isDesktopView && (
              <div
                className="absolute top-0 left-1/2 -translate-x-1/2 z-10 rounded-b-xl"
                style={{ width: 100, height: 24, background: "#1e1e2e" }}
              />
            )}

            {isDesktopView && !screen.pageUrl && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 z-10 relative"
                style={{ background: "#13131f", borderBottom: "1px solid #2d2d44" }}
              >
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: "#ef4444", opacity: 0.6 }} />
                  <div className="w-2 h-2 rounded-full" style={{ background: "#f59e0b", opacity: 0.6 }} />
                  <div className="w-2 h-2 rounded-full" style={{ background: "#22c55e", opacity: 0.6 }} />
                </div>
                <div
                  className="flex-1 px-2 py-0.5 rounded text-xs truncate"
                  style={{ background: "#1e1e2e", color: "#6b7280", fontSize: 9 }}
                >
                  {screen.name}
                </div>
              </div>
            )}

            {screen.pageUrl && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 z-10 relative"
                style={{ background: "#1e1e2e", borderBottom: "1px solid #2d2d44" }}
              >
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: "#ef4444", opacity: 0.6 }} />
                  <div className="w-2 h-2 rounded-full" style={{ background: "#f59e0b", opacity: 0.6 }} />
                  <div className="w-2 h-2 rounded-full" style={{ background: "#22c55e", opacity: 0.6 }} />
                </div>
                <div
                  className="flex-1 px-2 py-0.5 rounded text-xs truncate"
                  style={{ background: "#13131f", color: "#6b7280", fontSize: 9 }}
                >
                  {screen.pageUrl}
                </div>
              </div>
            )}

            <div
              className={`w-full overflow-y-auto scrollbar-thin ${animClass}`}
              style={{
                scrollbarWidth: "thin",
                scrollbarColor: "#4f46e5 transparent",
                height: screen.pageUrl || (isDesktopView && !screen.pageUrl) ? "calc(100% - 30px)" : "100%",
              }}
            >
              {screen.pageUrl ? (
                <iframe
                  src={screen.pageUrl}
                  title={screen.name}
                  className="border-0"
                  style={{
                    width: "100%",
                    height: isDesktopView ? 1600 : 1200,
                    minHeight: "100%",
                    borderRadius: `0 0 ${frameRadius - 2}px ${frameRadius - 2}px`,
                    background: "white",
                    display: "block",
                  }}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                />
              ) : screen.thumbnailUrl ? (
                <img
                  src={screen.thumbnailUrl}
                  alt={screen.name}
                  className="w-full"
                  style={{ borderRadius: frameRadius - 2, display: "block", minHeight: "100%" }}
                />
              ) : (
                <div
                  className="w-full flex flex-col items-center justify-center"
                  style={{ background: "#13131f", borderRadius: frameRadius - 2, minHeight: "100%" }}
                >
                  <div style={{ color: "#2d2d44", fontSize: 48 }}>&#x2B21;</div>
                  <div className="mt-2 text-xs" style={{ color: "#4b5563" }}>
                    No preview available
                  </div>
                </div>
              )}
            </div>

            <div
              className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
              style={{
                borderRadius: `0 0 ${frameRadius - 2}px ${frameRadius - 2}px`,
                background: "linear-gradient(to top, rgba(30,30,46,0.9), transparent)",
              }}
            />
          </div>
        </div>

        {/* ── Info panel ── */}
        <div
          className="flex flex-col rounded-xl overflow-hidden"
          style={{
            width: 280,
            background: "#13131f",
            border: "1px solid #1f2937",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          }}
        >
          {/* Header — read mode */}
          {!isEditing && (
            <div
              className="px-4 py-3 flex items-start justify-between"
              style={{ borderBottom: "1px solid #1f2937" }}
            >
              <div className="min-w-0 flex-1 mr-2">
                <div className="flex items-center gap-1.5">
                  {isDecision && (
                    <span
                      className="px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: "#6d28d9", color: "#e9d5ff", fontSize: 9 }}
                    >
                      ◆
                    </span>
                  )}
                  <span className="text-sm truncate" style={{ color: "white" }}>
                    {screen.name}
                  </span>
                </div>
                {isDecision && screen.question && screen.question !== screen.name && (
                  <div className="text-xs mt-0.5 truncate" style={{ color: "#c4b5fd", fontStyle: "italic" }}>
                    {screen.question}
                  </div>
                )}
                <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
                  {screen.pageUrl ? `Route: ${screen.figmaFrameId}` : `ID: ${screen.figmaFrameId}`}
                </div>
                {screen.pageUrl && (
                  <a
                    href={screen.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-xs transition-colors"
                    style={{ color: "#818cf8" }}
                  >
                    <Globe size={10} />
                    Open live page
                  </a>
                )}
              </div>
              {/* Modifica button */}
              {onUpdateScreen && (
                <button
                  onClick={startEditing}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-all flex-shrink-0"
                  style={{
                    background: "#1e1e2e",
                    border: "1px solid #2d2d44",
                    color: "#818cf8",
                    fontSize: 11,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "#6366f1";
                    (e.currentTarget as HTMLElement).style.background = "#1a1a3a";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "#2d2d44";
                    (e.currentTarget as HTMLElement).style.background = "#1e1e2e";
                  }}
                  title="Modifica dettagli nodo"
                >
                  <Pencil size={11} />
                  <span>Modifica</span>
                </button>
              )}
            </div>
          )}

          {/* Header — edit mode */}
          {isEditing && (
            <div
              className="px-4 py-3 flex flex-col gap-2.5"
              style={{ borderBottom: "1px solid #4f46e5" }}
            >
              {/* Edit mode badge */}
              <div className="flex items-center justify-between">
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                  style={{ background: "#4f46e520", color: "#818cf8", fontSize: 10 }}
                >
                  <Pencil size={10} />
                  Modifica
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={cancelEditing}
                    className="px-2 py-1 rounded text-xs transition-opacity hover:opacity-80"
                    style={{ color: "#6b7280" }}
                  >
                    Annulla
                  </button>
                  <button
                    onClick={saveEditing}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-opacity hover:opacity-90"
                    style={{ background: "#4f46e5", color: "white" }}
                  >
                    <Check size={11} />
                    Salva
                  </button>
                </div>
              </div>

              {/* Name or Question field */}
              {isDecision ? (
                <div>
                  <label style={{ color: "#9ca3af", fontSize: 10 }}>Domanda / Condizione</label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={editQuestion}
                    onChange={(e) => setEditQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEditing();
                      if (e.key === "Escape") cancelEditing();
                    }}
                    placeholder="es. L'utente è autenticato?"
                    className="w-full px-2.5 py-1.5 rounded mt-0.5 outline-none text-xs"
                    style={{
                      background: "#1e1e2e",
                      border: "1px solid #4b2e83",
                      color: "white",
                    }}
                  />
                </div>
              ) : (
                <div>
                  <label style={{ color: "#9ca3af", fontSize: 10 }}>Nome schermata</label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEditing();
                      if (e.key === "Escape") cancelEditing();
                    }}
                    placeholder="es. Login, Dashboard…"
                    className="w-full px-2.5 py-1.5 rounded mt-0.5 outline-none text-xs"
                    style={{
                      background: "#1e1e2e",
                      border: "1px solid #2d3ba8",
                      color: "white",
                    }}
                  />
                </div>
              )}

              {/* URL field */}
              <div>
                <label style={{ color: "#6b7280", fontSize: 10 }}>URL pagina (opzionale)</label>
                <input
                  type="url"
                  value={editPageUrl}
                  onChange={(e) => setEditPageUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEditing();
                    if (e.key === "Escape") cancelEditing();
                  }}
                  placeholder="https://example.com/page"
                  className="w-full px-2.5 py-1.5 rounded mt-0.5 outline-none text-xs"
                  style={{
                    background: "#1e1e2e",
                    border: `1px solid ${editPageUrl ? "#3b82f6" : "#1f2937"}`,
                    color: editPageUrl ? "#93c5fd" : "#6b7280",
                  }}
                />
              </div>

              <div style={{ color: "#4b5563", fontSize: 9 }}>
                Invio per salvare · Esc per annullare
              </div>
            </div>
          )}

          {/* Connections - navigable */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {incoming.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <ArrowLeft size={11} style={{ color: "#9ca3af" }} />
                  <span className="text-xs" style={{ color: "#9ca3af" }}>
                    Incoming ({incoming.length})
                  </span>
                </div>
                {incoming.map((c) => {
                  const src = screens.find((s) => s.id === c.sourceId);
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigateTo(c.sourceId, "right")}
                      className="w-full flex items-start gap-2 mb-1.5 px-2.5 py-2 rounded-lg text-left transition-all group"
                      style={{
                        background: "#1a1a2e",
                        border: "1px solid #1f2937",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = FLOW_COLORS[c.flowType];
                        (e.currentTarget as HTMLElement).style.background = "#1e1e38";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "#1f2937";
                        (e.currentTarget as HTMLElement).style.background = "#1a1a2e";
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{
                              background: FLOW_COLORS[c.flowType] + "22",
                              color: FLOW_COLORS[c.flowType],
                              fontSize: 9,
                            }}
                          >
                            {c.flowType}
                          </span>
                          <span
                            className="text-xs truncate"
                            style={{ color: "#d1d5db" }}
                          >
                            {src?.name || c.sourceId}
                          </span>
                        </div>
                        <div
                          className="text-xs mt-0.5 truncate"
                          style={{ color: "#4b5563" }}
                        >
                          {c.trigger}
                        </div>
                      </div>
                      <ExternalLink
                        size={12}
                        className="flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: FLOW_COLORS[c.flowType] }}
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {outgoing.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <ArrowRight size={11} style={{ color: "#9ca3af" }} />
                  <span className="text-xs" style={{ color: "#9ca3af" }}>
                    Outgoing ({outgoing.length})
                  </span>
                </div>
                {outgoing.map((c) => {
                  const dst = screens.find((s) => s.id === c.destinationId);
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigateTo(c.destinationId, "left")}
                      className="w-full flex items-start gap-2 mb-1.5 px-2.5 py-2 rounded-lg text-left transition-all group"
                      style={{
                        background: "#1a1a2e",
                        border: "1px solid #1f2937",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = FLOW_COLORS[c.flowType];
                        (e.currentTarget as HTMLElement).style.background = "#1e1e38";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "#1f2937";
                        (e.currentTarget as HTMLElement).style.background = "#1a1a2e";
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{
                              background: FLOW_COLORS[c.flowType] + "22",
                              color: FLOW_COLORS[c.flowType],
                              fontSize: 9,
                            }}
                          >
                            {c.flowType}
                          </span>
                          <span
                            className="text-xs truncate"
                            style={{ color: "#d1d5db" }}
                          >
                            {dst?.name || c.destinationId}
                          </span>
                        </div>
                        <div
                          className="text-xs mt-0.5 truncate"
                          style={{ color: "#4b5563" }}
                        >
                          {c.trigger}
                        </div>
                      </div>
                      <ExternalLink
                        size={12}
                        className="flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ color: FLOW_COLORS[c.flowType] }}
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {incoming.length === 0 && outgoing.length === 0 && (
              <div className="text-xs" style={{ color: "#4b5563" }}>
                No connections
              </div>
            )}
          </div>

          {/* Breadcrumb trail at bottom */}
          {history.length > 1 && (
            <div
              className="px-4 py-2 overflow-x-auto flex items-center gap-1"
              style={{ borderTop: "1px solid #1f2937" }}
            >
              {history.map((hId, i) => {
                const s = screens.find((sc) => sc.id === hId);
                const isCurrent = i === historyIndex;
                return (
                  <span key={`${hId}-${i}`} className="flex items-center gap-1">
                    {i > 0 && (
                      <span style={{ color: "#2d2d44", fontSize: 9 }}>&rsaquo;</span>
                    )}
                    <button
                      onClick={() => {
                        if (i === historyIndex || isAnimating) return;
                        const dir = i < historyIndex ? "right" : "left";
                        onSelectScreen(hId);
                        setTransitionDir(dir);
                        setIsAnimating(true);
                        setTimeout(() => {
                          setCurrentId(hId);
                          setHistoryIndex(i);
                          setTransitionDir("none");
                          setIsAnimating(false);
                        }, 200);
                      }}
                      className="px-1.5 py-0.5 rounded text-xs truncate max-w-[80px] transition-colors"
                      style={{
                        color: isCurrent ? "#818cf8" : "#4b5563",
                        background: isCurrent ? "#4f46e520" : "transparent",
                        cursor: isCurrent ? "default" : "pointer",
                        fontSize: 9,
                        whiteSpace: "nowrap",
                      }}
                      title={s?.name || hId}
                    >
                      {s?.name
                        ? s.name.length > 12
                          ? s.name.slice(0, 10) + "..."
                          : s.name
                        : hId}
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeScaleIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .modal-slide-in {
          animation: slideIn 0.2s ease-out;
        }
        .modal-slide-out-left {
          animation: slideOutLeft 0.2s ease-in;
        }
        .modal-slide-out-right {
          animation: slideOutRight 0.2s ease-in;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(0); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideOutLeft {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(-20px); }
        }
        @keyframes slideOutRight {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(20px); }
        }
      `}</style>
    </div>
  );
}
