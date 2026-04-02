import React from "react";
import type { Screen } from "./types";
import { NODE_WIDTH, NODE_HEIGHT, DECISION_H } from "./types";
import { useTheme } from "./ThemeContext";

// ───────────────────────────────────────────────────────
// Alignment types
// ───────────────────────────────────────────────────────

export type AlignAction =
  | "left"
  | "center-h"
  | "right"
  | "top"
  | "center-v"
  | "bottom"
  | "distribute-h"
  | "distribute-v";

// ───────────────────────────────────────────────────────
// Core alignment logic
// ───────────────────────────────────────────────────────

function getNodeHeight(s: Screen): number {
  return s.nodeKind === "decision" ? DECISION_H : NODE_HEIGHT;
}

/**
 * Apply an alignment action to the given screens (mutates nothing).
 * Returns a Map<screenId, {x,y}> with the new positions.
 */
export function computeAlignment(
  action: AlignAction,
  screens: Screen[],
  selectedIds: Set<string>
): Map<string, { x: number; y: number }> {
  const selected = screens.filter((s) => selectedIds.has(s.id));
  if (selected.length < 2) return new Map();

  const result = new Map<string, { x: number; y: number }>();

  switch (action) {
    case "left": {
      const minX = Math.min(...selected.map((s) => s.x));
      for (const s of selected) result.set(s.id, { x: minX, y: s.y });
      break;
    }
    case "right": {
      const maxRight = Math.max(...selected.map((s) => s.x + NODE_WIDTH));
      for (const s of selected)
        result.set(s.id, { x: maxRight - NODE_WIDTH, y: s.y });
      break;
    }
    case "center-h": {
      const centers = selected.map((s) => s.x + NODE_WIDTH / 2);
      const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
      for (const s of selected)
        result.set(s.id, { x: Math.round(avg - NODE_WIDTH / 2), y: s.y });
      break;
    }
    case "top": {
      const minY = Math.min(...selected.map((s) => s.y));
      for (const s of selected) result.set(s.id, { x: s.x, y: minY });
      break;
    }
    case "bottom": {
      const maxBottom = Math.max(
        ...selected.map((s) => s.y + getNodeHeight(s))
      );
      for (const s of selected)
        result.set(s.id, { x: s.x, y: maxBottom - getNodeHeight(s) });
      break;
    }
    case "center-v": {
      const centers = selected.map((s) => s.y + getNodeHeight(s) / 2);
      const avg = centers.reduce((a, b) => a + b, 0) / centers.length;
      for (const s of selected)
        result.set(s.id, {
          x: s.x,
          y: Math.round(avg - getNodeHeight(s) / 2),
        });
      break;
    }
    case "distribute-h": {
      const sorted = [...selected].sort((a, b) => a.x - b.x);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalSpan = last.x + NODE_WIDTH - first.x;
      const totalNodeWidth = sorted.length * NODE_WIDTH;
      const gap =
        sorted.length > 1
          ? (totalSpan - totalNodeWidth) / (sorted.length - 1)
          : 0;
      let currentX = first.x;
      for (const s of sorted) {
        result.set(s.id, { x: Math.round(currentX), y: s.y });
        currentX += NODE_WIDTH + gap;
      }
      break;
    }
    case "distribute-v": {
      const sorted = [...selected].sort((a, b) => a.y - b.y);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalSpan = last.y + getNodeHeight(last) - first.y;
      const totalNodeHeight = sorted.reduce(
        (sum, s) => sum + getNodeHeight(s),
        0
      );
      const gap =
        sorted.length > 1
          ? (totalSpan - totalNodeHeight) / (sorted.length - 1)
          : 0;
      let currentY = first.y;
      for (const s of sorted) {
        result.set(s.id, { x: s.x, y: Math.round(currentY) });
        currentY += getNodeHeight(s) + gap;
      }
      break;
    }
  }

  return result;
}

// ───────────────────────────────────────────────────────
// SVG mini-icons for alignment buttons (12×12)
// ───────────────────────────────────────────────────────

const iconSize = 14;

const AlignLeftIcon = () => (
  <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="2" x2="2" y2="14" />
    <rect x="4" y="3" width="10" height="3" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
    <rect x="4" y="9" width="6" height="3" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
  </svg>
);

const AlignCenterHIcon = () => (
  <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="8" y1="1" x2="8" y2="15" strokeDasharray="2,2" opacity="0.5" />
    <rect x="3" y="3" width="10" height="3" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
    <rect x="5" y="9" width="6" height="3" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
  </svg>
);

const AlignRightIcon = () => (
  <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="14" y1="2" x2="14" y2="14" />
    <rect x="2" y="3" width="10" height="3" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
    <rect x="6" y="9" width="6" height="3" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
  </svg>
);

const AlignTopIcon = () => (
  <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="2" x2="14" y2="2" />
    <rect x="3" y="4" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
    <rect x="9" y="4" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
  </svg>
);

const AlignCenterVIcon = () => (
  <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="1" y1="8" x2="15" y2="8" strokeDasharray="2,2" opacity="0.5" />
    <rect x="3" y="3" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
    <rect x="9" y="5" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
  </svg>
);

const AlignBottomIcon = () => (
  <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="14" x2="14" y2="14" />
    <rect x="3" y="2" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
    <rect x="9" y="6" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
  </svg>
);

const DistributeHIcon = () => (
  <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="1" y1="2" x2="1" y2="14" opacity="0.4" />
    <line x1="15" y1="2" x2="15" y2="14" opacity="0.4" />
    <rect x="3" y="4" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
    <rect x="10" y="4" width="3" height="8" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
  </svg>
);

const DistributeVIcon = () => (
  <svg width={iconSize} height={iconSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <line x1="2" y1="1" x2="14" y2="1" opacity="0.4" />
    <line x1="2" y1="15" x2="14" y2="15" opacity="0.4" />
    <rect x="4" y="3" width="8" height="3" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
    <rect x="4" y="10" width="8" height="3" rx="0.5" fill="currentColor" opacity="0.25" stroke="currentColor" />
  </svg>
);

// ───────────────────────────────────────────────────────
// Toolbar component
// ───────────────────────────────────────────────────────

interface AlignToolbarProps {
  onAlign: (action: AlignAction) => void;
  /** Number of selected nodes — used to disable buttons when < 2 */
  count: number;
}

const ACTIONS: { action: AlignAction; icon: React.ReactNode; label: string; group: "align" | "distribute" }[] = [
  { action: "left",         icon: <AlignLeftIcon />,     label: "Allinea a sinistra",       group: "align" },
  { action: "center-h",     icon: <AlignCenterHIcon />,  label: "Centra orizzontalmente",   group: "align" },
  { action: "right",        icon: <AlignRightIcon />,    label: "Allinea a destra",         group: "align" },
  { action: "top",          icon: <AlignTopIcon />,      label: "Allinea in alto",          group: "align" },
  { action: "center-v",     icon: <AlignCenterVIcon />,  label: "Centra verticalmente",     group: "align" },
  { action: "bottom",       icon: <AlignBottomIcon />,   label: "Allinea in basso",         group: "align" },
  { action: "distribute-h", icon: <DistributeHIcon />,   label: "Distribuisci orizzontale", group: "distribute" },
  { action: "distribute-v", icon: <DistributeVIcon />,   label: "Distribuisci verticale",   group: "distribute" },
];

export function AlignToolbar({ onAlign, count }: AlignToolbarProps) {
  const { theme: t } = useTheme();
  const disabled = count < 2;
  const distributeDisabled = count < 3;

  return (
    <div className="flex items-center gap-0.5">
      {ACTIONS.map(({ action, icon, label, group }) => {
        const isDisabled = group === "distribute" ? distributeDisabled : disabled;
        return (
          <button
            key={action}
            onClick={() => onAlign(action)}
            disabled={isDisabled}
            className="p-1 rounded transition-colors disabled:opacity-25"
            style={{
              background: "transparent",
              border: "none",
              color: isDisabled ? t.textDim : t.accentText,
              cursor: isDisabled ? "not-allowed" : "pointer",
            }}
            title={label + (isDisabled ? (group === "distribute" ? " (min 3 nodi)" : " (min 2 nodi)") : "")}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}