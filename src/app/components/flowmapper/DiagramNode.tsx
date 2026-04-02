import React from "react";
import type { Screen, Connection } from "./types";
import { NODE_WIDTH, NODE_HEIGHT, DECISION_H } from "./types";
import { useTheme } from "./ThemeContext";

const PADDING = 4;
const THUMB_X = PADDING;
const THUMB_Y = PADDING;
const THUMB_W = NODE_WIDTH - PADDING * 2;
const THUMB_H = NODE_HEIGHT - 38;
const CORNER_R = 10;
const INNER_R = 7;

// Diamond half-dimensions
const DW = NODE_WIDTH / 2;   // half-width
const DH = DECISION_H / 2;  // half-height

// How far past the diamond tip the labels extend (connection starts after)
const LABEL_OFFSET_RIGHT = 26;
const LABEL_OFFSET_BOTTOM = 22;

/** Port type identifier */
export type PortId = "output" | "output-no" | "output-right" | "output-bottom" | "input" | "input-left" | "input-top";

/** Returns the local (node-relative) position of a port */
export function getPortPosition(
  nodeKind: "screen" | "decision" | undefined,
  portId: PortId
): { x: number; y: number } {
  const kind = nodeKind || "screen";
  if (kind === "decision") {
    switch (portId) {
      case "input":
      case "input-left":   return { x: 0, y: DH };                   // left tip
      case "input-top":    return { x: DW, y: 0 };                   // top tip
      case "output":
      case "output-right": return { x: NODE_WIDTH + LABEL_OFFSET_RIGHT, y: DH };   // past "Si" label
      case "output-no":
      case "output-bottom": return { x: DW, y: DECISION_H + LABEL_OFFSET_BOTTOM }; // past "No" label
    }
  }
  // screen
  switch (portId) {
    case "input":
    case "input-left":   return { x: 0, y: NODE_HEIGHT / 2 };
    case "input-top":    return { x: NODE_WIDTH / 2, y: 0 };
    case "output":
    case "output-right": return { x: NODE_WIDTH, y: NODE_HEIGHT / 2 };
    case "output-bottom": return { x: NODE_WIDTH / 2, y: NODE_HEIGHT };
    default:              return { x: NODE_WIDTH, y: NODE_HEIGHT / 2 };
  }
}

/**
 * Given source and dest screens, pick the best exit side for source
 * and the best entry side for dest based on relative geometry.
 * Returns { sourcePort, destPort } with local coordinates and direction.
 */
export function getBestPorts(
  source: Screen,
  dest: Screen,
  condition?: "yes" | "no"
): {
  sx: number; sy: number; sDir: "right" | "left" | "up" | "down";
  dx: number; dy: number; dDir: "right" | "left" | "up" | "down";
} {
  const sKind = source.nodeKind || "screen";
  const dKind = dest.nodeKind || "screen";
  const sW = NODE_WIDTH;
  const sH = sKind === "decision" ? DECISION_H : NODE_HEIGHT;
  const dW = NODE_WIDTH;
  const dH = dKind === "decision" ? DECISION_H : NODE_HEIGHT;

  // Centers
  const sCx = source.x + sW / 2;
  const sCy = source.y + sH / 2;
  const dCx = dest.x + dW / 2;
  const dCy = dest.y + dH / 2;

  const deltaX = dCx - sCx;
  const deltaY = dCy - sCy;

  // -- Source exit --
  let sx: number, sy: number, sDir: "right" | "left" | "up" | "down";

  if (sKind === "decision") {
    // Decision nodes have fixed exits: YES=right, NO=bottom
    if (condition === "no") {
      const p = getPortPosition("decision", "output-no");
      sx = source.x + p.x; sy = source.y + p.y; sDir = "down";
    } else {
      const p = getPortPosition("decision", "output");
      sx = source.x + p.x; sy = source.y + p.y; sDir = "right";
    }
  } else {
    // Screen: pick best exit based on dominant direction
    const absDX = Math.abs(deltaX);
    const absDY = Math.abs(deltaY);
    // Bias toward horizontal if roughly equal (1.2x threshold)
    if (absDX >= absDY * 0.7) {
      if (deltaX >= 0) {
        // Target is to the right - exit right
        const p = getPortPosition("screen", "output-right");
        sx = source.x + p.x; sy = source.y + p.y; sDir = "right";
      } else {
        // Target is to the left - exit left
        sx = source.x; sy = source.y + NODE_HEIGHT / 2; sDir = "left";
      }
    } else {
      if (deltaY >= 0) {
        // Target is below - exit bottom
        const p = getPortPosition("screen", "output-bottom");
        sx = source.x + p.x; sy = source.y + p.y; sDir = "down";
      } else {
        // Target is above - exit top
        sx = source.x + NODE_WIDTH / 2; sy = source.y; sDir = "up";
      }
    }
  }

  // -- Dest entry --
  let dx: number, dy: number, dDir: "right" | "left" | "up" | "down";

  // Pick entry side opposite to where source is relative to dest
  const entryDeltaX = sx - (dest.x + dW / 2);
  const entryDeltaY = sy - (dest.y + dH / 2);
  const absEDX = Math.abs(entryDeltaX);
  const absEDY = Math.abs(entryDeltaY);

  if (absEDX >= absEDY * 0.7) {
    if (entryDeltaX <= 0) {
      // Source is to the left - enter from left
      const p = getPortPosition(dKind === "decision" ? "decision" : "screen", "input-left");
      dx = dest.x + p.x; dy = dest.y + p.y; dDir = "left";
    } else {
      // Source is to the right - enter from right
      dx = dest.x + dW; dy = dest.y + dH / 2; dDir = "right";
    }
  } else {
    if (entryDeltaY <= 0) {
      // Source is above - enter from top
      const p = getPortPosition(dKind === "decision" ? "decision" : "screen", "input-top");
      dx = dest.x + p.x; dy = dest.y + p.y; dDir = "up";
    } else {
      // Source is below - enter from bottom
      dx = dest.x + dW / 2; dy = dest.y + dH; dDir = "down";
    }
  }

  return { sx, sy, sDir, dx, dy, dDir };
}

interface DiagramNodeProps {
  screen: Screen;
  isSelected: boolean;
  connections: Connection[];
  onClick: (id: string, e: React.MouseEvent) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
  onOpenPreview: (id: string) => void;
  /** Start drawing a connection from this node's port */
  onPortDragStart?: (nodeId: string, portId: PortId, e: React.MouseEvent) => void;
  /** True when a connection is being drawn -- shows drop-target highlight */
  isConnectTarget?: boolean;
  /** True when this node is the source of the connection being drawn */
  isConnectSource?: boolean;
  /** When true, output port dots are hidden (e.g. an edge is selected for reconnect) */
  hideOutputPorts?: boolean;
  /** During reconnect drag: true when this node is a valid drop target */
  isReconnectTarget?: boolean;
  /** During reconnect drag: detected condition when hovering a decision node */
  reconnectCondition?: "yes" | "no";
}

/* --- Decision Diamond Node ----------------------------------- */
function DecisionDiamond({
  screen,
  isSelected,
  connections,
}: {
  screen: Screen;
  isSelected: boolean;
  connections: Connection[];
}) {
  const { theme: t } = useTheme();
  const shadowId = `shadow-d-${screen.id.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const cx = DW;   // center x in local coords
  const cy = DH;   // center y

  const fillColor = isSelected ? t.decisionFillSelected : t.decisionFill;
  const strokeColor = isSelected ? t.decisionStrokeSelected : t.decisionStroke;

  const questionText = screen.question || screen.name || "Condizione?";
  // Inner usable area of the diamond (inscribed rectangle) -- generous for word-wrap
  const innerW = NODE_WIDTH * 0.72;
  const innerH = DECISION_H * 0.68;

  return (
    <g>
      <defs>
        <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor={t.decisionShadowColor} floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Diamond shape */}
      <polygon
        points={`${cx},0 ${NODE_WIDTH},${cy} ${cx},${DECISION_H} 0,${cy}`}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={isSelected ? 2 : 1.5}
        filter={`url(#${shadowId})`}
      />

      {/* Question text via foreignObject for word-wrap */}
      <foreignObject
        x={(NODE_WIDTH - innerW) / 2}
        y={(DECISION_H - innerH) / 2}
        width={innerW}
        height={innerH}
        style={{ overflow: "visible", pointerEvents: "none" }}
      >
        <div
          style={{
            width: innerW,
            height: innerH,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            color: t.decisionText,
            fontSize: questionText.length > 30 ? 7 : 8,
            fontFamily: "system-ui, sans-serif",
            fontStyle: "italic",
            lineHeight: 1.2,
            wordBreak: "break-word",
            overflowWrap: "break-word",
            whiteSpace: "normal",
            overflow: "visible",
          }}
          // @ts-ignore xmlns required for foreignObject HTML
          xmlns="http://www.w3.org/1999/xhtml"
        >
          {questionText}
        </div>
      </foreignObject>

      {/* -- Right arm: stem line + "Si" label -- */}
      <line
        x1={NODE_WIDTH} y1={cy}
        x2={NODE_WIDTH + LABEL_OFFSET_RIGHT} y2={cy}
        stroke="#22c55e" strokeWidth={1.5} opacity={0.5}
        style={{ pointerEvents: "none" }}
      />
      <text
        x={NODE_WIDTH + LABEL_OFFSET_RIGHT / 2}
        y={cy - 5}
        textAnchor="middle"
        fill="#22c55e"
        fontSize={10}
        fontFamily="system-ui, sans-serif"
        fontWeight="bold"
        style={{ pointerEvents: "none" }}
      >
        Si
      </text>

      {/* -- Bottom arm: stem line + "No" label -- */}
      <line
        x1={cx} y1={DECISION_H}
        x2={cx} y2={DECISION_H + LABEL_OFFSET_BOTTOM}
        stroke="#ef4444" strokeWidth={1.5} opacity={0.5}
        style={{ pointerEvents: "none" }}
      />
      <text
        x={cx + 8}
        y={DECISION_H + LABEL_OFFSET_BOTTOM / 2 + 4}
        textAnchor="start"
        fill="#ef4444"
        fontSize={10}
        fontFamily="system-ui, sans-serif"
        fontWeight="bold"
        style={{ pointerEvents: "none" }}
      >
        No
      </text>

      {/* Connection count */}
      <text
        x={cx}
        y={DECISION_H + LABEL_OFFSET_BOTTOM + 14}
        textAnchor="middle"
        fill={t.textMuted}
        fontSize={7}
        fontFamily="system-ui, sans-serif"
      >
        {`in: ${connections.filter(c => c.destinationId === screen.id).length} · out: ${connections.filter(c => c.sourceId === screen.id).length}`}
      </text>
    </g>
  );
}

/* --- Screen Rectangle Node ----------------------------------- */
function ScreenRect({
  screen,
  isSelected,
  connections,
}: {
  screen: Screen;
  isSelected: boolean;
  connections: Connection[];
}) {
  const { theme: t } = useTheme();
  const inCount = connections.filter((c) => c.destinationId === screen.id).length;
  const outCount = connections.filter((c) => c.sourceId === screen.id).length;
  const clipId = `clip-thumb-${screen.id.replace(/[^a-zA-Z0-9]/g, "_")}`;

  return (
    <g>
      <defs>
        <filter id={`shadow-${screen.id}`} x="-20%" y="-10%" width="140%" height="120%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor={t.nodeShadow} floodOpacity={t.mode === "dark" ? "0.6" : "0.3"} />
        </filter>
        <clipPath id={clipId}>
          <rect x={THUMB_X} y={THUMB_Y} width={THUMB_W} height={THUMB_H} rx={INNER_R} />
        </clipPath>
      </defs>

      {/* Phone frame */}
      <rect
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={CORNER_R}
        ry={CORNER_R}
        fill={isSelected ? t.nodeFillSelected : t.nodeFill}
        stroke={isSelected ? t.nodeStrokeSelected : t.nodeStroke}
        strokeWidth={isSelected ? 2 : 1}
        filter={`url(#shadow-${screen.id})`}
      />

      {/* Thumbnail area */}
      {screen.thumbnailUrl ? (
        <image
          href={screen.thumbnailUrl}
          x={THUMB_X} y={THUMB_Y}
          width={THUMB_W} height={THUMB_H}
          preserveAspectRatio="xMidYMin slice"
          clipPath={`url(#${clipId})`}
        />
      ) : screen.pageUrl ? (
        <g>
          <rect x={THUMB_X} y={THUMB_Y} width={THUMB_W} height={THUMB_H} rx={INNER_R} fill={t.nodeThumbBgAlt} />
          <rect x={THUMB_X + 3} y={THUMB_Y + 3} width={THUMB_W - 6} height={10} rx={3} fill={t.nodeFill} />
          <circle cx={THUMB_X + 9} cy={THUMB_Y + 8} r={1.5} fill="#ef4444" opacity={0.6} />
          <circle cx={THUMB_X + 15} cy={THUMB_Y + 8} r={1.5} fill="#f59e0b" opacity={0.6} />
          <circle cx={THUMB_X + 21} cy={THUMB_Y + 8} r={1.5} fill="#22c55e" opacity={0.6} />
          <rect x={THUMB_X + 27} y={THUMB_Y + 5} width={THUMB_W - 34} height={6} rx={2} fill={t.nodeThumbBg} />
          <rect x={10} y={22} width={55} height={5} rx={2} fill={t.accent} opacity={0.5} />
          <rect x={10} y={33} width={62} height={3} rx={1.5} fill={t.nodeSkeletonFill} />
          <rect x={10} y={40} width={48} height={3} rx={1.5} fill={t.nodeSkeletonFill} />
          <rect x={10} y={47} width={58} height={3} rx={1.5} fill={t.nodeSkeletonFill} />
          <rect x={10} y={56} width={28} height={22} rx={3} fill={t.nodeFill} />
          <rect x={42} y={56} width={28} height={22} rx={3} fill={t.nodeFill} />
          <rect x={10} y={84} width={28} height={22} rx={3} fill={t.nodeFill} />
          <rect x={42} y={84} width={28} height={22} rx={3} fill={t.nodeFill} />
          <rect x={10} y={114} width={62} height={10} rx={5} fill={t.accent} opacity={0.3} />
          <text x={NODE_WIDTH / 2} y={THUMB_H - 4} textAnchor="middle" fill={t.accent} fontSize={7} fontFamily="system-ui" opacity={0.7}>MAKE</text>
        </g>
      ) : (
        <g>
          <rect x={THUMB_X} y={THUMB_Y} width={THUMB_W} height={THUMB_H} rx={INNER_R} fill={t.nodeThumbBg} />
          <rect x={10} y={10} width={30} height={3} rx={1.5} fill={t.accent} opacity={0.5} />
          <rect x={60} y={10} width={20} height={3} rx={1.5} fill={t.nodeSkeletonFill} />
          <rect x={10} y={22} width={55} height={5} rx={2} fill={t.accent} opacity={0.6} />
          <rect x={10} y={35} width={62} height={3} rx={1.5} fill={t.nodeSkeletonFill} />
          <rect x={10} y={43} width={50} height={3} rx={1.5} fill={t.nodeSkeletonFill} />
          <rect x={10} y={51} width={58} height={3} rx={1.5} fill={t.nodeSkeletonFill} />
          <rect x={10} y={59} width={42} height={3} rx={1.5} fill={t.nodeSkeletonFill} />
          <rect x={10} y={72} width={62} height={24} rx={4} fill={t.nodeFill} />
          <rect x={15} y={78} width={35} height={3} rx={1.5} fill={t.nodeSkeletonFill} />
          <rect x={15} y={85} width={50} height={3} rx={1.5} fill={t.nodeSkeletonFill} />
          <rect x={10} y={106} width={62} height={12} rx={6} fill={t.accent} opacity={0.3} />
          <rect x={22} y={110} width={38} height={4} rx={2} fill={t.accentLight} opacity={0.5} />
        </g>
      )}

      {/* Screen name */}
      <foreignObject
        x={-10}
        y={NODE_HEIGHT - 26}
        width={NODE_WIDTH + 20}
        height={36}
        style={{ overflow: "visible", pointerEvents: "none" }}
      >
        <div
          style={{
            width: NODE_WIDTH + 20,
            textAlign: "center",
            color: t.nodeNameColor,
            fontSize: 10,
            fontFamily: "system-ui, sans-serif",
            lineHeight: 1.25,
            wordBreak: "break-word",
            overflowWrap: "break-word",
            whiteSpace: "normal",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as any,
            overflow: "hidden",
          }}
          // @ts-ignore xmlns required for foreignObject HTML
          xmlns="http://www.w3.org/1999/xhtml"
        >
          {screen.name}
        </div>
      </foreignObject>

      {/* Connection counts */}
      <text
        x={NODE_WIDTH / 2} y={NODE_HEIGHT + 14}
        textAnchor="middle" fill={t.textMuted}
        fontSize={8} fontFamily="system-ui, sans-serif"
      >
        {`in: ${inCount} · out: ${outCount}`}
      </text>
    </g>
  );
}

/* --- Main export --------------------------------------------- */
export function DiagramNode({
  screen,
  isSelected,
  connections,
  onClick,
  onDragStart,
  onOpenPreview,
  onPortDragStart,
  isConnectTarget,
  isConnectSource,
  hideOutputPorts,
  isReconnectTarget,
  reconnectCondition,
}: DiagramNodeProps) {
  const { theme: t } = useTheme();
  const isDecision = screen.nodeKind === "decision";
  const nodeH = isDecision ? DECISION_H : NODE_HEIGHT;

  // Port definitions for this node type -- output on right AND bottom for screens
  const outputPorts: { id: PortId; pos: { x: number; y: number } }[] = isDecision
    ? [
        { id: "output", pos: getPortPosition("decision", "output") },       // SI = right
        { id: "output-no", pos: getPortPosition("decision", "output-no") }, // NO = bottom
      ]
    : [
        { id: "output-right", pos: getPortPosition("screen", "output-right") },   // right
        { id: "output-bottom", pos: getPortPosition("screen", "output-bottom") }, // bottom
      ];

  // Input port positions -- show both left and top when target
  const inputPorts: { pos: { x: number; y: number } }[] = isDecision
    ? [
        { pos: getPortPosition("decision", "input-left") },
        { pos: getPortPosition("decision", "input-top") },
      ]
    : [
        { pos: getPortPosition("screen", "input-left") },
        { pos: getPortPosition("screen", "input-top") },
      ];

  const PORT_R = 5;
  const PORT_HIT_R = 10; // larger invisible hit area

  return (
    <g
      transform={`translate(${screen.x}, ${screen.y})`}
      onMouseDown={(e) => {
        e.stopPropagation();
        onDragStart(screen.id, e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(screen.id, e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenPreview(screen.id);
      }}
      style={{ cursor: "grab" }}
      className="diagram-node-group"
    >
      {/* Connect-target highlight glow */}
      {isConnectTarget && (
        isDecision ? (
          <polygon
            points={`${DW},${-4} ${NODE_WIDTH + 4},${DH} ${DW},${DECISION_H + 4} ${-4},${DH}`}
            fill="none"
            stroke="#22c55e"
            strokeWidth={2.5}
            strokeDasharray="6,3"
            opacity={0.7}
            style={{ pointerEvents: "none" }}
          />
        ) : (
          <rect
            x={-3} y={-3}
            width={NODE_WIDTH + 6} height={NODE_HEIGHT + 6}
            rx={CORNER_R + 2}
            fill="none"
            stroke="#22c55e"
            strokeWidth={2.5}
            strokeDasharray="6,3"
            opacity={0.7}
            style={{ pointerEvents: "none" }}
          />
        )
      )}

      {/* Reconnect-target highlight glow (amber, pulsing) */}
      {isReconnectTarget && (
        isDecision ? (
          <g style={{ pointerEvents: "none" }}>
            <polygon
              points={`${DW},${-5} ${NODE_WIDTH + 5},${DH} ${DW},${DECISION_H + 5} ${-5},${DH}`}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2.5}
              strokeDasharray="6,3"
              opacity={0.85}
            >
              <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="0.8s" repeatCount="indefinite" />
            </polygon>
            {/* Condition indicator on the active arm */}
            {reconnectCondition === "yes" && (
              <g>
                <circle cx={NODE_WIDTH + LABEL_OFFSET_RIGHT} cy={DH} r={8} fill="#22c55e" opacity={0.9} />
                <text x={NODE_WIDTH + LABEL_OFFSET_RIGHT} y={DH + 3.5} textAnchor="middle" fill="#fff" fontSize={8} fontFamily="system-ui" fontWeight="bold" style={{ pointerEvents: "none" }}>✓</text>
              </g>
            )}
            {reconnectCondition === "no" && (
              <g>
                <circle cx={DW} cy={DECISION_H + LABEL_OFFSET_BOTTOM} r={8} fill="#ef4444" opacity={0.9} />
                <text x={DW} y={DECISION_H + LABEL_OFFSET_BOTTOM + 3.5} textAnchor="middle" fill="#fff" fontSize={8} fontFamily="system-ui" fontWeight="bold" style={{ pointerEvents: "none" }}>✗</text>
              </g>
            )}
          </g>
        ) : (
          <rect
            x={-4} y={-4}
            width={NODE_WIDTH + 8} height={NODE_HEIGHT + 8}
            rx={CORNER_R + 3}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={2.5}
            strokeDasharray="6,3"
            opacity={0.85}
            style={{ pointerEvents: "none" }}
          >
            <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="0.8s" repeatCount="indefinite" />
          </rect>
        )
      )}

      {/* The actual node shape */}
      {isDecision ? (
        <DecisionDiamond screen={screen} isSelected={isSelected} connections={connections} />
      ) : (
        <ScreenRect screen={screen} isSelected={isSelected} connections={connections} />
      )}

      {/* Output ports -- visible on hover via CSS, always visible when this is the source */}
      {!hideOutputPorts && outputPorts.map((port) => (
        <g key={port.id} className={isConnectSource ? "port-visible" : "port-on-hover"}>
          {/* Invisible larger hit area */}
          <circle
            cx={port.pos.x}
            cy={port.pos.y}
            r={PORT_HIT_R}
            fill="transparent"
            style={{ cursor: "crosshair" }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onPortDragStart?.(screen.id, port.id, e);
            }}
            onClick={(e) => e.stopPropagation()}
          />
          {/* Visible port circle */}
          <circle
            cx={port.pos.x}
            cy={port.pos.y}
            r={PORT_R}
            fill={t.portFill}
            stroke={t.portStroke}
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
          {/* Inner dot */}
          <circle
            cx={port.pos.x}
            cy={port.pos.y}
            r={2}
            fill={t.portDot}
            style={{ pointerEvents: "none" }}
          />
        </g>
      ))}

      {/* Input ports -- visible when a connection is being drawn (as drop target) */}
      {isConnectTarget && inputPorts.map((port, i) => (
        <g key={`input-${i}`}>
          <circle
            cx={port.pos.x}
            cy={port.pos.y}
            r={PORT_R + 1}
            fill={t.inputPortFill}
            stroke={t.inputPortStroke}
            strokeWidth={2}
            style={{ pointerEvents: "none" }}
          />
          <circle
            cx={port.pos.x}
            cy={port.pos.y}
            r={2.5}
            fill="#22c55e"
            style={{ pointerEvents: "none" }}
          />
        </g>
      ))}
    </g>
  );
}