import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Monitor,
  Diamond,
  ArrowRight,
  Lightbulb,
  GitBranch,
  AlertCircle,
  CheckCircle,
  Layers,
  GripVertical,
  Link as LinkIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { Screen, Connection, FlowType, NodeKind } from "./types";
import {
  FLOW_COLORS,
  FLOW_LABELS,
  NODE_WIDTH,
  NODE_HEIGHT,
  DECISION_H,
  H_SPACING,
  V_SPACING,
} from "./types";

/* ─── Local types ─────────────────────────────────────── */

interface LFBNode {
  id: string;
  kind: NodeKind;
  name: string;
  question: string;
  pageUrl: string;
}

interface LFBEdge {
  id: string;
  sourceId: string;
  targetId: string;
  condition?: "yes" | "no";
  flowType: FlowType;
  trigger: string;
  reason: string;
}

export interface LogicFlowResult {
  screens: Screen[];
  connections: Connection[];
}

interface LogicFlowBuilderProps {
  onConfirm: (result: LogicFlowResult) => void;
  onClose: () => void;
  initialScreens?: Screen[];
  initialConnections?: Connection[];
}

/* ─── Constants ───────────────────────────────────────── */

const FLOW_TYPE_OPTIONS: { value: FlowType; label: string; color: string; icon: React.ReactNode }[] = [
  { value: "happy", label: "Happy Path", color: FLOW_COLORS.happy, icon: <CheckCircle size={12} /> },
  { value: "secondary", label: "Secondary", color: FLOW_COLORS.secondary, icon: <GitBranch size={12} /> },
  { value: "error", label: "Error Flow", color: FLOW_COLORS.error, icon: <AlertCircle size={12} /> },
  { value: "variant", label: "Variant", color: FLOW_COLORS.variant, icon: <Layers size={12} /> },
  { value: "skip", label: "Skip", color: FLOW_COLORS.skip, icon: <ArrowRight size={12} /> },
];

const DND_TYPE = "LFB_NODE";

/* ─── Unique IDs ──────────────────────────────────────── */
let _seq = 1;
const uid = (prefix = "n") => `${prefix}-${Date.now()}-${_seq++}`;

/* ─── Auto layout for LFB output ─────────────────────── */
function lfbLayout(nodes: LFBNode[], edges: LFBEdge[]): Screen[] {
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of nodes) { adj.set(n.id, []); inDeg.set(n.id, 0); }
  for (const e of edges) {
    adj.get(e.sourceId)?.push(e.targetId);
    inDeg.set(e.targetId, (inDeg.get(e.targetId) || 0) + 1);
  }
  const roots = nodes.filter((n) => (inDeg.get(n.id) || 0) === 0);
  if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0]);

  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const queue = roots.map((r) => r.id);
  for (const r of roots) { levels.set(r.id, 0); visited.add(r.id); }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const lv = levels.get(cur)!;
    for (const child of adj.get(cur) || []) {
      if (!visited.has(child)) {
        visited.add(child);
        levels.set(child, lv + 1);
        queue.push(child);
      }
    }
  }
  for (const n of nodes) if (!levels.has(n.id)) levels.set(n.id, 0);

  const groups = new Map<number, string[]>();
  for (const [id, lv] of levels) {
    if (!groups.has(lv)) groups.set(lv, []);
    groups.get(lv)!.push(id);
  }
  const maxLv = groups.size > 0 ? Math.max(...groups.keys()) : 0;

  const result: Screen[] = [];
  for (let lv = 0; lv <= maxLv; lv++) {
    const ids = groups.get(lv) || [];
    const count = ids.length;
    const totalW = count * NODE_WIDTH + (count - 1) * (H_SPACING - NODE_WIDTH);
    const startX = -totalW / 2;
    ids.forEach((id, i) => {
      const node = nodes.find((n) => n.id === id)!;
      const isDecision = node.kind === "decision";
      result.push({
        id: node.id,
        name: node.name || node.question,
        question: node.question,
        nodeKind: node.kind,
        x: startX + i * H_SPACING,
        y: lv * V_SPACING,
        width: NODE_WIDTH,
        height: isDecision ? DECISION_H : NODE_HEIGHT,
        figmaFrameId: node.id,
        pageUrl: node.pageUrl || undefined,
      });
    });
  }
  return result;
}

/* ─── Interactive Preview (SVG with drag-to-connect) ──── */

interface DragState {
  sourceId: string;
  sourceKind: NodeKind;
  portType: "default" | "yes" | "no";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

function InteractivePreview({
  nodes,
  edges,
  onCreateEdge,
  initialScreens,
}: {
  nodes: LFBNode[];
  edges: LFBEdge[];
  onCreateEdge: (sourceId: string, targetId: string, condition?: "yes" | "no") => void;
  initialScreens?: Screen[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null);

  // Zoom / pan state stored as viewBox
  const [vb, setVb] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ mx: number; my: number; vbx: number; vby: number } | null>(null);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 opacity-40">
        <GitBranch size={40} style={{ color: "#6366f1" }} />
        <span style={{ color: "#6b7280", fontSize: 13 }}>Aggiungi nodi per vedere l'anteprima</span>
      </div>
    );
  }

  // Compute layout, then overlay saved positions from initialScreens
  const layoutScreens = lfbLayout(nodes, edges);
  const existingPos = new Map<string, { x: number; y: number }>();
  if (initialScreens) {
    for (const s of initialScreens) {
      existingPos.set(s.id, { x: s.x, y: s.y });
    }
  }
  const screens = layoutScreens.map((s) => {
    const saved = existingPos.get(s.id);
    if (saved) return { ...s, x: saved.x, y: saved.y };
    return s;
  });

  if (screens.length === 0) return null;

  const xs = screens.map((s) => s.x);
  const ys = screens.map((s) => s.y);
  const pad = 60;
  const fitMinX = Math.min(...xs) - pad;
  const fitMinY = Math.min(...ys) - pad;
  const fitMaxX = Math.max(...xs) + NODE_WIDTH + pad;
  const fitMaxY = Math.max(...ys) + NODE_HEIGHT + pad;
  const fitW = fitMaxX - fitMinX;
  const fitH = fitMaxY - fitMinY;

  // Use the stored viewBox or default to fit-all
  const curVb = vb || { x: fitMinX, y: fitMinY, w: fitW, h: fitH };

  /** Zoom by factor around center */
  const zoomBy = (factor: number, cx?: number, cy?: number) => {
    const c = curVb;
    const centerX = cx ?? c.x + c.w / 2;
    const centerY = cy ?? c.y + c.h / 2;
    const nw = c.w / factor;
    const nh = c.h / factor;
    setVb({
      x: centerX - nw * ((centerX - c.x) / c.w),
      y: centerY - nh * ((centerY - c.y) / c.h),
      w: nw,
      h: nh,
    });
  };

  const handleFitAll = () => setVb(null);

  /** Wheel / trackpad — pinch (ctrlKey) → zoom, two-finger drag → pan */
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const pt = clientToSVG(e.clientX, e.clientY);
        zoomBy(factor, pt.x, pt.y);
      } else {
        // Two-finger trackpad pan (FigJam-style)
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const scaleX = curVb.w / rect.width;
        const scaleY = curVb.h / rect.height;
        setVb({
          ...curVb,
          x: curVb.x + e.deltaX * scaleX,
          y: curVb.y + e.deltaY * scaleY,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [curVb]
  );

  // Attach wheel listener as non-passive so preventDefault works on trackpad
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  /** Convert clientX/Y to SVG coordinates */
  const clientToSVG = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  };

  /** Get port positions for a node */
  const getPorts = (s: Screen, node: LFBNode) => {
    const isDecision = node.kind === "decision";
    const cx = s.x + NODE_WIDTH / 2;
    if (isDecision) {
      const cy = s.y + DECISION_H / 2;
      return {
        right: { x: s.x + NODE_WIDTH, y: cy, type: "yes" as const },
        bottom: { x: cx, y: s.y + DECISION_H, type: "no" as const },
        top: { x: cx, y: s.y, type: "default" as const },
      };
    }
    return {
      bottom: { x: cx, y: s.y + NODE_HEIGHT, type: "default" as const },
      right: { x: s.x + NODE_WIDTH, y: s.y + NODE_HEIGHT / 2, type: "default" as const },
      top: { x: cx, y: s.y, type: "default" as const },
    };
  };

  const handlePortMouseDown = (
    e: React.MouseEvent,
    nodeId: string,
    nodeKind: NodeKind,
    portType: "default" | "yes" | "no",
    portX: number,
    portY: number,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setDragState({
      sourceId: nodeId,
      sourceKind: nodeKind,
      portType,
      startX: portX,
      startY: portY,
      currentX: portX,
      currentY: portY,
    });
  };

  /** Background mousedown → start pan */
  const handleBgMouseDown = (e: React.MouseEvent) => {
    if (dragState) return; // don't pan while connecting
    if (e.button !== 0 && e.button !== 1) return;
    setIsPanning(true);
    panStart.current = { mx: e.clientX, my: e.clientY, vbx: curVb.x, vby: curVb.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Pan handling
    if (isPanning && panStart.current && !dragState) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = curVb.w / rect.width;
      const scaleY = curVb.h / rect.height;
      const dx = (e.clientX - panStart.current.mx) * scaleX;
      const dy = (e.clientY - panStart.current.my) * scaleY;
      setVb({ ...curVb, x: panStart.current.vbx - dx, y: panStart.current.vby - dy });
      return;
    }

    if (!dragState) return;
    const pt = clientToSVG(e.clientX, e.clientY);
    setDragState((prev) => prev ? { ...prev, currentX: pt.x, currentY: pt.y } : null);

    // Hit test - check if hovering over a target node
    let foundTarget: string | null = null;
    for (const s of screens) {
      if (s.id === dragState.sourceId) continue;
      const node = nodes.find((n) => n.id === s.id);
      const isDecision = node?.kind === "decision";
      const h = isDecision ? DECISION_H : NODE_HEIGHT;
      if (pt.x >= s.x - 10 && pt.x <= s.x + NODE_WIDTH + 10 && pt.y >= s.y - 10 && pt.y <= s.y + h + 10) {
        foundTarget = s.id;
        break;
      }
    }
    setHoveredTarget(foundTarget);
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      panStart.current = null;
      return;
    }
    if (dragState && hoveredTarget && hoveredTarget !== dragState.sourceId) {
      const condition = dragState.sourceKind === "decision" && dragState.portType !== "default"
        ? (dragState.portType as "yes" | "no")
        : undefined;
      onCreateEdge(dragState.sourceId, hoveredTarget, condition);
    }
    setDragState(null);
    setHoveredTarget(null);
  };

  const PORT_R = 6;
  const PORT_R_HOVER = 8;

  // Zoom percentage for display
  const zoomPct = Math.round((fitW / curVb.w) * 100);

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Zoom toolbar */}
      <div
        className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-lg px-1 py-0.5"
        style={{ background: "#0d0d1acc", border: "1px solid #1f2937", backdropFilter: "blur(4px)" }}
      >
        <button
          onClick={() => zoomBy(1.3)}
          className="p-1 rounded hover:opacity-70 transition-opacity"
          style={{ color: "#818cf8" }}
          title="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
        <span style={{ color: "#6b7280", fontSize: 10, minWidth: 32, textAlign: "center" }}>
          {zoomPct}%
        </span>
        <button
          onClick={() => zoomBy(1 / 1.3)}
          className="p-1 rounded hover:opacity-70 transition-opacity"
          style={{ color: "#818cf8" }}
          title="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <div style={{ width: 1, height: 14, background: "#1f2937" }} />
        <button
          onClick={handleFitAll}
          className="p-1 rounded hover:opacity-70 transition-opacity"
          style={{ color: "#818cf8" }}
          title="Adatta alla vista"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`${curVb.x} ${curVb.y} ${curVb.w} ${curVb.h}`}
        style={{ display: "block", cursor: dragState ? "crosshair" : isPanning ? "grabbing" : "grab" }}
        onMouseDown={handleBgMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <marker id="lfb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={5} markerHeight={5} orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6366f1" />
          </marker>
          <marker id="lfb-arrow-yes" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={5} markerHeight={5} orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
          <marker id="lfb-arrow-no" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={5} markerHeight={5} orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
          <marker id="lfb-arrow-drag" viewBox="0 0 10 10" refX="9" refY="5" markerWidth={5} markerHeight={5} orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#818cf8" />
          </marker>
          {/* Glow filter for hovered target */}
          <filter id="glow-target">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#818cf8" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Existing edges */}
        {edges.map((e) => {
          const src = screens.find((s) => s.id === e.sourceId);
          const dst = screens.find((s) => s.id === e.targetId);
          if (!src || !dst) return null;
          const srcNode = nodes.find((n) => n.id === e.sourceId);
          const dstNode = nodes.find((n) => n.id === e.targetId);
          const srcDecision = srcNode?.kind === "decision";

          let sx: number, sy: number, dir: "h" | "v";
          if (srcDecision) {
            if (e.condition === "no") {
              sx = src.x + NODE_WIDTH / 2; sy = src.y + DECISION_H; dir = "v";
            } else {
              sx = src.x + NODE_WIDTH; sy = src.y + DECISION_H / 2; dir = "h";
            }
          } else {
            sx = src.x + NODE_WIDTH / 2; sy = src.y + NODE_HEIGHT; dir = "v";
          }
          const dx = dst.x + NODE_WIDTH / 2;
          const dy = dst.y;

          const off = Math.max(40, Math.abs(dy - sy) * 0.35, Math.abs(dx - sx) * 0.35);
          let cp1x = sx, cp1y = sy + off, cp2x = dx, cp2y = dy - off;
          if (dir === "h") { cp1x = sx + off; cp1y = sy; cp2x = dx; cp2y = dy - off; }

          const edgeColor = e.condition ? "#94a3b8" : FLOW_COLORS[e.flowType];
          const markerId = e.condition === "yes" ? "lfb-arrow-yes" : e.condition === "no" ? "lfb-arrow-no" : "lfb-arrow";

          const pathD = `M ${sx} ${sy} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${dx} ${dy}`;
          const midX = 0.125 * sx + 0.375 * cp1x + 0.375 * cp2x + 0.125 * dx;
          const midY = 0.125 * sy + 0.375 * cp1y + 0.375 * cp2y + 0.125 * dy;
          const condLabel = e.condition === "yes" ? "SÌ" : e.condition === "no" ? "NO" : null;

          return (
            <g key={e.id}>
              <path d={pathD} fill="none" stroke={edgeColor} strokeWidth={1.5} markerEnd={`url(#${markerId})`} strokeDasharray={e.flowType === "skip" || e.flowType === "error" ? "5,3" : undefined} />
              {condLabel && (
                <g transform={`translate(${midX}, ${midY})`}>
                  <rect x={-12} y={-9} width={24} height={18} rx={9} fill={edgeColor} />
                  <text textAnchor="middle" dy={4} fill="white" fontSize={8} fontFamily="system-ui" fontWeight="bold">{condLabel}</text>
                </g>
              )}
            </g>
          );
        })}

        {/* Drag-in-progress edge (rubber band) */}
        {dragState && (
          <line
            x1={dragState.startX}
            y1={dragState.startY}
            x2={dragState.currentX}
            y2={dragState.currentY}
            stroke="#818cf8"
            strokeWidth={2}
            strokeDasharray="6,4"
            markerEnd="url(#lfb-arrow-drag)"
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Nodes */}
        {screens.map((s) => {
          const node = nodes.find((n) => n.id === s.id);
          if (!node) return null;
          const isDecision = node.kind === "decision";
          const label = isDecision
            ? (node.question || "Condizione?").slice(0, 18)
            : (node.name || s.name).slice(0, 14);
          const isHovered = hoveredNode === s.id;
          const isDropTarget = hoveredTarget === s.id;
          const ports = getPorts(s, node);

          return (
            <g
              key={s.id}
              onMouseEnter={() => { if (!dragState) setHoveredNode(s.id); }}
              onMouseLeave={() => { if (!dragState) setHoveredNode(null); }}
              style={{ cursor: dragState ? "crosshair" : "default" }}
            >
              {/* Node shape */}
              {isDecision ? (
                <>
                  {/* Hit area for decision */}
                  <rect
                    x={s.x - 8} y={s.y - 8}
                    width={NODE_WIDTH + 16} height={DECISION_H + 16}
                    fill="transparent" stroke="none"
                  />
                  <polygon
                    points={`${s.x + NODE_WIDTH / 2},${s.y} ${s.x + NODE_WIDTH},${s.y + DECISION_H / 2} ${s.x + NODE_WIDTH / 2},${s.y + DECISION_H} ${s.x},${s.y + DECISION_H / 2}`}
                    fill="#2d1b69"
                    stroke={isDropTarget ? "#818cf8" : "#7c3aed"}
                    strokeWidth={isDropTarget ? 3 : 1.5}
                    filter={isDropTarget ? "url(#glow-target)" : undefined}
                  />
                  <text
                    x={s.x + NODE_WIDTH / 2} y={s.y + DECISION_H / 2 + 3}
                    textAnchor="middle" fill="#e9d5ff" fontSize={7} fontFamily="system-ui" fontStyle="italic"
                  >
                    {label.length > 14 ? label.slice(0, 12) + "…" : label}
                  </text>
                </>
              ) : (
                <>
                  {/* Hit area for screen */}
                  <rect
                    x={s.x - 8} y={s.y - 8}
                    width={NODE_WIDTH + 16} height={NODE_HEIGHT + 16}
                    fill="transparent" stroke="none"
                  />
                  <rect
                    x={s.x} y={s.y} width={NODE_WIDTH} height={32} rx={6}
                    fill="#1e1e2e"
                    stroke={isDropTarget ? "#818cf8" : "#4f46e5"}
                    strokeWidth={isDropTarget ? 3 : 1}
                    filter={isDropTarget ? "url(#glow-target)" : undefined}
                  />
                  <rect x={s.x + 4} y={s.y + 4} width={NODE_WIDTH - 8} height={16} rx={3} fill="#13131f" />
                  <text x={s.x + NODE_WIDTH / 2} y={s.y + 26} textAnchor="middle" fill="white" fontSize={8} fontFamily="system-ui">
                    {label}
                  </text>
                  {/* URL indicator */}
                  {node.pageUrl && (
                    <g transform={`translate(${s.x + NODE_WIDTH - 10}, ${s.y + 3})`}>
                      <circle r={4} fill="#3b82f6" opacity={0.7} />
                      <text textAnchor="middle" dy={2.5} fill="white" fontSize={5}>🔗</text>
                    </g>
                  )}
                </>
              )}

              {/* Connection ports — visible on hover or during drag */}
              {(isHovered || dragState) && !dragState?.sourceId.includes(s.id) && (
                <>
                  {/* Bottom port */}
                  <circle
                    cx={ports.bottom.x} cy={ports.bottom.y}
                    r={isHovered ? PORT_R_HOVER : PORT_R}
                    fill={isDecision ? "#94a3b8" : "#818cf8"}
                    stroke="white" strokeWidth={1.5}
                    style={{ cursor: "crosshair", transition: "r 0.15s ease" }}
                    onMouseDown={(e) => handlePortMouseDown(e, s.id, node.kind, isDecision ? "no" : "default", ports.bottom.x, ports.bottom.y)}
                  />
                  {isDecision && isHovered && (
                    <text x={ports.bottom.x} y={ports.bottom.y + 16} textAnchor="middle" fill="#94a3b8" fontSize={7} fontFamily="system-ui" fontWeight="bold">NO</text>
                  )}

                  {/* Right port */}
                  <circle
                    cx={ports.right.x} cy={ports.right.y}
                    r={isHovered ? PORT_R_HOVER : PORT_R}
                    fill={isDecision ? "#94a3b8" : "#818cf8"}
                    stroke="white" strokeWidth={1.5}
                    style={{ cursor: "crosshair", transition: "r 0.15s ease" }}
                    onMouseDown={(e) => handlePortMouseDown(e, s.id, node.kind, isDecision ? "yes" : "default", ports.right.x, ports.right.y)}
                  />
                  {isDecision && isHovered && (
                    <text x={ports.right.x + 14} y={ports.right.y + 3} textAnchor="start" fill="#94a3b8" fontSize={7} fontFamily="system-ui" fontWeight="bold">SÌ</text>
                  )}
                </>
              )}
            </g>
          );
        })}

        {/* Drag hint tooltip */}
        {dragState && !hoveredTarget && (
          <text
            x={dragState.currentX + 12}
            y={dragState.currentY - 8}
            fill="#818cf8"
            fontSize={8}
            fontFamily="system-ui"
            style={{ pointerEvents: "none" }}
          >
            Rilascia su un nodo
          </text>
        )}
        {dragState && hoveredTarget && (
          <text
            x={dragState.currentX + 12}
            y={dragState.currentY - 8}
            fill="#a5b4fc"
            fontSize={8}
            fontFamily="system-ui"
            fontWeight="bold"
            style={{ pointerEvents: "none" }}
          >
            ✓ Collega qui
          </text>
        )}
      </svg>
    </div>
  );
}

/* ─── Draggable Node Card ─────────────────────────────── */

interface DragItem {
  type: string;
  index: number;
  id: string;
}

function DraggableNodeCard({
  node,
  index,
  onChange,
  onDelete,
  onMoveNode,
}: {
  node: LFBNode;
  index: number;
  onChange: (id: string, updates: Partial<LFBNode>) => void;
  onDelete: (id: string) => void;
  onMoveNode: (fromIndex: number, toIndex: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: DND_TYPE,
    item: (): DragItem => ({ type: DND_TYPE, index, id: node.id }),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver, canDrop }, drop] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: DND_TYPE,
    canDrop: (item) => item.index !== index,
    hover: (item, monitor) => {
      if (!ref.current || item.index === index) return;
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      // Only move when cursor crosses halfway
      if (item.index < index && hoverClientY < hoverMiddleY) return;
      if (item.index > index && hoverClientY > hoverMiddleY) return;
      onMoveNode(item.index, index);
      item.index = index;
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });

  preview(drop(ref));

  const isDecision = node.kind === "decision";
  const borderColor = isDecision ? "#7c3aed" : "#3b4aff";
  const bgColor = isDecision ? "#1a0f2e" : "#0f1730";
  const badgeBg = isDecision ? "#6d28d9" : "#3730a3";
  const badgeLabel = isDecision ? "Decisione ◆" : "Schermata □";

  return (
    <div
      ref={ref}
      className="rounded-lg p-3 flex flex-col gap-2 transition-all"
      style={{
        background: bgColor,
        border: `1px solid ${isOver && canDrop ? "#818cf8" : borderColor}`,
        opacity: isDragging ? 0.4 : 1,
        transform: isOver && canDrop ? "scale(1.01)" : undefined,
        boxShadow: isOver && canDrop ? "0 0 12px rgba(129,140,248,0.3)" : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Drag handle */}
          <div
            ref={(el) => { drag(el); }}
            className="p-0.5 rounded cursor-grab active:cursor-grabbing"
            style={{ color: "#4b5563" }}
            title="Trascina per riordinare"
          >
            <GripVertical size={14} />
          </div>
          <span
            className="px-2 py-0.5 rounded text-xs"
            style={{ background: badgeBg, color: "white", fontSize: 10 }}
          >
            {badgeLabel}
          </span>
        </div>
        <button
          onClick={() => onDelete(node.id)}
          className="p-1 rounded hover:opacity-70 transition-opacity"
          style={{ color: "#6b7280" }}
          title="Elimina nodo"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {isDecision ? (
        <div>
          <label style={{ color: "#9ca3af", fontSize: 10 }}>Domanda / Condizione</label>
          <input
            type="text"
            value={node.question}
            onChange={(e) => onChange(node.id, { question: e.target.value })}
            placeholder="es. L'utente è autenticato?"
            className="w-full px-2 py-1 rounded mt-1 outline-none text-sm"
            style={{ background: "#13131f", border: "1px solid #4b2e83", color: "white" }}
          />
        </div>
      ) : (
        <div>
          <label style={{ color: "#9ca3af", fontSize: 10 }}>Nome schermata</label>
          <input
            type="text"
            value={node.name}
            onChange={(e) => onChange(node.id, { name: e.target.value })}
            placeholder="es. Login, Dashboard, Carrello…"
            className="w-full px-2 py-1 rounded mt-1 outline-none text-sm"
            style={{ background: "#13131f", border: "1px solid #2d3ba8", color: "white" }}
          />
        </div>
      )}

      {/* URL field */}
      <div>
        <label className="flex items-center gap-1" style={{ color: "#6b7280", fontSize: 10 }}>
          <LinkIcon size={9} />
          URL pagina (opzionale)
        </label>
        <input
          type="url"
          value={node.pageUrl}
          onChange={(e) => onChange(node.id, { pageUrl: e.target.value })}
          placeholder="https://example.com/page"
          className="w-full px-2 py-1 rounded mt-0.5 outline-none text-xs"
          style={{
            background: "#13131f",
            border: `1px solid ${node.pageUrl ? "#3b82f6" : "#1f2937"}`,
            color: node.pageUrl ? "#93c5fd" : "#6b7280",
          }}
        />
      </div>
    </div>
  );
}

/* ─── Edge Card ───────────────────────────────────────── */
function EdgeCard({
  edge,
  nodes,
  onChange,
  onDelete,
}: {
  edge: LFBEdge;
  nodes: LFBNode[];
  onChange: (id: string, updates: Partial<LFBEdge>) => void;
  onDelete: (id: string) => void;
}) {
  const src = nodes.find((n) => n.id === edge.sourceId);
  const dst = nodes.find((n) => n.id === edge.targetId);
  const srcIsDecision = src?.kind === "decision";
  const color = FLOW_COLORS[edge.flowType];

  const nodeLabel = (n?: LFBNode) => {
    if (!n) return "—";
    return n.kind === "decision" ? `◆ ${n.question || "Condizione"}` : `□ ${n.name || "Schermata"}`;
  };

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{ background: "#0d1117", border: `1px solid ${color}33` }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <span
            className="truncate text-xs px-1.5 py-0.5 rounded"
            style={{ background: "#1e1e2e", color: "#9ca3af", maxWidth: "42%" }}
            title={nodeLabel(src)}
          >
            {nodeLabel(src).slice(0, 16)}
          </span>
          <ArrowRight size={12} style={{ color, flexShrink: 0 }} />
          <span
            className="truncate text-xs px-1.5 py-0.5 rounded"
            style={{ background: "#1e1e2e", color: "#9ca3af", maxWidth: "42%" }}
            title={nodeLabel(dst)}
          >
            {nodeLabel(dst).slice(0, 16)}
          </span>
        </div>
        <button
          onClick={() => onDelete(edge.id)}
          className="p-1 rounded hover:opacity-70 flex-shrink-0"
          style={{ color: "#6b7280" }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Source / Target selects */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label style={{ color: "#9ca3af", fontSize: 10 }}>Da</label>
          <select
            value={edge.sourceId}
            onChange={(e) => onChange(edge.id, { sourceId: e.target.value })}
            className="w-full px-2 py-1 rounded mt-0.5 outline-none text-xs"
            style={{ background: "#1e1e2e", border: "1px solid #2d2d44", color: "white" }}
          >
            <option value="">— scegli —</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.kind === "decision" ? "◆ " : "□ "}
                {(n.kind === "decision" ? n.question : n.name) || "?"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ color: "#9ca3af", fontSize: 10 }}>A</label>
          <select
            value={edge.targetId}
            onChange={(e) => onChange(edge.id, { targetId: e.target.value })}
            className="w-full px-2 py-1 rounded mt-0.5 outline-none text-xs"
            style={{ background: "#1e1e2e", border: "1px solid #2d2d44", color: "white" }}
          >
            <option value="">— scegli —</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.kind === "decision" ? "◆ " : "□ "}
                {(n.kind === "decision" ? n.question : n.name) || "?"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Condition + Flow type */}
      <div className="grid grid-cols-2 gap-2">
        {srcIsDecision && (
          <div>
            <label style={{ color: "#9ca3af", fontSize: 10 }}>Condizione uscita</label>
            <select
              value={edge.condition || ""}
              onChange={(e) => onChange(edge.id, { condition: (e.target.value as "yes" | "no") || undefined })}
              className="w-full px-2 py-1 rounded mt-0.5 outline-none text-xs"
              style={{ background: "#1e1e2e", border: "1px solid #2d2d44", color: "white" }}
            >
              <option value="">— nessuna —</option>
              <option value="yes">SÌ</option>
              <option value="no">NO</option>
            </select>
          </div>
        )}
        <div className={srcIsDecision ? "" : "col-span-2"}>
          <label style={{ color: "#9ca3af", fontSize: 10 }}>Tipo flusso</label>
          <select
            value={edge.flowType}
            onChange={(e) => onChange(edge.id, { flowType: e.target.value as FlowType })}
            className="w-full px-2 py-1 rounded mt-0.5 outline-none text-xs"
            style={{ background: "#1e1e2e", border: "1px solid #2d2d44", color: "white" }}
          >
            {FLOW_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Trigger */}
      <div>
        <label style={{ color: "#9ca3af", fontSize: 10 }}>Etichetta / Trigger</label>
        <input
          type="text"
          value={edge.trigger}
          onChange={(e) => onChange(edge.id, { trigger: e.target.value })}
          placeholder="es. Tap CTA, Submit, Timeout…"
          className="w-full px-2 py-1 rounded mt-0.5 outline-none text-xs"
          style={{ background: "#13131f", border: "1px solid #2d2d44", color: "white" }}
        />
      </div>

      {/* Reason */}
      <div>
        <label className="flex items-center gap-1" style={{ color: "#f59e0b", fontSize: 10 }}>
          <Lightbulb size={10} />
          Motivazione / Logica UX
        </label>
        <textarea
          value={edge.reason}
          onChange={(e) => onChange(edge.id, { reason: e.target.value })}
          placeholder="Perché questo flusso esiste?"
          rows={2}
          className="w-full px-2 py-1 rounded mt-0.5 outline-none text-xs resize-none"
          style={{ background: "#13131f", border: "1px solid #2d2d44", color: "#fbbf24" }}
        />
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────── */
export function LogicFlowBuilder({ onConfirm, onClose, initialScreens, initialConnections }: LogicFlowBuilderProps) {
  const hasInitialData = !!(initialScreens && initialScreens.length > 0);
  const [activeTab, setActiveTab] = useState<"nodes" | "edges">("nodes");
  const [nodes, setNodes] = useState<LFBNode[]>(() => {
    if (initialScreens && initialScreens.length > 0) {
      return initialScreens.map((s) => ({
        id: s.id,
        kind: (s.nodeKind || "screen") as NodeKind,
        name: s.name || "",
        question: s.question || "",
        pageUrl: s.pageUrl || "",
      }));
    }
    return [{ id: uid("n"), kind: "screen" as NodeKind, name: "Home", question: "", pageUrl: "" }];
  });
  const [edges, setEdges] = useState<LFBEdge[]>(() => {
    if (initialConnections && initialConnections.length > 0) {
      return initialConnections.map((c) => ({
        id: c.id,
        sourceId: c.sourceId,
        targetId: c.destinationId,
        condition: c.condition,
        flowType: c.flowType,
        trigger: c.trigger || "",
        reason: c.reason || "",
      }));
    }
    return [];
  });

  /* ── Node actions ── */
  const addScreen = () =>
    setNodes((prev) => [...prev, { id: uid("n"), kind: "screen", name: "", question: "", pageUrl: "" }]);

  const addDecision = () =>
    setNodes((prev) => [...prev, { id: uid("d"), kind: "decision", name: "", question: "", pageUrl: "" }]);

  const updateNode = useCallback((id: string, updates: Partial<LFBNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
  }, []);

  const deleteNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.sourceId !== id && e.targetId !== id));
  }, []);

  const moveNode = useCallback((fromIndex: number, toIndex: number) => {
    setNodes((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, []);

  /* ── Edge actions ── */
  const addEdge = () =>
    setEdges((prev) => [
      ...prev,
      {
        id: uid("e"),
        sourceId: nodes[0]?.id || "",
        targetId: nodes[1]?.id || "",
        flowType: "happy",
        trigger: "Tap",
        reason: "",
      },
    ]);

  const updateEdge = useCallback((id: string, updates: Partial<LFBEdge>) => {
    setEdges((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  }, []);

  const deleteEdge = useCallback((id: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== id));
  }, []);

  /** Create edge from interactive canvas drag */
  const createEdgeFromCanvas = useCallback((sourceId: string, targetId: string, condition?: "yes" | "no") => {
    // Avoid duplicate edges
    const exists = edges.some((e) => e.sourceId === sourceId && e.targetId === targetId && e.condition === condition);
    if (exists) return;

    const srcNode = nodes.find((n) => n.id === sourceId);
    const flowType: FlowType = "happy";

    setEdges((prev) => [
      ...prev,
      {
        id: uid("e"),
        sourceId,
        targetId,
        condition,
        flowType,
        trigger: condition === "yes" ? "SÌ" : condition === "no" ? "NO" : "Navigate",
        reason: "",
      },
    ]);
    // Switch to edges tab to show the new edge
    setActiveTab("edges");
  }, [edges, nodes]);

  /* ── Generate ── */
  const handleGenerate = () => {
    if (nodes.length === 0) return;
    const layoutScreens = lfbLayout(nodes, edges);

    // Preserve manually-customised positions from the canvas.
    // initialScreens carries the positions the user had before opening the
    // builder, so any screen whose id still exists keeps its old x/y.
    const existingPos = new Map<string, { x: number; y: number }>();
    if (initialScreens) {
      for (const s of initialScreens) {
        existingPos.set(s.id, { x: s.x, y: s.y });
      }
    }

    const screens = layoutScreens.map((s) => {
      const saved = existingPos.get(s.id);
      if (saved) {
        return { ...s, x: saved.x, y: saved.y };
      }
      return s;
    });

    const connections: Connection[] = edges
      .filter((e) => e.sourceId && e.targetId && e.sourceId !== e.targetId)
      .map((e, i) => ({
        id: `lfb-conn-${i}`,
        sourceId: e.sourceId,
        destinationId: e.targetId,
        trigger: e.trigger || "→",
        flowType: e.flowType,
        condition: e.condition,
        reason: e.reason || undefined,
      }));
    onConfirm({ screens, connections });
  };

  const validEdges = edges.filter((e) => e.sourceId && e.targetId && e.sourceId !== e.targetId);
  const canGenerate = nodes.length > 0;

  return (
    <DndProvider backend={HTML5Backend}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      >
        <div
          className="flex overflow-hidden"
          style={{
            width: "min(94vw, 1060px)",
            height: "min(90vh, 760px)",
            background: "#0d0d1a",
            border: "1px solid #1f2937",
            borderRadius: 16,
            boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          }}
        >
          {/* ── Left panel ── */}
          <div
            className="flex flex-col"
            style={{ width: 380, borderRight: "1px solid #1f2937", background: "#0f0f1f" }}
          >
            {/* Header */}
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid #1f2937" }}
            >
              <div className="flex items-center gap-2">
                <GitBranch size={18} style={{ color: "#818cf8" }} />
                <div>
                  <div style={{ color: "#e2e8f0", fontSize: 15, fontFamily: "system-ui" }}>
                    Logic Flow Builder
                  </div>
                  <div style={{ color: "#6b7280", fontSize: 10 }}>
                    {hasInitialData ? "Modifica il flusso esistente" : "Schermata, decisioni, motivazioni"}
                  </div>
                </div>
                {hasInitialData && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs"
                    style={{ background: "#f59e0b20", color: "#f59e0b", border: "1px solid #f59e0b30", fontSize: 9 }}
                  >
                    Edit
                  </span>
                )}
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
              {(["nodes", "edges"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="flex-1 py-2.5 text-sm transition-colors"
                  style={{
                    color: activeTab === tab ? "#818cf8" : "#6b7280",
                    borderBottom: activeTab === tab ? "2px solid #6366f1" : "2px solid transparent",
                    background: "transparent",
                    fontFamily: "system-ui",
                    fontSize: 12,
                  }}
                >
                  {tab === "nodes"
                    ? `Nodi (${nodes.length})`
                    : `Connessioni (${edges.length})`}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {activeTab === "nodes" ? (
                <>
                  {nodes.length === 0 && (
                    <div
                      className="text-center py-8"
                      style={{ color: "#4b5563", fontSize: 12 }}
                    >
                      Nessun nodo. Aggiungi schermate o decisioni.
                    </div>
                  )}
                  {nodes.map((node, index) => (
                    <DraggableNodeCard
                      key={node.id}
                      node={node}
                      index={index}
                      onChange={updateNode}
                      onDelete={deleteNode}
                      onMoveNode={moveNode}
                    />
                  ))}
                </>
              ) : (
                <>
                  {edges.length === 0 && (
                    <div
                      className="text-center py-8 flex flex-col items-center gap-2"
                      style={{ color: "#4b5563", fontSize: 12 }}
                    >
                      <span>Nessuna connessione.</span>
                      <span style={{ color: "#818cf8", fontSize: 11 }}>
                        💡 Trascina dalle porte dei nodi nell'anteprima per creare connessioni visivamente
                      </span>
                    </div>
                  )}
                  {edges.map((edge) => (
                    <EdgeCard
                      key={edge.id}
                      edge={edge}
                      nodes={nodes}
                      onChange={updateEdge}
                      onDelete={deleteEdge}
                    />
                  ))}
                </>
              )}
            </div>

            {/* Add buttons */}
            <div
              className="p-3 flex flex-col gap-2"
              style={{ borderTop: "1px solid #1f2937" }}
            >
              {activeTab === "nodes" ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={addScreen}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs transition-opacity hover:opacity-80"
                    style={{ background: "#1e2d5a", color: "#93c5fd", border: "1px solid #3730a3" }}
                  >
                    <Monitor size={12} />
                    Schermata
                  </button>
                  <button
                    onClick={addDecision}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs transition-opacity hover:opacity-80"
                    style={{ background: "#2d1b4e", color: "#c4b5fd", border: "1px solid #6d28d9" }}
                  >
                    <Diamond size={12} />
                    Decisione ◆
                  </button>
                </div>
              ) : (
                <button
                  onClick={addEdge}
                  disabled={nodes.length < 2}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs transition-opacity hover:opacity-80 disabled:opacity-30"
                  style={{ background: "#1a2240", color: "#93c5fd", border: "1px solid #3730a3" }}
                >
                  <Plus size={12} />
                  Aggiungi connessione
                </button>
              )}

              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full py-2.5 rounded-lg text-sm transition-all hover:opacity-90 disabled:opacity-30"
                style={{
                  background: canGenerate ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#2d2d44",
                  color: "white",
                  fontFamily: "system-ui",
                }}
              >
                {hasInitialData ? "✦ Aggiorna Diagramma" : "✦ Genera Diagramma"}
              </button>
            </div>
          </div>

          {/* ── Right panel: interactive preview ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Preview header */}
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{ borderBottom: "1px solid #1f2937" }}
            >
              <div style={{ color: "#6b7280", fontSize: 11 }}>
                Anteprima · {nodes.length} nodi · {validEdges.length} connessioni
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                  style={{ background: "#1e2d5a", color: "#93c5fd", fontSize: 10 }}
                >
                  □ Schermata
                </span>
                <span
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                  style={{ background: "#2d1b4e", color: "#c4b5fd", fontSize: 10 }}
                >
                  ◆ Decisione
                </span>
                <span
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                  style={{ background: "#1e2533", color: "#cbd5e1", fontSize: 10 }}
                >
                  SÌ / NO
                </span>
              </div>
            </div>

            {/* Canvas instruction banner */}
            {nodes.length >= 2 && edges.length === 0 && (
              <div
                className="mx-4 mt-3 px-3 py-2 rounded-lg flex items-center gap-2"
                style={{ background: "#1a1a3a", border: "1px solid #2d2d5a" }}
              >
                <span style={{ fontSize: 14 }}>🔗</span>
                <span style={{ color: "#a5b4fc", fontSize: 11 }}>
                  <strong>Tip:</strong> Passa il mouse sui nodi e trascina dalle porte colorate per creare connessioni — come in FigJam!
                </span>
              </div>
            )}

            {/* SVG preview canvas */}
            <div className="flex-1 relative overflow-hidden" style={{ background: "#0a0a14" }}>
              {/* Dot grid */}
              <svg
                width="100%" height="100%"
                className="absolute inset-0"
                style={{ pointerEvents: "none" }}
              >
                <defs>
                  <pattern id="dotgrid-preview" width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="10" cy="10" r="0.7" fill="#1f2937" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#dotgrid-preview)" />
              </svg>
              <div className="absolute inset-0">
                <InteractivePreview
                  nodes={nodes}
                  edges={edges}
                  onCreateEdge={createEdgeFromCanvas}
                  initialScreens={initialScreens}
                />
              </div>
            </div>

            {/* Reasons summary */}
            {edges.some((e) => e.reason) && (
              <div
                className="px-5 py-3 overflow-y-auto"
                style={{ borderTop: "1px solid #1f2937", maxHeight: 160 }}
              >
                <div
                  className="flex items-center gap-1.5 mb-2"
                  style={{ color: "#f59e0b", fontSize: 11 }}
                >
                  <Lightbulb size={12} />
                  Motivazioni UX
                </div>
                <div className="flex flex-col gap-1.5">
                  {edges.filter((e) => e.reason).map((e) => {
                    const src = nodes.find((n) => n.id === e.sourceId);
                    const dst = nodes.find((n) => n.id === e.targetId);
                    const srcName = src
                      ? src.kind === "decision" ? src.question : src.name
                      : "?";
                    const dstName = dst
                      ? dst.kind === "decision" ? dst.question : dst.name
                      : "?";
                    return (
                      <div
                        key={e.id}
                        className="flex items-start gap-2 rounded-md px-3 py-2"
                        style={{ background: "#1a1500", border: "1px solid #2d2000" }}
                      >
                        <span style={{ color: "#6b7280", fontSize: 10, whiteSpace: "nowrap" }}>
                          {(srcName || "?").slice(0, 10)} → {(dstName || "?").slice(0, 10)}
                        </span>
                        <span style={{ color: "#fbbf24", fontSize: 10, flex: 1 }}>
                          {e.reason}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DndProvider>
  );
}