export type FlowType = "happy" | "secondary" | "skip" | "error" | "variant";

/** Node kind: rectangular screen or diamond decision point */
export type NodeKind = "screen" | "decision";

export interface Screen {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  thumbnailUrl?: string;
  figmaFrameId: string;
  /** For Figma Make screens: the live page URL to embed in iframe */
  pageUrl?: string;
  /** "screen" (default) or "decision" diamond node */
  nodeKind?: NodeKind;
  /** For decision nodes: the condition question shown inside the diamond */
  question?: string;
}

export interface Connection {
  id: string;
  sourceId: string;
  destinationId: string;
  trigger: string;
  flowType: FlowType;
  /** For edges exiting a decision node */
  condition?: "yes" | "no";
  /** Business/UX rationale for this transition */
  reason?: string;
  /** Label position along the edge curve, 0 = source end, 1 = dest end (default 0.5) */
  labelT?: number;
}

export interface DiagramData {
  screens: Screen[];
  connections: Connection[];
}

export interface SelectedItem {
  type: "node" | "edge";
  id: string;
}

export const FLOW_COLORS: Record<FlowType, string> = {
  happy: "#22c55e",
  secondary: "#3b82f6",
  skip: "#9ca3af",
  error: "#ef4444",
  variant: "#f59e0b",
};

export const FLOW_LABELS: Record<FlowType, string> = {
  happy: "Happy Path",
  secondary: "Secondary Flow",
  skip: "Skip / Conditional",
  error: "Error Flow",
  variant: "Variant",
};

export const NODE_WIDTH = 90;
export const NODE_HEIGHT = 175;
export const H_SPACING = 300;
export const V_SPACING = 380;

/** Bounding box for decision (diamond) nodes — same width, shorter height */
export const DECISION_H = 72;

/**
 * A manually-defined flow: a named sequence of route paths.
 * The first flow defined is the happy path; subsequent ones are secondary/variant.
 */
export interface ManualFlow {
  name: string;
  routes: string[];        // ordered list of route paths, e.g. ["/", "/login", "/dashboard"]
  flowType: FlowType;
}

/**
 * Result from the MakePageScanner: routes + optional flow definitions
 */
export interface ScannerResult {
  routes: string[];
  flows: ManualFlow[];
  /** The base URL the user entered/confirmed inside the scanner */
  baseUrl: string;
}

/** Section — a named grouping rectangle (like FigJam sections) */
export interface Section {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Section accent color (hex) */
  color: string;
}

/** Pre-defined section colors matching FigJam palette */
export const SECTION_COLORS = [
  "#6366f1", // indigo (default)
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6b7280", // gray
];

export const DEFAULT_SECTION_COLOR = SECTION_COLORS[0];
export const MIN_SECTION_W = 160;
export const MIN_SECTION_H = 120;