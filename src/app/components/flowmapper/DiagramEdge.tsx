import React, { useRef, useCallback, useState } from "react";
import type { Screen, Connection } from "./types";
import { FLOW_COLORS } from "./types";
import { getBestPorts } from "./DiagramNode";
import { useTheme } from "./ThemeContext";

interface DiagramEdgeProps {
  connection: Connection;
  screens: Screen[];
  isSelected: boolean;
  showReasons: boolean;
  onClick: (id: string) => void;
  onDoubleClickLabel: (id: string, screenX: number, screenY: number) => void;
  onLabelTChange?: (id: string, t: number) => void;
  /** Called when the user starts dragging an endpoint to reconnect */
  onEndpointDragStart?: (connectionId: string, end: "source" | "dest", e: React.MouseEvent) => void;
  /** True when this edge is being reconnected (hide the moving endpoint) */
  isReconnecting?: "source" | "dest" | null;
  /** Current mouse position in diagram coords while reconnecting — the edge follows the cursor */
  reconnectMousePos?: { x: number; y: number } | null;
}

type Dir = "right" | "left" | "up" | "down";

/** Build a cubic bezier path with control points that follow exit/entry directions */
function buildSmartPath(
  sx: number, sy: number, sDir: Dir,
  dx: number, dy: number, dDir: Dir,
): string {
  const dist = Math.hypot(dx - sx, dy - sy);
  const offset = Math.max(40, dist * 0.35);

  let cp1x = sx, cp1y = sy;
  switch (sDir) {
    case "right": cp1x = sx + offset; break;
    case "left":  cp1x = sx - offset; break;
    case "down":  cp1y = sy + offset; break;
    case "up":    cp1y = sy - offset; break;
  }

  let cp2x = dx, cp2y = dy;
  switch (dDir) {
    case "left":  cp2x = dx - offset; break;
    case "right": cp2x = dx + offset; break;
    case "up":    cp2y = dy - offset; break;
    case "down":  cp2y = dy + offset; break;
  }

  return `M ${sx} ${sy} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${dx} ${dy}`;
}

/** Evaluate cubic bezier at parameter t */
function bezierAt(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/** Find the t value on a cubic bezier closest to point (mx, my) */
function nearestT(
  mx: number, my: number,
  p0x: number, p0y: number,
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  p3x: number, p3y: number,
): number {
  const SAMPLES = 200;
  let bestT = 0.5;
  let bestDist = Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const x = bezierAt(t, p0x, cp1x, cp2x, p3x);
    const y = bezierAt(t, p0y, cp1y, cp2y, p3y);
    const d = (x - mx) ** 2 + (y - my) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }
  // Clamp so labels don't sit on top of nodes
  return Math.max(0.06, Math.min(0.94, bestT));
}

export function DiagramEdge({
  connection,
  screens,
  isSelected,
  showReasons,
  onClick,
  onDoubleClickLabel,
  onLabelTChange,
  onEndpointDragStart,
  isReconnecting,
  reconnectMousePos,
}: DiagramEdgeProps) {
  const { theme: th } = useTheme();
  const source = screens.find((s) => s.id === connection.sourceId);
  const dest = screens.find((s) => s.id === connection.destinationId);
  if (!source || !dest) return null;

  const ports = getBestPorts(source, dest, connection.condition);

  // When reconnecting, override the moving endpoint with the cursor position
  const isMovingSource = isReconnecting === "source" && reconnectMousePos;
  const isMovingDest = isReconnecting === "dest" && reconnectMousePos;

  const finalSx = isMovingSource ? reconnectMousePos.x : ports.sx;
  const finalSy = isMovingSource ? reconnectMousePos.y : ports.sy;
  const finalSDir = isMovingSource ? "right" as Dir : ports.sDir;
  const finalDx = isMovingDest ? reconnectMousePos.x : ports.dx;
  const finalDy = isMovingDest ? reconnectMousePos.y : ports.dy;
  const finalDDir = isMovingDest ? "left" as Dir : ports.dDir;

  const pathD = buildSmartPath(
    finalSx, finalSy, finalSDir,
    finalDx, finalDy, finalDDir,
  );

  // Compute bezier control points (same logic as buildSmartPath)
  const dist = Math.hypot(finalDx - finalSx, finalDy - finalSy);
  const offset = Math.max(40, dist * 0.35);

  let cp1x = finalSx, cp1y = finalSy;
  switch (finalSDir) {
    case "right": cp1x = finalSx + offset; break;
    case "left":  cp1x = finalSx - offset; break;
    case "down":  cp1y = finalSy + offset; break;
    case "up":    cp1y = finalSy - offset; break;
  }
  let cp2x = finalDx, cp2y = finalDy;
  switch (finalDDir) {
    case "left":  cp2x = finalDx - offset; break;
    case "right": cp2x = finalDx + offset; break;
    case "up":    cp2y = finalDy - offset; break;
    case "down":  cp2y = finalDy + offset; break;
  }

  // ── Label position along the curve ──────────────────────────
  const t = connection.labelT ?? 0.5;
  const labelX = bezierAt(t, finalSx, cp1x, cp2x, finalDx);
  const labelY = bezierAt(t, finalSy, cp1y, cp2y, finalDy);

  // ── Drag-along-curve logic ──────────────────────────────────
  const labelGroupRef = useRef<SVGGElement>(null);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleLabelPointerDown = useCallback((e: React.PointerEvent) => {
    if (!onLabelTChange) return;
    e.stopPropagation();
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    // Capture pointer on the label group element itself
    labelGroupRef.current?.setPointerCapture(e.pointerId);
  }, [onLabelTChange]);

  const handleLabelPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !onLabelTChange) return;
    e.stopPropagation();
    e.preventDefault();

    // Convert screen coords → SVG diagram space via the parent <g> CTM
    const edgeG = labelGroupRef.current?.parentElement;
    if (!edgeG) return;
    const ctm = (edgeG as SVGGraphicsElement).getScreenCTM?.()?.inverse();
    if (!ctm) return;
    const svgEl = labelGroupRef.current?.ownerSVGElement;
    if (!svgEl) return;
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(ctm);

    const newT = nearestT(
      svgPt.x, svgPt.y,
      finalSx, finalSy, cp1x, cp1y, cp2x, cp2y, finalDx, finalDy,
    );
    onLabelTChange(connection.id, newT);
  }, [onLabelTChange, connection.id, finalSx, finalSy, cp1x, cp1y, cp2x, cp2y, finalDx, finalDy]);

  const handleLabelPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    labelGroupRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  // Use the original color regardless of selection state
  const color = FLOW_COLORS[connection.flowType];
  const markerId = `arrow-${connection.id.replace(/[^a-zA-Z0-9]/g, "_")}${isSelected ? "-sel" : ""}`;
  const isDashed = connection.flowType === "skip" || connection.flowType === "error";

  // ── Detect dominant edge direction to adapt label proportions ──
  // When the edge runs mostly horizontally the label sits in the narrow
  // corridor between two columns → use a narrower, taller shape.
  const edgeDx = Math.abs(finalDx - finalSx);
  const edgeDy = Math.abs(finalDy - finalSy);
  const isHorizEdge = edgeDx > edgeDy * 1.2;

  // Trigger label — adaptive widths
  const triggerText = connection.trigger;
  const TRIGGER_MAX_W = isHorizEdge ? 140 : 200;
  const TRIGGER_FONT = 10;
  const TRIGGER_CHAR_W = 6;
  const TRIGGER_PAD_X = 20;
  const singleLineW = triggerText.length * TRIGGER_CHAR_W + TRIGGER_PAD_X;
  const triggerNeedsWrap = singleLineW > TRIGGER_MAX_W;
  const pillW = triggerNeedsWrap ? TRIGGER_MAX_W : Math.max(singleLineW, 50);
  const charsPerTriggerLine = Math.floor((TRIGGER_MAX_W - TRIGGER_PAD_X) / TRIGGER_CHAR_W);
  const triggerLineCount = triggerNeedsWrap ? Math.ceil(triggerText.length / charsPerTriggerLine) : 1;
  const pillH = triggerNeedsWrap ? triggerLineCount * 14 + 10 : 22;

  return (
    <g className="diagram-edge-group">
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth={6}
          markerHeight={6}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>

      {/* Invisible wide hit area */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ cursor: "pointer" }}
        onClick={(e) => { e.stopPropagation(); onClick(connection.id); }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClickLabel(connection.id, e.clientX, e.clientY); }}
      />

      {/* Visible edge */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={isSelected ? 3.5 : 1.8}
        strokeDasharray={isDashed ? "6,4" : undefined}
        markerEnd={`url(#${markerId})`}
        style={{ pointerEvents: "none" }}
      />

      {/* ── Reconnect endpoint handles (visible only when selected) ── */}
      {isSelected && onEndpointDragStart && (
        <>
          {/* Source endpoint — visual only, hit area is in App overlay */}
          {isReconnecting !== "source" && (
            <g>
              <circle
                cx={ports.sx} cy={ports.sy}
                r={5}
                fill={th.portFill}
                stroke={color}
                strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
              <circle
                cx={ports.sx} cy={ports.sy}
                r={2}
                fill={color}
                style={{ pointerEvents: "none" }}
              />
            </g>
          )}
          {/* Destination endpoint — visual only, hit area is in App overlay */}
          {isReconnecting !== "dest" && (
            <g>
              <circle
                cx={ports.dx} cy={ports.dy}
                r={5}
                fill={th.portFill}
                stroke={color}
                strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
              <circle
                cx={ports.dx} cy={ports.dy}
                r={2}
                fill={color}
                style={{ pointerEvents: "none" }}
              />
            </g>
          )}
        </>
      )}

      {/* Label group — draggable along the curve */}
      <g
        ref={labelGroupRef}
        transform={`translate(${labelX}, ${labelY})`}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
        onClick={(e) => { if (!isDragging) { e.stopPropagation(); onClick(connection.id); } }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClickLabel(connection.id, e.clientX, e.clientY); }}
        onPointerDown={handleLabelPointerDown}
        onPointerMove={handleLabelPointerMove}
        onPointerUp={handleLabelPointerUp}
      >
        {/* Drag grip indicator (visible on hover via CSS, always subtle) */}
        <g transform={`translate(${-pillW / 2 - 10}, ${-5})`} opacity={0.35}>
          <line x1={0} y1={0} x2={0} y2={10} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
          <line x1={3} y1={0} x2={3} y2={10} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        </g>

        {/* Trigger pill */}
        <g transform={`translate(${-pillW / 2}, ${-pillH / 2})`}>
          <title>{connection.trigger}</title>
          <foreignObject width={pillW} height={pillH + 4} style={{ overflow: "visible" }}>
            <div
              // @ts-ignore
              xmlns="http://www.w3.org/1999/xhtml"
              style={{
                background: th.edgeLabelBg,
                border: `1px solid ${color}`,
                borderRadius: pillH <= 22 ? 11 : 10,
                width: pillW,
                height: pillH,
                boxSizing: "border-box" as const,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2px 10px",
                userSelect: "none" as const,
              }}
            >
              <span
                style={{
                  color: th.edgeLabelText,
                  fontSize: TRIGGER_FONT,
                  fontFamily: "system-ui, sans-serif",
                  textAlign: "center" as const,
                  lineHeight: "1.3",
                  wordBreak: "break-word" as const,
                  display: "block",
                  width: "100%",
                  pointerEvents: "none",
                }}
              >
                {triggerText}
              </span>
            </div>
          </foreignObject>
        </g>

        {/* Reason display */}
        {connection.reason && (
          <>
            {showReasons ? (
              (() => {
                const boxW = isHorizEdge ? 150 : 240;
                const text = connection.reason;
                const charsPerLine = isHorizEdge ? 20 : 34;
                const lineCount = Math.ceil(text.length / charsPerLine);
                const textH = lineCount * 15;
                const boxH = textH + 28;
                const foH = boxH + 8;

                return (
                  <g transform={`translate(${-boxW / 2}, ${pillH / 2 + 6})`}>
                    <title>{connection.reason}</title>
                    <foreignObject width={boxW} height={foH} style={{ overflow: "visible" }}>
                      <div
                        // @ts-ignore
                        xmlns="http://www.w3.org/1999/xhtml"
                        style={{
                          background: th.reasonBg,
                          border: `1px solid ${th.reasonBorder}`,
                          borderRadius: 10,
                          padding: "6px 10px 8px 10px",
                          width: boxW,
                          boxSizing: "border-box" as const,
                          userSelect: "none" as const,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            marginBottom: 3,
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
                            <circle cx="8" cy="8" r="7" fill="#f59e0b" opacity={0.2} />
                            <path
                              d="M8 3C6.2 3 5 4.3 5 5.8c0 1.1.7 1.9 1.2 2.5.3.3.5.6.5.9v.3h2.6v-.3c0-.3.2-.6.5-.9C10.3 7.7 11 6.9 11 5.8 11 4.3 9.8 3 8 3zM6.8 10.5h2.4M7 11.5h2"
                              fill="none"
                              stroke="#f59e0b"
                              strokeWidth="1"
                              strokeLinecap="round"
                            />
                          </svg>
                          <span
                            style={{
                              color: th.reasonHeaderText,
                              fontSize: 9,
                              fontFamily: "system-ui, sans-serif",
                              fontWeight: 600,
                              letterSpacing: "0.03em",
                              textTransform: "uppercase" as const,
                              opacity: 0.8,
                              pointerEvents: "none",
                            }}
                          >
                            Razionale UX
                          </span>
                        </div>
                        <div
                          style={{
                            color: th.reasonText,
                            fontSize: 11,
                            fontFamily: "system-ui, sans-serif",
                            fontStyle: "italic",
                            lineHeight: "1.38",
                            wordBreak: "break-word" as const,
                            whiteSpace: "pre-wrap" as const,
                            opacity: 0.92,
                            pointerEvents: "none",
                          }}
                        >
                          {text}
                        </div>
                      </div>
                    </foreignObject>
                  </g>
                );
              })()
            ) : (
              <g transform="translate(0, 16)">
                <title>{connection.reason}</title>
                <circle r={3} fill="#f59e0b" opacity={0.6} />
                <circle r={1.5} fill="#fbbf24" opacity={0.9} />
              </g>
            )}
          </>
        )}
      </g>
    </g>
  );
}