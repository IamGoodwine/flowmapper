import React, { useRef, useState, useCallback, useEffect } from "react";
import type { NodeKind } from "./types";
import { NODE_WIDTH, NODE_HEIGHT, DECISION_H } from "./types";
import { MousePointer2, Hand, AppWindow, Diamond, Frame } from "lucide-react";
import { useTheme } from "./ThemeContext";

/** Info about a drag in progress from the palette */
export interface PaletteDragInfo {
  kind: NodeKind;
  /** Current mouse position in screen coords */
  screenX: number;
  screenY: number;
}

interface NodePaletteProps {
  /** Called while dragging (to render ghost on canvas) */
  onDragMove: (info: PaletteDragInfo | null) => void;
  /** Called on drop: diagram coordinates + kind */
  onDrop: (kind: NodeKind, diagramX: number, diagramY: number) => void;
  /** Canvas container ref for coordinate conversion */
  canvasRef: React.RefObject<HTMLDivElement | null>;
  zoom: number;
  pan: { x: number; y: number };
  snapToGrid: boolean;
  /** Current canvas interaction mode */
  canvasMode: "select" | "hand";
  /** Callback to switch canvas mode */
  onSetCanvasMode: (mode: "select" | "hand") => void;
  /** Whether section-draw mode is active */
  sectionMode?: boolean;
  /** Toggle section-draw mode */
  onToggleSectionMode?: () => void;
}

const GRID = 20;
const snap = (v: number) => Math.round(v / GRID) * GRID;

export function NodePalette({ onDragMove, onDrop, canvasRef, zoom, pan, snapToGrid, canvasMode, onSetCanvasMode, sectionMode, onToggleSectionMode }: NodePaletteProps) {
  const { theme: t } = useTheme();
  const [dragging, setDragging] = useState<{ kind: NodeKind } | null>(null);
  const dragRef = useRef<{ kind: NodeKind } | null>(null);

  /** Convert screen-space mouse coords to diagram (SVG) coords */
  const screenToDiagram = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      let dx = (localX - pan.x) / zoom;
      let dy = (localY - pan.y) / zoom;
      if (snapToGrid) {
        dx = snap(dx);
        dy = snap(dy);
      }
      return { x: dx, y: dy };
    },
    [canvasRef, zoom, pan, snapToGrid]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, kind: NodeKind) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { kind };
      setDragging({ kind });
      onDragMove({ kind, screenX: e.clientX, screenY: e.clientY });
    },
    [onDragMove]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      onDragMove({
        kind: dragRef.current.kind,
        screenX: e.clientX,
        screenY: e.clientY,
      });
    };

    const handleUp = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const kind = dragRef.current.kind;
      dragRef.current = null;
      setDragging(null);
      onDragMove(null);

      // Check if drop is over the canvas
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        const { x, y } = screenToDiagram(e.clientX, e.clientY);
        const nw = NODE_WIDTH;
        const nh = kind === "decision" ? DECISION_H : NODE_HEIGHT;
        onDrop(kind, x - nw / 2, y - nh / 2);
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, canvasRef, onDragMove, onDrop, screenToDiagram]);

  /* ── shared item cell style ── */
  const cellBase: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 10,
    padding: "6px 10px",
    minWidth: 52,
    cursor: "default",
    transition: "background 0.15s, color 0.15s",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  return (
    <div
      className="absolute z-30 flex items-center"
      style={{
        bottom: 32,
        left: "50%",
        transform: "translateX(-50%)",
        userSelect: "none",
      }}
    >
      <div
        className="flex items-center gap-0.5"
        style={{
          background: t.paletteBg,
          border: `1px solid ${t.paletteBorder}`,
          borderRadius: 16,
          padding: "5px 6px",
          boxShadow: `0 6px 32px ${t.shadow}`,
        }}
      >
        {/* ── Mode: Selezione ── */}
        <button
          onClick={() => onSetCanvasMode("select")}
          style={{
            ...cellBase,
            background: canvasMode === "select" ? t.accent : "transparent",
            color: canvasMode === "select" ? "#fff" : t.paletteInactive,
          }}
          title="Selezione (V)"
        >
          <MousePointer2 size={18} />
          <span style={{ ...labelStyle, color: canvasMode === "select" ? "#e0e0ff" : t.paletteInactive }}>
            Selezione
          </span>
        </button>

        {/* ── Mode: Mano ── */}
        <button
          onClick={() => onSetCanvasMode("hand")}
          style={{
            ...cellBase,
            background: canvasMode === "hand" ? t.accent : "transparent",
            color: canvasMode === "hand" ? "#fff" : t.paletteInactive,
          }}
          title="Mano / Pan (H)"
        >
          <Hand size={18} />
          <span style={{ ...labelStyle, color: canvasMode === "hand" ? "#e0e0ff" : t.paletteInactive }}>
            Mano
          </span>
        </button>

        {/* ── Divider ── */}
        <div
          style={{
            width: 1,
            alignSelf: "stretch",
            margin: "4px 4px",
            background: t.surfaceBorder,
            flexShrink: 0,
          }}
        />

        {/* ── Node: Schermata ── */}
        <div
          style={{
            ...cellBase,
            cursor: dragging?.kind === "screen" ? "grabbing" : "grab",
            background: dragging?.kind === "screen" ? (t.mode === "dark" ? "#2d2d5a" : "#eeeeff") : "transparent",
            border: dragging?.kind === "screen" ? `1px solid ${t.accent}` : "1px solid transparent",
            color: t.paletteInactive,
          }}
          onMouseDown={(e) => handleMouseDown(e, "screen")}
          title="Trascina per creare: Schermata"
        >
          <AppWindow size={18} />
          <span style={{ ...labelStyle, color: t.paletteInactive }}>Schermata</span>
        </div>

        {/* ── Node: Decisione ── */}
        <div
          style={{
            ...cellBase,
            cursor: dragging?.kind === "decision" ? "grabbing" : "grab",
            background: dragging?.kind === "decision" ? (t.mode === "dark" ? "#2d2d5a" : "#f0eaff") : "transparent",
            border: dragging?.kind === "decision" ? `1px solid ${t.decisionStroke}` : "1px solid transparent",
            color: t.paletteInactive,
          }}
          onMouseDown={(e) => handleMouseDown(e, "decision")}
          title="Trascina per creare: Decisione"
        >
          <Diamond size={18} />
          <span style={{ ...labelStyle, color: t.paletteInactive }}>Decisione</span>
        </div>

        {/* ── Node: Sezione ── */}
        {onToggleSectionMode && (
          <div
            style={{
              ...cellBase,
              cursor: "pointer",
              background: sectionMode ? (t.mode === "dark" ? "#2d2d5a" : "#f0eaff") : "transparent",
              border: sectionMode ? `1px solid ${t.decisionStroke}` : "1px solid transparent",
              color: t.paletteInactive,
            }}
            onClick={onToggleSectionMode}
            title="Sezione (Shift+S) — clicca e trascina sulla canvas per creare"
          >
            <Frame size={18} />
            <span style={{ ...labelStyle, color: t.paletteInactive }}>Sezione</span>
          </div>
        )}
      </div>
    </div>
  );
}