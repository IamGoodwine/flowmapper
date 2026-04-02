import React from "react";
import type { Section } from "./types";
import { MIN_SECTION_W, MIN_SECTION_H } from "./types";
import { useTheme } from "./ThemeContext";

/* ── Resize handle positions ─────────────────────────── */
type HandleId = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

interface HandleDef {
  id: HandleId;
  cursor: string;
  /** Returns position relative to section origin */
  pos: (w: number, h: number) => { x: number; y: number };
}

const HANDLES: HandleDef[] = [
  { id: "nw", cursor: "nwse-resize", pos: () => ({ x: 0, y: 0 }) },
  { id: "ne", cursor: "nesw-resize", pos: (w) => ({ x: w, y: 0 }) },
  { id: "sw", cursor: "nesw-resize", pos: (_, h) => ({ x: 0, y: h }) },
  { id: "se", cursor: "nwse-resize", pos: (w, h) => ({ x: w, y: h }) },
  { id: "n", cursor: "ns-resize", pos: (w) => ({ x: w / 2, y: 0 }) },
  { id: "s", cursor: "ns-resize", pos: (w, h) => ({ x: w / 2, y: h }) },
  { id: "w", cursor: "ew-resize", pos: (_, h) => ({ x: 0, y: h / 2 }) },
  { id: "e", cursor: "ew-resize", pos: (w, h) => ({ x: w, y: h / 2 }) },
];

const TITLE_H = 32; // height of the name header area
const CORNER_R = 6;
const HANDLE_SIZE = 5;

export interface DiagramSectionProps {
  section: Section;
  isSelected: boolean;
  onClick: (id: string, e: React.MouseEvent) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
  onResizeStart: (id: string, handle: HandleId, e: React.MouseEvent) => void;
  onDoubleClickName: (id: string) => void;
  onDoubleClickBody?: (id: string) => void;
}

export type { HandleId };

/** Compute resize deltas for a given handle */
export function applyResize(
  handle: HandleId,
  dx: number,
  dy: number,
  orig: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = orig;
  switch (handle) {
    case "se": w += dx; h += dy; break;
    case "sw": x += dx; w -= dx; h += dy; break;
    case "ne": w += dx; y += dy; h -= dy; break;
    case "nw": x += dx; w -= dx; y += dy; h -= dy; break;
    case "e": w += dx; break;
    case "w": x += dx; w -= dx; break;
    case "s": h += dy; break;
    case "n": y += dy; h -= dy; break;
  }
  // Enforce min size
  if (w < MIN_SECTION_W) {
    if (handle.includes("w")) x = orig.x + orig.w - MIN_SECTION_W;
    w = MIN_SECTION_W;
  }
  if (h < MIN_SECTION_H) {
    if (handle.includes("n")) y = orig.y + orig.h - MIN_SECTION_H;
    h = MIN_SECTION_H;
  }
  return { x, y, w, h };
}

export function DiagramSection({
  section,
  isSelected,
  onClick,
  onDragStart,
  onResizeStart,
  onDoubleClickName,
  onDoubleClickBody,
}: DiagramSectionProps) {
  const { theme: t } = useTheme();
  const col = section.color;
  const isDark = t.mode === "dark";

  const fillBg = isDark ? `${col}12` : `${col}0a`;
  const strokeCol = isDark ? `${col}55` : `${col}44`;
  const headerBg = isDark ? `${col}22` : `${col}14`;
  const nameCol = isDark ? `${col}cc` : col;
  const selStroke = col;

  return (
    <g
      transform={`translate(${section.x}, ${section.y})`}
      className="diagram-section-group"
    >
      {/* Background fill */}
      <rect
        width={section.width}
        height={section.height}
        rx={CORNER_R}
        fill={fillBg}
        stroke={isSelected ? selStroke : strokeCol}
        strokeWidth={isSelected ? 2 : 1}
        strokeDasharray={isSelected ? "none" : "6,3"}
        style={{ cursor: "move" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onDragStart(section.id, e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(section.id, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClickBody?.(section.id);
        }}
      />

      {/* Title header band */}
      <rect
        x={0}
        y={0}
        width={section.width}
        height={TITLE_H}
        rx={CORNER_R}
        fill={headerBg}
        style={{ cursor: "move", pointerEvents: "all" }}
        onMouseDown={(e) => {
          e.stopPropagation();
          onDragStart(section.id, e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(section.id, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClickName(section.id);
        }}
      />
      {/* Mask the bottom rounded corners of header */}
      <rect
        x={0}
        y={TITLE_H - CORNER_R}
        width={section.width}
        height={CORNER_R}
        fill={headerBg}
        style={{ pointerEvents: "none" }}
      />

      {/* Section name */}
      <foreignObject
        x={10}
        y={0}
        width={section.width - 20}
        height={TITLE_H}
        style={{ overflow: "visible", pointerEvents: "none" }}
      >
        <div
          style={{
            width: section.width - 20,
            height: TITLE_H,
            display: "flex",
            alignItems: "center",
            color: nameCol,
            fontSize: 13,
            fontFamily: "system-ui, sans-serif",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
          // @ts-ignore xmlns
          xmlns="http://www.w3.org/1999/xhtml"
        >
          {section.name}
        </div>
      </foreignObject>

      {/* Resize handles — only when selected */}
      {isSelected &&
        HANDLES.map((h) => {
          const p = h.pos(section.width, section.height);
          return (
            <rect
              key={h.id}
              x={p.x - HANDLE_SIZE}
              y={p.y - HANDLE_SIZE}
              width={HANDLE_SIZE * 2}
              height={HANDLE_SIZE * 2}
              rx={2}
              fill={col}
              stroke="#fff"
              strokeWidth={1}
              style={{ cursor: h.cursor }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onResizeStart(section.id, h.id, e);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          );
        })}
    </g>
  );
}