import React, { useState, useRef, useCallback, useEffect } from "react";
import type { Screen, Connection, SelectedItem, DiagramData, ManualFlow, ScannerResult, FlowType, Section } from "./components/flowmapper/types";
import { Sidebar } from "./components/flowmapper/Sidebar";
import { DiagramNode } from "./components/flowmapper/DiagramNode";
import type { PortId } from "./components/flowmapper/DiagramNode";
import { getPortPosition, getBestPorts } from "./components/flowmapper/DiagramNode";
import { DiagramEdge } from "./components/flowmapper/DiagramEdge";
import { mockScreens, mockConnections } from "./components/flowmapper/mock-data";
import { autoLayout } from "./components/flowmapper/layout";
import { smartLayout } from "./components/flowmapper/smart-layout";
import { extractFileKey, parseFigmaFile, isFigmaMakeUrl, parseFigmaMakeSite } from "./components/flowmapper/figma-api";
import { exportSVG, exportPDF, exportProjectZip } from "./components/flowmapper/export-utils";
import { Trash2, Undo2, Redo2, Pencil, Maximize2, ChevronDown } from "lucide-react";
import type { UndoAction } from "./components/flowmapper/undo-redo";
import { pushAction, popAction, describeAction, describeUndo, describeRedo, actionIcon } from "./components/flowmapper/undo-redo";
import { NODE_WIDTH, NODE_HEIGHT, DECISION_H, FLOW_COLORS, FLOW_LABELS, DEFAULT_SECTION_COLOR, SECTION_COLORS, MIN_SECTION_W, MIN_SECTION_H } from "./components/flowmapper/types";
import { ScreenPreviewModal } from "./components/flowmapper/ScreenPreviewModal";
import { MakePageScanner } from "./components/flowmapper/MakePageScanner";
import { LoadingOverlay } from "./components/flowmapper/LoadingOverlay";
import type { LoadingAlert, LoadingProgress } from "./components/flowmapper/LoadingOverlay";
import type { ProgressCallback, AlertCallback } from "./components/flowmapper/figma-api";
import { LogicFlowBuilder } from "./components/flowmapper/LogicFlowBuilder";
import type { LogicFlowResult } from "./components/flowmapper/LogicFlowBuilder";
import { FlowValidator } from "./components/flowmapper/FlowValidator";
import { FlowTemplates } from "./components/flowmapper/FlowTemplates";
import type { TemplateResult } from "./components/flowmapper/FlowTemplates";
import { JsonImportExport } from "./components/flowmapper/JsonImportExport";
import type { JsonImportResult } from "./components/flowmapper/JsonImportExport";
import { FlowDocReader } from "./components/flowmapper/FlowDocReader";
import type { FlowDocResult } from "./components/flowmapper/FlowDocReader";
import { NodePalette } from "./components/flowmapper/NodePalette";
import type { PaletteDragInfo } from "./components/flowmapper/NodePalette";
import { AlignToolbar, computeAlignment } from "./components/flowmapper/AlignTools";
import type { AlignAction } from "./components/flowmapper/AlignTools";
import { Toolbar } from "./components/flowmapper/ToolbarMenus";
import { FlowMapperThemeProvider, useTheme } from "./components/flowmapper/ThemeContext";
import { DiagramSection, applyResize } from "./components/flowmapper/DiagramSection";
import type { HandleId } from "./components/flowmapper/DiagramSection";

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;
const GRID_SIZE = 20; // grid spacing in px

/** Snap a coordinate to the nearest grid line */
const snapToGridVal = (val: number): number =>
  Math.round(val / GRID_SIZE) * GRID_SIZE;

/** Snap all screens to the grid */
const snapAllScreens = (list: Screen[]): Screen[] =>
  list.map((s) => ({ ...s, x: snapToGridVal(s.x), y: snapToGridVal(s.y) }));

interface EditingEdge {
  connectionId: string;
  x: number;
  y: number;
  value: string;
  reasonValue: string;
  flowType: FlowType;
}

function AppInner() {
  const { theme: t } = useTheme();
  const [screens, setScreens] = useState<Screen[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loading overlay state
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);
  const [loadingAlerts, setLoadingAlerts] = useState<LoadingAlert[]>([]);
  const loadStartTime = useRef(0);

  const addAlert = useCallback((alert: Omit<LoadingAlert, "id" | "timestamp">) => {
    const newAlert: LoadingAlert = {
      ...alert,
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    };
    setLoadingAlerts((prev) => [...prev, newAlert]);
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setLoadingAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const onProgress: ProgressCallback = useCallback(
    (phase, detail, percent) => {
      const elapsed = Date.now() - loadStartTime.current;
      setLoadingProgress({ phase, detail, percent, elapsedMs: elapsed });
    },
    []
  );

  const onAlert: AlertCallback = useCallback(
    (alert) => addAlert(alert),
    [addAlert]
  );

  // Pan & zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  // Canvas interaction mode — "select" (arrow) or "hand" (pan)
  const [canvasMode, setCanvasMode] = useState<"select" | "hand">("select");
  const spaceBeforeMode = useRef<"select" | "hand">("select");

  // Node dragging state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragStartMouse = useRef({ x: 0, y: 0 });
  const dragStartNodePos = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);

  // Multi-selection state
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  const multiDragOrigins = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Marquee (rubber-band) selection state
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeStartScreen = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isMarquee = useRef(false);

  // Edge label editing state
  const [editingEdge, setEditingEdge] = useState<EditingEdge | null>(null);
  const edgeInputRef = useRef<HTMLInputElement>(null);

  // Screen preview modal
  const [previewScreenId, setPreviewScreenId] = useState<string | null>(null);

  // Figma Make Flow Builder modal
  const [scannerUrl, setScannerUrl] = useState<string | null>(null);
  // Remember the last Make URL for the toolbar shortcut
  const [lastMakeUrl, setLastMakeUrl] = useState<string | null>(null);

  // Logic Flow Builder modal
  const [logicBuilderOpen, setLogicBuilderOpen] = useState(false);

  // New feature modals
  const [validatorOpen, setValidatorOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [jsonModalOpen, setJsonModalOpen] = useState(false);
  const [flowDocModalOpen, setFlowDocModalOpen] = useState(false);

  // Snap-to-grid toggle
  const [snapToGrid, setSnapToGrid] = useState(true);

  // UX Reasons visibility toggle
  const [showReasons, setShowReasons] = useState(true);

  // Edge flow-type visibility (hidden types are not rendered)
  const [hiddenFlowTypes, setHiddenFlowTypes] = useState<Set<FlowType>>(new Set());

  // ─── Sections state ───────────────────────────────────────
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [sectionMode, setSectionMode] = useState(false);
  const [sectionColorOpen, setSectionColorOpen] = useState(false);
  // Reset color accordion when section selection changes
  useEffect(() => { setSectionColorOpen(false); }, [selectedSectionId]);

  // Section draw (click+drag on canvas while sectionMode is on)
  const [sectionDraw, setSectionDraw] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const sectionDrawRef = useRef(false);

  // Section drag state
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const sectionDragStart = useRef({ mx: 0, my: 0, sx: 0, sy: 0 });
  const sectionDragNodeOrigins = useRef<Map<string, { x: number; y: number }>>(new Map());
  const sectionDragPrev = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Section resize state
  const [resizingSection, setResizingSection] = useState<{ id: string; handle: HandleId } | null>(null);
  const resizeOrigin = useRef<{ x: number; y: number; w: number; h: number; mx: number; my: number }>({ x: 0, y: 0, w: 0, h: 0, mx: 0, my: 0 });

  // Section inline rename
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);

  /** Get node IDs that are geometrically inside a section */
  const getNodesInSection = useCallback((sec: Section): string[] => {
    return screens.filter((s) => {
      const nw = NODE_WIDTH;
      const nh = s.nodeKind === "decision" ? DECISION_H : NODE_HEIGHT;
      const cx = s.x + nw / 2;
      const cy = s.y + nh / 2;
      return cx >= sec.x && cx <= sec.x + sec.width && cy >= sec.y && cy <= sec.y + sec.height;
    }).map((s) => s.id);
  }, [screens]);

  const sectionCounter = useRef(0);

  // Palette drag ghost state
  const [paletteDrag, setPaletteDrag] = useState<PaletteDragInfo | null>(null);

  // Connection-drawing state (drag from port to create edge)
  const [drawingConn, setDrawingConn] = useState<{
    sourceId: string;
    portId: PortId;
    /** Current cursor position in diagram coords */
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const drawingConnRef = useRef<typeof drawingConn>(null);

  // Reconnect-edge state (drag endpoint of existing connection to new node)
  const [reconnecting, setReconnecting] = useState<{
    connectionId: string;
    end: "source" | "dest";
    /** The node id at the OTHER end (stays fixed) */
    fixedNodeId: string;
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const reconnectingRef = useRef<typeof reconnecting>(null);

  /** During reconnect drag, tracks which node the cursor is hovering over */
  const [reconnectHover, setReconnectHover] = useState<{
    nodeId: string;
    condition?: "yes" | "no";
  } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Flag to trigger zoom-to-fit after next screens update
  const pendingZoomToFit = useRef(false);

  const handleAnalyze = useCallback(async (url: string, token: string, extraRoutes?: string[]) => {
    setError(null);
    setSelectedItem(null);

    // Mock data mode
    if (!url || url.trim().toLowerCase() === "mock") {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 600)); // simulate loading
      const laid = autoLayout([...mockScreens.map((s) => ({ ...s }))], mockConnections);
      setScreens(laid);
      setConnections(mockConnections.map((c) => ({ ...c })));
      setLoading(false);
      pendingZoomToFit.current = true;
      return;
    }

    // Figma Make mode
    if (isFigmaMakeUrl(url)) {
      setLoading(true);
      loadStartTime.current = Date.now();
      try {
        const data = await parseFigmaMakeSite(url.trim(), extraRoutes || [], onProgress, onAlert);
        if (data.screens.length === 0) {
          throw new Error("No routes discovered. Try adding routes manually.");
        }
        const laid = autoLayout(data.screens, data.connections);
        setScreens(laid);
        setConnections(data.connections);
        pendingZoomToFit.current = true;
      } catch (err: any) {
        const msg = err?.message || "Unknown error";
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("CORS")) {
          setError("CORS blocked — routes were created from manual input only. Add more routes in the sidebar.");
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    // Standard Figma API mode
    const fileKey = extractFileKey(url);
    if (!fileKey) {
      setError("Could not extract file key from URL. Use a Figma prototype, file URL, or Figma Make link (*.figma.site).");
      return;
    }

    if (!token.trim()) {
      setError("Please provide a Figma Personal Access Token.");
      return;
    }

    setLoading(true);
    loadStartTime.current = Date.now();
    try {
      const data = await parseFigmaFile(fileKey, token.trim(), onProgress, onAlert);
      const laid = autoLayout(data.screens, data.connections);
      setScreens(laid);
      setConnections(data.connections);
      pendingZoomToFit.current = true;
    } catch (err: any) {
      const msg = err?.message || "Unknown error";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setError("Enable CORS or use a proxy — see documentation");
      } else {
        setError(msg);
        addAlert({
          level: "error",
          title: msg.includes("timed out") ? "Request timed out" : msg.includes("too large") || msg.includes("limit") ? "File too large" : "Analysis failed",
          message: msg,
          dismissible: true,
          autoDismissMs: 15000,
        });
      }
    } finally {
      setLoading(false);
      setLoadingProgress(null);
    }
  }, [onProgress, onAlert, addAlert]);

  // Wheel / trackpad handler — pinch (ctrlKey) → zoom, two-finger drag → pan
  // Registered as native event with { passive: false } so preventDefault works.
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      if (editingEdge) return;
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (e.ctrlKey || e.metaKey) {
        // ── Pinch-to-zoom (Mac trackpad sends ctrlKey for pinch) ──
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;
        // Pinch deltaY is typically small (-2…+2); scale sensitivity accordingly
        const delta = -e.deltaY * 0.01;
        setZoom((prevZoom) => {
          const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom + delta));
          setPan((prevPan) => ({
            x: cursorX - ((cursorX - prevPan.x) / prevZoom) * newZoom,
            y: cursorY - ((cursorY - prevPan.y) / prevZoom) * newZoom,
          }));
          return newZoom;
        });
      } else {
        // ── Two-finger pan (FigJam-style trackpad scroll) ──
        setPan((prevPan) => ({
          x: prevPan.x - e.deltaX,
          y: prevPan.y - e.deltaY,
        }));
      }
    },
    [editingEdge]
  );

  // Attach wheel listener as non-passive so we can preventDefault
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  /** Helper to convert screen coords to diagram coords */
  const screenToDiagramFn = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom],
  );

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (editingEdge) return;
      const target = e.target as SVGElement;
      if (target.tagName === "svg" || target.dataset.bg === "true") {
        // Section-draw mode: click+drag on canvas to create section
        if (sectionMode) {
          const { x, y } = screenToDiagramFn(e.clientX, e.clientY);
          sectionDrawRef.current = true;
          setSectionDraw({ x1: x, y1: y, x2: x, y2: y });
          setSelectedItem(null);
          setSelectedSectionId(null);
          setMultiSelectedIds(new Set());
          return;
        }
        if (canvasMode === "select") {
          setSelectedSectionId(null);
          // Select mode: drag on bg → marquee (Shift optional), Shift not required
          const containerRect = canvasContainerRef.current?.getBoundingClientRect();
          const cx = e.clientX - (containerRect?.left || 0);
          const cy = e.clientY - (containerRect?.top || 0);
          marqueeStartScreen.current = { x: cx, y: cy };
          isMarquee.current = true;
          setMarquee({ x1: cx, y1: cy, x2: cx, y2: cy });
          setSelectedItem(null);
          if (!e.shiftKey) setMultiSelectedIds(new Set());
          return;
        }
        // Hand mode (or Space+drag in select mode): pan
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY };
        panOrigin.current = { ...pan };
        setSelectedItem(null);
        setSelectedSectionId(null);
        setMultiSelectedIds(new Set());
      }
    },
    [pan, editingEdge, canvasMode, sectionMode, screenToDiagramFn]
  );

  // ─── Multi-level Undo / Redo ────────────────────────────
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [redoStack, setRedoStack] = useState<UndoAction[]>([]);
  /** Toast shown after undo/redo/action — auto-dismissed after 6s */
  const [undoToast, setUndoToast] = useState<{
    message: string;
    direction: "action" | "undo" | "redo";
    icon: "trash" | "link" | "move" | "edit";
  } | null>(null);
  const undoToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Ref for pre-drag positions — used to create move undo actions */
  const preDragPositions = useRef<Map<string, { x: number; y: number }>>(new Map());

  const showToast = useCallback((message: string, direction: "action" | "undo" | "redo", icon: "trash" | "link" | "move" | "edit") => {
    if (undoToastTimer.current) clearTimeout(undoToastTimer.current);
    setUndoToast({ message, direction, icon });
    undoToastTimer.current = setTimeout(() => setUndoToast(null), 6000);
  }, []);

  /** Push a new action onto the undo stack (clears redo). */
  const pushUndo = useCallback((action: UndoAction) => {
    setUndoStack((prev) => {
      const next = pushAction(prev, action);
      // Only show toast for deletion and reconnect — moves are silent
      if (action.type !== "move") {
        showToast(describeAction(action), "action", actionIcon(action));
      }
      return next;
    });
    setRedoStack([]);
  }, [showToast]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Marquee dragging
      if (isMarquee.current) {
        const containerRect = canvasContainerRef.current?.getBoundingClientRect();
        const cx = e.clientX - (containerRect?.left || 0);
        const cy = e.clientY - (containerRect?.top || 0);
        setMarquee((prev) => prev ? { ...prev, x2: cx, y2: cy } : null);
        return;
      }
      // Multi-node dragging
      if (draggingNodeId && multiSelectedIds.has(draggingNodeId)) {
        const dx = (e.clientX - dragStartMouse.current.x) / zoom;
        const dy = (e.clientY - dragStartMouse.current.y) / zoom;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          didDrag.current = true;
        }
        setScreens((prev) =>
          prev.map((s) => {
            const origin = multiDragOrigins.current.get(s.id);
            if (origin) {
              return { ...s, x: origin.x + dx, y: origin.y + dy };
            }
            return s;
          })
        );
        return;
      }
      // Single node dragging
      if (draggingNodeId) {
        const dx = (e.clientX - dragStartMouse.current.x) / zoom;
        const dy = (e.clientY - dragStartMouse.current.y) / zoom;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          didDrag.current = true;
        }
        setScreens((prev) =>
          prev.map((s) =>
            s.id === draggingNodeId
              ? { ...s, x: dragStartNodePos.current.x + dx, y: dragStartNodePos.current.y + dy }
              : s
          )
        );
        return;
      }
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panOrigin.current.x + dx, y: panOrigin.current.y + dy });
    },
    [isPanning, draggingNodeId, zoom, multiSelectedIds]
  );

  const handleMouseUp = useCallback(() => {
    // Finish marquee
    if (isMarquee.current && marquee) {
      isMarquee.current = false;
      const containerRect = canvasContainerRef.current?.getBoundingClientRect();
      const cLeft = containerRect?.left || 0;
      const cTop = containerRect?.top || 0;
      // Convert marquee screen-coords → diagram (SVG) coords
      const left = Math.min(marquee.x1, marquee.x2);
      const right = Math.max(marquee.x1, marquee.x2);
      const top = Math.min(marquee.y1, marquee.y2);
      const bottom = Math.max(marquee.y1, marquee.y2);

      // Screen px → diagram coord: diagramX = (screenPx - pan.x) / zoom
      const dLeft = (left - pan.x) / zoom;
      const dRight = (right - pan.x) / zoom;
      const dTop = (top - pan.y) / zoom;
      const dBottom = (bottom - pan.y) / zoom;

      const ids = new Set<string>();
      for (const s of screens) {
        const nw = NODE_WIDTH;
        const nh = s.nodeKind === "decision" ? DECISION_H : NODE_HEIGHT;
        // Check overlap between node rect and marquee rect
        if (s.x + nw > dLeft && s.x < dRight && s.y + nh > dTop && s.y < dBottom) {
          ids.add(s.id);
        }
      }
      setMultiSelectedIds(ids);
      setSelectedItem(null);
      setMarquee(null);
      return;
    }

    if (draggingNodeId) {
      // Snap to grid on drop if enabled
      let finalScreens = screens;
      if (snapToGrid) {
        finalScreens = screens.map((s) => {
          const shouldSnap = s.id === draggingNodeId || multiSelectedIds.has(s.id);
          return shouldSnap ? { ...s, x: snapToGridVal(s.x), y: snapToGridVal(s.y) } : s;
        });
        setScreens(finalScreens);
      }

      // Push undo for move if positions actually changed
      if (preDragPositions.current.size > 0 && didDrag.current) {
        const movedNodes: { id: string; oldX: number; oldY: number; newX: number; newY: number }[] = [];
        for (const [id, old] of preDragPositions.current) {
          const cur = finalScreens.find((s) => s.id === id);
          if (cur && (cur.x !== old.x || cur.y !== old.y)) {
            movedNodes.push({ id, oldX: old.x, oldY: old.y, newX: cur.x, newY: cur.y });
          }
        }
        if (movedNodes.length > 0) {
          const label = movedNodes.length === 1
            ? `"${finalScreens.find((s) => s.id === movedNodes[0].id)?.name ?? "nodo"}"`
            : `${movedNodes.length} nodi`;
          pushUndo({ type: "move", movedNodes, label });
        }
        preDragPositions.current = new Map();
      }

      setDraggingNodeId(null);
      setTimeout(() => { didDrag.current = false; }, 50);
      return;
    }
    setIsPanning(false);
  }, [draggingNodeId, marquee, pan, zoom, screens, snapToGrid, multiSelectedIds, pushUndo]);

  // Node drag start
  const handleNodeDragStart = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (editingEdge) return;
      const screen = screens.find((s) => s.id === id);
      if (!screen) return;

      // If this node is multi-selected, drag all selected nodes
      if (multiSelectedIds.has(id)) {
        setDraggingNodeId(id);
        dragStartMouse.current = { x: e.clientX, y: e.clientY };
        dragStartNodePos.current = { x: screen.x, y: screen.y };
        // Store origins for every multi-selected node
        const origins = new Map<string, { x: number; y: number }>();
        for (const s of screens) {
          if (multiSelectedIds.has(s.id)) {
            origins.set(s.id, { x: s.x, y: s.y });
          }
        }
        multiDragOrigins.current = origins;
        // Capture pre-drag positions for undo
        preDragPositions.current = new Map(origins);
        didDrag.current = false;
        return;
      }

      // Single node drag
      setDraggingNodeId(id);
      dragStartMouse.current = { x: e.clientX, y: e.clientY };
      dragStartNodePos.current = { x: screen.x, y: screen.y };
      // Capture pre-drag position for undo
      preDragPositions.current = new Map([[id, { x: screen.x, y: screen.y }]]);
      didDrag.current = false;
    },
    [screens, editingEdge, multiSelectedIds]
  );

  // Edge label double-click to edit
  const handleEdgeLabelDoubleClick = useCallback(
    (connectionId: string, screenX: number, screenY: number) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) return;
      const containerRect = canvasContainerRef.current?.getBoundingClientRect();
      const x = screenX - (containerRect?.left || 0);
      const y = screenY - (containerRect?.top || 0);
      setEditingEdge({ connectionId, x, y, value: conn.trigger, reasonValue: conn.reason || "", flowType: conn.flowType });
      setSelectedItem({ type: "edge", id: connectionId });
      setTimeout(() => edgeInputRef.current?.focus(), 30);
    },
    [connections]
  );

  const commitEdgeEdit = useCallback(() => {
    if (!editingEdge) return;
    const trimmed = editingEdge.value.trim();
    const reasonTrimmed = editingEdge.reasonValue.trim() || undefined;
    if (trimmed) {
      // Check if anything actually changed to push undo
      const oldConn = connections.find((c) => c.id === editingEdge.connectionId);
      if (oldConn && (oldConn.trigger !== trimmed || oldConn.reason !== reasonTrimmed || oldConn.flowType !== editingEdge.flowType)) {
        pushUndo({
          type: "edit_connection",
          connectionId: editingEdge.connectionId,
          oldTrigger: oldConn.trigger,
          oldReason: oldConn.reason,
          oldFlowType: oldConn.flowType,
          newTrigger: trimmed,
          newReason: reasonTrimmed,
          newFlowType: editingEdge.flowType,
          label: trimmed,
        });
      }
      setConnections((prev) =>
        prev.map((c) =>
          c.id === editingEdge.connectionId ? { ...c, trigger: trimmed, reason: reasonTrimmed, flowType: editingEdge.flowType } : c
        )
      );
    }
    setEditingEdge(null);
  }, [editingEdge, connections, pushUndo]);

  const handleEdgeInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitEdgeEdit();
      } else if (e.key === "Escape") {
        setEditingEdge(null);
      }
    },
    [commitEdgeEdit]
  );

  // Handle dragging edge labels along their curves
  const handleLabelTChange = useCallback((connectionId: string, newT: number) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === connectionId ? { ...c, labelT: newT } : c))
    );
  }, []);

  // Toggle visibility of a flow type in the diagram
  const handleToggleFlowType = useCallback((type: FlowType) => {
    setHiddenFlowTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // Solo mode: show only the given flow type, hide all others
  const ALL_FLOW_TYPES: FlowType[] = ["happy", "secondary", "variant", "error", "skip"];
  const handleSoloFlowType = useCallback((type: FlowType) => {
    setHiddenFlowTypes((prev) => {
      // If already in solo for this type, un-solo (show all)
      const othersHidden = ALL_FLOW_TYPES.filter((t) => t !== type);
      const isAlreadySolo = othersHidden.every((t) => prev.has(t)) && !prev.has(type);
      if (isAlreadySolo) return new Set<FlowType>();
      return new Set<FlowType>(othersHidden);
    });
  }, []);

  // Show all flow types (reset)
  const handleShowAllFlowTypes = useCallback(() => {
    setHiddenFlowTypes(new Set());
  }, []);

  // Toolbar actions — zoom toward the center of the current viewport
  const zoomAtCenter = useCallback((delta: number) => {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 0;
    const cy = rect ? rect.height / 2 : 0;
    setZoom((prevZoom) => {
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom + delta));
      setPan((prevPan) => ({
        x: cx - ((cx - prevPan.x) / prevZoom) * newZoom,
        y: cy - ((cy - prevPan.y) / prevZoom) * newZoom,
      }));
      return newZoom;
    });
  }, []);
  const zoomIn = () => zoomAtCenter(0.15);
  const zoomOut = () => zoomAtCenter(-0.15);
  const resetView = () => {
    setZoom(1);
    setPan({ x: 400, y: 40 });
  };

  // Smart re-layout: Sugiyama-style layered graph layout
  const handleSmartLayout = useCallback(() => {
    if (screens.length === 0) return;
    const before = screens.map(s => ({ id: s.id, x: s.x, y: s.y }));
    const cloned = screens.map(s => ({ ...s }));
    const laid = smartLayout(cloned, connections, "vertical");
    const movedNodes = laid.map(s => {
      const b = before.find(n => n.id === s.id)!;
      return { id: s.id, oldX: b.x, oldY: b.y, newX: s.x, newY: s.y };
    }).filter(m => m.oldX !== m.newX || m.oldY !== m.newY);
    if (movedNodes.length > 0) {
      pushUndo({ type: "move", movedNodes, label: `auto-layout verticale (${movedNodes.length} nodi)` });
    }
    setScreens(laid);
    pendingZoomToFit.current = true;
  }, [screens, connections, pushUndo]);

  const handleSmartLayoutHorizontal = useCallback(() => {
    if (screens.length === 0) return;
    const before = screens.map(s => ({ id: s.id, x: s.x, y: s.y }));
    const cloned = screens.map(s => ({ ...s }));
    const laid = smartLayout(cloned, connections, "horizontal");
    const movedNodes = laid.map(s => {
      const b = before.find(n => n.id === s.id)!;
      return { id: s.id, oldX: b.x, oldY: b.y, newX: s.x, newY: s.y };
    }).filter(m => m.oldX !== m.newX || m.oldY !== m.newY);
    if (movedNodes.length > 0) {
      pushUndo({ type: "move", movedNodes, label: `auto-layout orizzontale (${movedNodes.length} nodi)` });
    }
    setScreens(laid);
    pendingZoomToFit.current = true;
  }, [screens, connections, pushUndo]);

  // Zoom-to-fit: compute bounding box of all nodes and fit in viewport
  const zoomToFit = useCallback(() => {
    if (screens.length === 0) return;
    const container = canvasContainerRef.current;
    if (!container) return;

    const viewW = container.clientWidth;
    const viewH = container.clientHeight;
    const PAD = 80; // padding around the diagram in px

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of screens) {
      const nh = s.nodeKind === "decision" ? DECISION_H : NODE_HEIGHT;
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + NODE_WIDTH);
      maxY = Math.max(maxY, s.y + nh);
    }

    const diagramW = maxX - minX;
    const diagramH = maxY - minY;
    if (diagramW <= 0 || diagramH <= 0) return;

    const scaleX = (viewW - PAD * 2) / diagramW;
    const scaleY = (viewH - PAD * 2) / diagramH;
    const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), MIN_ZOOM), MAX_ZOOM);

    // Centre the diagram
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const newPanX = viewW / 2 - cx * newZoom;
    const newPanY = viewH / 2 - cy * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [screens]);

  // Auto zoom-to-fit after import: triggered by pendingZoomToFit ref
  useEffect(() => {
    if (pendingZoomToFit.current && screens.length > 0) {
      pendingZoomToFit.current = false;
      requestAnimationFrame(() => zoomToFit());
    }
  }, [screens, zoomToFit]);

  const handleExportSVG = () => {
    if (svgRef.current) exportSVG(svgRef.current, screens, connections, sections, t, showReasons);
  };

  const handleExportPDF = async () => {
    if (svgRef.current) await exportPDF(svgRef.current, screens, connections, sections, t, showReasons);
  };

  const handleExportZip = () => {
    exportProjectZip(screens, connections, sections);
  };

  // Toggle snap-to-grid: when turning ON, snap all existing nodes immediately
  const toggleSnapToGrid = useCallback(() => {
    setSnapToGrid((prev) => {
      const next = !prev;
      if (next && screens.length > 0) {
        setScreens((s) => snapAllScreens(s));
      }
      return next;
    });
  }, [screens.length]);

  const selectNode = (id: string, e: React.MouseEvent) => {
    if (didDrag.current) return; // don't select after drag
    setSelectedSectionId(null);
    if (e.shiftKey) {
      // Shift+click: toggle node in multi-selection
      setMultiSelectedIds((prev) => {
        const next = new Set(prev);
        // If there's a single selected node not yet in multi-set, include it
        if (selectedItem?.type === "node" && !next.has(selectedItem.id)) {
          next.add(selectedItem.id);
        }
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      setSelectedItem({ type: "node", id });
    } else {
      setMultiSelectedIds(new Set());
      setSelectedItem({ type: "node", id });
    }
  };
  const selectEdge = (id: string) => {
    setMultiSelectedIds(new Set());
    setSelectedSectionId(null);
    setSelectedItem({ type: "edge", id });
  };

  const handleOpenPreview = (id: string) => {
    if (didDrag.current) return;
    setPreviewScreenId(id);
  };

  const handleUpdateScreen = useCallback((id: string, updates: Partial<Screen>) => {
    setScreens((prev) => {
      const oldScreen = prev.find((s) => s.id === id);
      if (!oldScreen) return prev;

      // Collect only the fields that actually changed
      const oldValues: Partial<Screen> = {};
      const newValues: Partial<Screen> = {};
      for (const key of Object.keys(updates) as (keyof Screen)[]) {
        if (oldScreen[key] !== updates[key]) {
          (oldValues as any)[key] = oldScreen[key];
          (newValues as any)[key] = updates[key];
        }
      }

      if (Object.keys(newValues).length === 0) return prev;

      // Build a human-readable label
      const changedKeys = Object.keys(newValues);
      let label: string;
      if (changedKeys.includes("name")) {
        label = `nome "${oldScreen.name}" → "${newValues.name}"`;
      } else if (changedKeys.includes("question")) {
        label = `domanda di "${oldScreen.name}"`;
      } else {
        label = `"${oldScreen.name}" (${changedKeys.join(", ")})`;
      }

      pushUndo({ type: "edit_node", nodeId: id, oldValues, newValues, label });

      return prev.map((s) => s.id === id ? { ...s, ...updates } : s);
    });
  }, [pushUndo]);

  const previewScreen = previewScreenId
    ? screens.find((s) => s.id === previewScreenId) || null
    : null;

  const handleOpenScanner = useCallback((url: string) => {
    setScannerUrl(url);
    setLastMakeUrl(url);
  }, []);

  const handleScannerConfirm = useCallback(
    async (result: ScannerResult) => {
      const urlToScan = result.baseUrl || scannerUrl;
      setScannerUrl(null);
      if (!urlToScan) return;
      setLastMakeUrl(urlToScan);

      // Trigger the Figma Make analysis with routes + flow definitions
      setError(null);
      setSelectedItem(null);
      setLoading(true);
      loadStartTime.current = Date.now();
      try {
        const data = await parseFigmaMakeSite(
          urlToScan.trim(),
          result.routes,
          onProgress,
          onAlert,
          result.flows
        );
        if (data.screens.length === 0) {
          throw new Error("No routes discovered. Try adding routes manually.");
        }
        const laid = autoLayout(data.screens, data.connections);
        setScreens(laid);
        setConnections(data.connections);
        pendingZoomToFit.current = true;
      } catch (err: any) {
        const msg = err?.message || "Unknown error";
        if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("CORS")) {
          setError("CORS blocked — routes were created from manual input only. Add more routes in the sidebar.");
        } else {
          setError(msg);
        }
      } finally {
        setLoading(false);
        setLoadingProgress(null);
      }
    },
    [scannerUrl, onProgress, onAlert]
  );

  const handleLogicFlowConfirm = useCallback((result: LogicFlowResult) => {
    setLogicBuilderOpen(false);
    setError(null);
    setSelectedItem(null);
    setScreens(result.screens);
    setConnections(result.connections);
    pendingZoomToFit.current = true;
  }, []);

  const handleTemplateConfirm = useCallback((result: TemplateResult) => {
    setTemplatesOpen(false);
    setError(null);
    setSelectedItem(null);
    setScreens(result.screens);
    setConnections(result.connections);
    pendingZoomToFit.current = true;
  }, []);

  const handleJsonImport = useCallback((result: JsonImportResult) => {
    setJsonModalOpen(false);
    setError(null);
    setSelectedItem(null);
    setScreens(result.screens);
    setConnections(result.connections);
    pendingZoomToFit.current = true;
  }, []);

  const handleFlowDocImport = useCallback((result: FlowDocResult) => {
    setFlowDocModalOpen(false);
    setError(null);
    setSelectedItem(null);
    setScreens(result.screens);
    setConnections(result.connections);
    pendingZoomToFit.current = true;
  }, []);

  // Node palette: counter for unique IDs
  const paletteCounter = useRef(0);

  /** Collect all node IDs that should be deleted right now */
  const getIdsToDelete = useCallback((): Set<string> => {
    const ids = new Set<string>();
    // Multi-selected nodes
    if (multiSelectedIds.size > 0) {
      multiSelectedIds.forEach((id) => ids.add(id));
    }
    // Single selected node
    if (selectedItem?.type === "node") {
      ids.add(selectedItem.id);
    }
    return ids;
  }, [multiSelectedIds, selectedItem]);

  /** Align selected nodes (with undo support) */
  const handleAlign = useCallback(
    (action: AlignAction) => {
      if (multiSelectedIds.size < 2) return;
      const newPositions = computeAlignment(action, screens, multiSelectedIds);
      if (newPositions.size === 0) return;

      // Capture before-positions for undo
      const movedNodes: { id: string; oldX: number; oldY: number; newX: number; newY: number }[] = [];
      for (const s of screens) {
        const pos = newPositions.get(s.id);
        if (!pos) continue;
        const nx = snapToGrid ? snapToGridVal(pos.x) : pos.x;
        const ny = snapToGrid ? snapToGridVal(pos.y) : pos.y;
        if (nx !== s.x || ny !== s.y) {
          movedNodes.push({ id: s.id, oldX: s.x, oldY: s.y, newX: nx, newY: ny });
        }
      }

      if (movedNodes.length > 0) {
        const label = movedNodes.length === 1
          ? `"${screens.find((s) => s.id === movedNodes[0].id)?.name ?? "nodo"}"`
          : `${movedNodes.length} nodi (allineamento)`;
        pushUndo({ type: "move", movedNodes, label });
      }

      setScreens((prev) =>
        prev.map((s) => {
          const pos = newPositions.get(s.id);
          if (!pos) return s;
          return {
            ...s,
            x: snapToGrid ? snapToGridVal(pos.x) : pos.x,
            y: snapToGrid ? snapToGridVal(pos.y) : pos.y,
          };
        })
      );
    },
    [screens, multiSelectedIds, snapToGrid, pushUndo]
  );

  /** Delete selected nodes/edges and their connections, saving snapshot for undo */
  const handleDeleteSelected = useCallback(() => {
    // ── Case 1: a single edge (connection) is selected ──
    if (selectedItem?.type === "edge") {
      const edgeToDelete = connections.find((c) => c.id === selectedItem.id);
      if (!edgeToDelete) return;

      const src = screens.find((s) => s.id === edgeToDelete.sourceId);
      const dst = screens.find((s) => s.id === edgeToDelete.destinationId);
      const label = `connessione ${src?.name ?? "?"} → ${dst?.name ?? "?"}`;

      pushUndo({ type: "deletion", screens: [], connections: [edgeToDelete], label });

      setConnections((prev) => prev.filter((c) => c.id !== edgeToDelete.id));
      setSelectedItem(null);
      return;
    }

    // ── Case 2: one or more nodes are selected ──
    const ids = getIdsToDelete();
    if (ids.size === 0) return;

    const deletedScreens = screens.filter((s) => ids.has(s.id));
    const deletedConnections = connections.filter(
      (c) => ids.has(c.sourceId) || ids.has(c.destinationId)
    );

    const label =
      deletedScreens.length === 1
        ? `"${deletedScreens[0].name}"`
        : `${deletedScreens.length} nodi`;

    pushUndo({ type: "deletion", screens: deletedScreens, connections: deletedConnections, label });

    setScreens((prev) => prev.filter((s) => !ids.has(s.id)));
    setConnections((prev) =>
      prev.filter((c) => !ids.has(c.sourceId) && !ids.has(c.destinationId))
    );
    setSelectedItem(null);
    setMultiSelectedIds(new Set());
  }, [getIdsToDelete, screens, connections, selectedItem, pushUndo]);

  /** Undo — pop from undoStack, reverse, push to redoStack */
  const handleUndo = useCallback(() => {
    setUndoStack((prevUndo) => {
      const [nextUndo, action] = popAction(prevUndo);
      if (!action) return prevUndo;

      // Apply reverse
      switch (action.type) {
        case "deletion":
          setScreens((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            return [...prev, ...action.screens.filter((s) => !existingIds.has(s.id))];
          });
          setConnections((prev) => {
            const existingIds = new Set(prev.map((c) => c.id));
            return [...prev, ...action.connections.filter((c) => !existingIds.has(c.id))];
          });
          break;
        case "reconnect":
          setConnections((prev) =>
            prev.map((c) =>
              c.id === action.connectionId
                ? { ...c, sourceId: action.oldSourceId, destinationId: action.oldDestId, condition: action.oldCondition }
                : c
            )
          );
          break;
        case "move":
          setScreens((prev) =>
            prev.map((s) => {
              const m = action.movedNodes.find((n) => n.id === s.id);
              return m ? { ...s, x: m.oldX, y: m.oldY } : s;
            })
          );
          break;
        case "create_connection":
          setConnections((prev) => prev.filter((c) => c.id !== action.connection.id));
          break;
        case "create_node":
          setConnections((prev) => prev.filter((c) => c.sourceId !== action.node.id && c.destinationId !== action.node.id));
          setScreens((prev) => prev.filter((s) => s.id !== action.node.id));
          setSelectedItem(null);
          setMultiSelectedIds(new Set());
          break;
        case "edit_node":
          setScreens((prev) => prev.map((s) => s.id === action.nodeId ? { ...s, ...action.oldValues } : s));
          break;
        case "edit_connection":
          setConnections((prev) =>
            prev.map((c) =>
              c.id === action.connectionId
                ? { ...c, trigger: action.oldTrigger, reason: action.oldReason, flowType: action.oldFlowType }
                : c
            )
          );
          break;
        case "create_section":
          setSections((prev) => prev.filter((s) => s.id !== action.section.id));
          setSelectedSectionId(null);
          break;
        case "delete_section":
          setSections((prev) => {
            const exists = prev.some((s) => s.id === action.section.id);
            return exists ? prev : [...prev, action.section];
          });
          break;
        case "move_section":
          setSections((prev) => prev.map((s) => s.id === action.sectionId ? { ...s, x: action.oldX, y: action.oldY } : s));
          setScreens((prev) => prev.map((s) => {
            const m = action.movedNodes.find((n) => n.id === s.id);
            return m ? { ...s, x: m.oldX, y: m.oldY } : s;
          }));
          break;
        case "resize_section":
          setSections((prev) => prev.map((s) => s.id === action.sectionId ? { ...s, x: action.oldX, y: action.oldY, width: action.oldW, height: action.oldH } : s));
          break;
        case "edit_section":
          setSections((prev) => prev.map((s) => s.id === action.sectionId ? { ...s, name: action.oldName, color: action.oldColor } : s));
          break;
      }

      setRedoStack((prevRedo) => {
        const nextRedo = pushAction(prevRedo, action);
        showToast(describeUndo(action), "undo", actionIcon(action));
        return nextRedo;
      });
      return nextUndo;
    });
  }, [showToast]);

  /** Redo — pop from redoStack, re-apply, push to undoStack */
  const handleRedo = useCallback(() => {
    setRedoStack((prevRedo) => {
      const [nextRedo, action] = popAction(prevRedo);
      if (!action) return prevRedo;

      // Apply forward
      switch (action.type) {
        case "deletion": {
          const screenIds = new Set(action.screens.map((s) => s.id));
          const connIds = new Set(action.connections.map((c) => c.id));
          setScreens((prev) => prev.filter((s) => !screenIds.has(s.id)));
          setConnections((prev) => prev.filter((c) => !connIds.has(c.id) && !screenIds.has(c.sourceId) && !screenIds.has(c.destinationId)));
          setSelectedItem(null);
          setMultiSelectedIds(new Set());
          break;
        }
        case "reconnect":
          setConnections((prev) =>
            prev.map((c) =>
              c.id === action.connectionId
                ? { ...c, sourceId: action.newSourceId, destinationId: action.newDestId, condition: action.newCondition }
                : c
            )
          );
          break;
        case "move":
          setScreens((prev) =>
            prev.map((s) => {
              const m = action.movedNodes.find((n) => n.id === s.id);
              return m ? { ...s, x: m.newX, y: m.newY } : s;
            })
          );
          break;
        case "create_connection":
          setConnections((prev) => {
            const exists = prev.some((c) => c.id === action.connection.id);
            return exists ? prev : [...prev, action.connection];
          });
          break;
        case "create_node":
          setScreens((prev) => {
            const exists = prev.some((s) => s.id === action.node.id);
            return exists ? prev : [...prev, action.node];
          });
          break;
        case "edit_node":
          setScreens((prev) => prev.map((s) => s.id === action.nodeId ? { ...s, ...action.newValues } : s));
          break;
        case "edit_connection":
          setConnections((prev) =>
            prev.map((c) =>
              c.id === action.connectionId
                ? { ...c, trigger: action.newTrigger, reason: action.newReason, flowType: action.newFlowType }
                : c
            )
          );
          break;
        case "create_section":
          setSections((prev) => {
            const exists = prev.some((s) => s.id === action.section.id);
            return exists ? prev : [...prev, action.section];
          });
          break;
        case "delete_section":
          setSections((prev) => prev.filter((s) => s.id !== action.section.id));
          setSelectedSectionId(null);
          break;
        case "move_section":
          setSections((prev) => prev.map((s) => s.id === action.sectionId ? { ...s, x: action.newX, y: action.newY } : s));
          setScreens((prev) => prev.map((s) => {
            const m = action.movedNodes.find((n) => n.id === s.id);
            return m ? { ...s, x: m.newX, y: m.newY } : s;
          }));
          break;
        case "resize_section":
          setSections((prev) => prev.map((s) => s.id === action.sectionId ? { ...s, x: action.newX, y: action.newY, width: action.newW, height: action.newH } : s));
          break;
        case "edit_section":
          setSections((prev) => prev.map((s) => s.id === action.sectionId ? { ...s, name: action.newName, color: action.newColor } : s));
          break;
      }

      setUndoStack((prevUndo) => {
        const nextUndo = pushAction(prevUndo, action);
        showToast(describeRedo(action), "redo", actionIcon(action));
        return nextUndo;
      });
      return nextRedo;
    });
  }, [showToast]);

  /** Delete the selected section */
  const handleDeleteSection = useCallback(() => {
    if (!selectedSectionId) return;
    const sec = sections.find((s) => s.id === selectedSectionId);
    if (!sec) return;
    pushUndo({ type: "delete_section", section: { ...sec }, label: `sezione "${sec.name}"` });
    setSections((prev) => prev.filter((s) => s.id !== selectedSectionId));
    setSelectedSectionId(null);
  }, [selectedSectionId, sections, pushUndo]);

  const toggleSectionMode = useCallback(() => {
    setSectionMode((prev) => !prev);
  }, []);

  // Keyboard shortcuts: Delete/Backspace → delete, Ctrl+Z → undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Don't intercept when editing edge
      if (editingEdge) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selectedSectionId) {
          handleDeleteSection();
        } else {
          handleDeleteSelected();
        }
      }

      // Shift+S → toggle section draw mode
      if (e.key === "S" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleSectionMode();
      }
      // Escape → exit section mode
      if (e.key === "Escape") {
        if (sectionMode) { setSectionMode(false); return; }
        if (selectedSectionId) { setSelectedSectionId(null); return; }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }

      // 1–5: toggle flow type visibility; Alt+1–5: solo mode; 0: show all
      const FLOW_KEY_MAP: Record<string, FlowType> = {
        "1": "happy", "2": "secondary", "3": "variant", "4": "error", "5": "skip",
      };
      if (FLOW_KEY_MAP[e.key] && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (e.altKey) {
          handleSoloFlowType(FLOW_KEY_MAP[e.key]);
        } else {
          handleToggleFlowType(FLOW_KEY_MAP[e.key]);
        }
      }
      if ((e.key === "0" || e.key === "`") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleShowAllFlowTypes();
      }

      // V → select mode, H → hand mode
      if (e.key === "v" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setCanvasMode("select");
      }
      if (e.key === "h" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setCanvasMode("hand");
      }
      // Space held → temporary hand mode
      if (e.key === " " && !e.repeat && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        spaceBeforeMode.current = canvasMode;
        setCanvasMode("hand");
      }

      // Cmd/Ctrl+A → select all elements
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        const allIds = new Set(screens.map((s) => s.id));
        setMultiSelectedIds(allIds);
        setSelectedItem(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setCanvasMode(spaceBeforeMode.current || "select");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleDeleteSelected, handleDeleteSection, handleUndo, handleRedo, editingEdge, handleToggleFlowType, handleSoloFlowType, handleShowAllFlowTypes, canvasMode, screens, selectedSectionId, sectionMode, toggleSectionMode]);

  /** Drop handler for the node palette — creates a new screen or decision node */
  const handlePaletteDrop = useCallback(
    (kind: import("./components/flowmapper/types").NodeKind, diagramX: number, diagramY: number) => {
      paletteCounter.current += 1;
      const idx = paletteCounter.current;
      const id = `palette-${kind}-${idx}-${Date.now()}`;

      if (kind === "decision") {
        const newNode: Screen = {
          id,
          name: `Decisione ${idx}`,
          x: diagramX,
          y: diagramY,
          width: NODE_WIDTH,
          height: DECISION_H,
          figmaFrameId: id,
          nodeKind: "decision",
          question: "Condizione?",
        };
        setScreens((prev) => [...prev, newNode]);
        pushUndo({ type: "create_node", node: { ...newNode }, label: `nodo decisione "${newNode.name}"` });
      } else {
        const newNode: Screen = {
          id,
          name: `Schermata ${screens.length + 1}`,
          x: diagramX,
          y: diagramY,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          figmaFrameId: id,
          nodeKind: "screen",
        };
        setScreens((prev) => [...prev, newNode]);
        pushUndo({ type: "create_node", node: { ...newNode }, label: `schermata "${newNode.name}"` });
      }
      setSelectedItem({ type: "node", id });
    },
    [screens.length, pushUndo]
  );

  // ─── Section interactions ──────────────────────────────────────────

  const handleSectionClick = useCallback((id: string, e: React.MouseEvent) => {
    setSelectedItem(null);
    setMultiSelectedIds(new Set());
    setSelectedSectionId(id);
  }, []);

  const handleSectionDragStart = useCallback((id: string, e: React.MouseEvent) => {
    const sec = sections.find((s) => s.id === id);
    if (!sec) return;
    setDraggingSectionId(id);
    setSelectedSectionId(id);
    setSelectedItem(null);
    setMultiSelectedIds(new Set());
    const { x: mx, y: my } = screenToDiagramFn(e.clientX, e.clientY);
    sectionDragStart.current = { mx, my, sx: sec.x, sy: sec.y };
    sectionDragPrev.current = { x: sec.x, y: sec.y };
    // Capture positions of nodes inside section
    const contained = getNodesInSection(sec);
    const origins = new Map<string, { x: number; y: number }>();
    for (const nid of contained) {
      const s = screens.find((s) => s.id === nid);
      if (s) origins.set(nid, { x: s.x, y: s.y });
    }
    sectionDragNodeOrigins.current = origins;
    preDragPositions.current = new Map(origins);
  }, [sections, screens, getNodesInSection, screenToDiagramFn]);

  const handleSectionResizeStart = useCallback((id: string, handle: HandleId, e: React.MouseEvent) => {
    const sec = sections.find((s) => s.id === id);
    if (!sec) return;
    const { x: mx, y: my } = screenToDiagramFn(e.clientX, e.clientY);
    resizeOrigin.current = { x: sec.x, y: sec.y, w: sec.width, h: sec.height, mx, my };
    setResizingSection({ id, handle });
    setSelectedSectionId(id);
  }, [sections, screenToDiagramFn]);

  const handleSectionDoubleClickName = useCallback((id: string) => {
    setEditingSectionId(id);
    setSelectedSectionId(id);
  }, []);

  /** Auto-fit a section to tightly wrap all nodes whose center falls inside it */
  const handleSectionAutoFit = useCallback((id: string) => {
    const sec = sections.find((s) => s.id === id);
    if (!sec) return;

    const PAD = 40; // padding around nodes
    const TITLE_H = 32; // title bar height

    // Find all nodes whose center falls inside the section
    const nodesInside = screens.filter((n) => {
      const nw = NODE_WIDTH;
      const nh = n.type === "decision" ? DECISION_H : NODE_HEIGHT;
      const cx = n.x + nw / 2;
      const cy = n.y + nh / 2;
      return cx >= sec.x && cx <= sec.x + sec.width && cy >= sec.y && cy <= sec.y + sec.height;
    });

    if (nodesInside.length === 0) return; // nothing to fit

    // Calculate bounding box of all nodes inside
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodesInside) {
      const nw = NODE_WIDTH;
      const nh = n.type === "decision" ? DECISION_H : NODE_HEIGHT;
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + nw > maxX) maxX = n.x + nw;
      if (n.y + nh > maxY) maxY = n.y + nh;
    }

    const newX = minX - PAD;
    const newY = minY - PAD - TITLE_H;
    const newW = Math.max(MIN_SECTION_W, (maxX - minX) + PAD * 2);
    const newH = Math.max(MIN_SECTION_H, (maxY - minY) + PAD * 2 + TITLE_H);

    // Skip if already fits perfectly
    if (sec.x === newX && sec.y === newY && sec.width === newW && sec.height === newH) return;

    // Record undo for resize
    pushUndo({
      type: "resize_section",
      sectionId: id,
      oldX: sec.x, oldY: sec.y, oldW: sec.width, oldH: sec.height,
      newX, newY, newW: newW, newH: newH,
      label: `adatta sezione "${sec.name}"`,
    });
    setSections((prev) => prev.map((s) => s.id === id ? { ...s, x: newX, y: newY, width: newW, height: newH } : s));
  }, [sections, screens, pushUndo]);

  // Section drag window listeners
  useEffect(() => {
    if (!draggingSectionId) return;
    const handleMove = (e: MouseEvent) => {
      const { x: mx, y: my } = screenToDiagramFn(e.clientX, e.clientY);
      const dx = mx - sectionDragStart.current.mx;
      const dy = my - sectionDragStart.current.my;
      const newX = snapToGrid ? snapToGridVal(sectionDragStart.current.sx + dx) : sectionDragStart.current.sx + dx;
      const newY = snapToGrid ? snapToGridVal(sectionDragStart.current.sy + dy) : sectionDragStart.current.sy + dy;

      setSections((prev) =>
        prev.map((s) => s.id === draggingSectionId ? { ...s, x: newX, y: newY } : s),
      );
      // Move contained nodes
      const secDx = newX - sectionDragStart.current.sx;
      const secDy = newY - sectionDragStart.current.sy;
      setScreens((prev) =>
        prev.map((s) => {
          const origin = sectionDragNodeOrigins.current.get(s.id);
          if (!origin) return s;
          return {
            ...s,
            x: snapToGrid ? snapToGridVal(origin.x + secDx) : origin.x + secDx,
            y: snapToGrid ? snapToGridVal(origin.y + secDy) : origin.y + secDy,
          };
        }),
      );
    };
    const handleUp = (e: MouseEvent) => {
      const sec = sections.find((s) => s.id === draggingSectionId);
      if (sec) {
        const prevPos = sectionDragPrev.current;
        if (sec.x !== sectionDragStart.current.sx || sec.y !== sectionDragStart.current.sy) {
          // Build moved-nodes list
          const movedNodes: { id: string; oldX: number; oldY: number; newX: number; newY: number }[] = [];
          for (const [nid, origin] of sectionDragNodeOrigins.current) {
            const cur = screens.find((s) => s.id === nid);
            if (cur && (cur.x !== origin.x || cur.y !== origin.y)) {
              movedNodes.push({ id: nid, oldX: origin.x, oldY: origin.y, newX: cur.x, newY: cur.y });
            }
          }
          pushUndo({
            type: "move_section",
            sectionId: sec.id,
            oldX: sectionDragStart.current.sx,
            oldY: sectionDragStart.current.sy,
            newX: sec.x,
            newY: sec.y,
            movedNodes,
            label: `sezione "${sec.name}"`,
          });
        }
      }
      sectionDragNodeOrigins.current = new Map();
      setDraggingSectionId(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [draggingSectionId, sections, screens, snapToGrid, pushUndo, screenToDiagramFn]);

  // Section resize window listeners
  useEffect(() => {
    if (!resizingSection) return;
    const handleMove = (e: MouseEvent) => {
      const { x: mx, y: my } = screenToDiagramFn(e.clientX, e.clientY);
      const dx = mx - resizeOrigin.current.mx;
      const dy = my - resizeOrigin.current.my;
      const result = applyResize(resizingSection.handle, dx, dy, {
        x: resizeOrigin.current.x,
        y: resizeOrigin.current.y,
        w: resizeOrigin.current.w,
        h: resizeOrigin.current.h,
      });
      setSections((prev) =>
        prev.map((s) =>
          s.id === resizingSection.id
            ? { ...s, x: result.x, y: result.y, width: result.w, height: result.h }
            : s,
        ),
      );
    };
    const handleUp = () => {
      const sec = sections.find((s) => s.id === resizingSection.id);
      if (sec) {
        const o = resizeOrigin.current;
        if (sec.x !== o.x || sec.y !== o.y || sec.width !== o.w || sec.height !== o.h) {
          pushUndo({
            type: "resize_section",
            sectionId: sec.id,
            oldX: o.x, oldY: o.y, oldW: o.w, oldH: o.h,
            newX: sec.x, newY: sec.y, newW: sec.width, newH: sec.height,
            label: `sezione "${sec.name}"`,
          });
        }
      }
      setResizingSection(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [resizingSection, sections, pushUndo, screenToDiagramFn]);

  // Section draw (click+drag while sectionMode is on)
  useEffect(() => {
    if (!sectionDraw) return;
    const handleMove = (e: MouseEvent) => {
      if (!sectionDrawRef.current) return;
      const { x, y } = screenToDiagramFn(e.clientX, e.clientY);
      setSectionDraw((prev) => prev ? { ...prev, x2: x, y2: y } : null);
    };
    const handleUp = () => {
      sectionDrawRef.current = false;
      const draw = sectionDraw;
      setSectionDraw(null);
      if (!draw) return;
      const x = Math.min(draw.x1, draw.x2);
      const y = Math.min(draw.y1, draw.y2);
      const w = Math.abs(draw.x2 - draw.x1);
      const h = Math.abs(draw.y2 - draw.y1);
      if (w < 40 || h < 40) return; // too small — cancel
      sectionCounter.current += 1;
      const newSec: Section = {
        id: `section-${Date.now()}-${sectionCounter.current}`,
        name: `Sezione ${sectionCounter.current}`,
        x: snapToGrid ? snapToGridVal(x) : x,
        y: snapToGrid ? snapToGridVal(y) : y,
        width: Math.max(MIN_SECTION_W, snapToGrid ? snapToGridVal(w) : w),
        height: Math.max(MIN_SECTION_H, snapToGrid ? snapToGridVal(h) : h),
        color: DEFAULT_SECTION_COLOR,
      };
      setSections((prev) => [...prev, newSec]);
      pushUndo({ type: "create_section", section: { ...newSec }, label: `sezione "${newSec.name}"` });
      setSelectedSectionId(newSec.id);
      setSectionMode(false);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [sectionDraw, snapToGrid, pushUndo, screenToDiagramFn]);

  // ─── Connection drawing: drag from port to create edge ───────────
  /** Convert screen (client) coords to diagram coords */
  const screenToDiagram = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  const handlePortDragStart = useCallback(
    (nodeId: string, portId: PortId, e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const { x, y } = screenToDiagram(e.clientX, e.clientY);
      const info = { sourceId: nodeId, portId, mouseX: x, mouseY: y };
      drawingConnRef.current = info;
      setDrawingConn(info);
    },
    [screenToDiagram]
  );

  // Window-level listeners for connection drawing
  useEffect(() => {
    if (!drawingConn) return;

    const handleMove = (e: MouseEvent) => {
      const { x, y } = screenToDiagram(e.clientX, e.clientY);
      const next = { ...drawingConnRef.current!, mouseX: x, mouseY: y };
      drawingConnRef.current = next;
      setDrawingConn(next);
    };

    const handleUp = (e: MouseEvent) => {
      const info = drawingConnRef.current;
      drawingConnRef.current = null;
      setDrawingConn(null);
      if (!info) return;

      // Hit-test: find target node under cursor
      const { x: mx, y: my } = screenToDiagram(e.clientX, e.clientY);
      let targetId: string | null = null;
      for (const s of screens) {
        if (s.id === info.sourceId) continue; // can't connect to self
        const nh = s.nodeKind === "decision" ? DECISION_H : NODE_HEIGHT;
        // Generous hit area (16px margin)
        if (
          mx >= s.x - 16 && mx <= s.x + NODE_WIDTH + 16 &&
          my >= s.y - 16 && my <= s.y + nh + 16
        ) {
          targetId = s.id;
          break;
        }
      }
      if (!targetId) return;

      // Determine condition for decision node outputs
      let condition: "yes" | "no" | undefined;
      const sourceScreen = screens.find((s) => s.id === info.sourceId);
      if (sourceScreen?.nodeKind === "decision") {
        condition = (info.portId === "output-no" || info.portId === "output-bottom") ? "no" : "yes";
      }

      // Check if this connection already exists
      const exists = connections.some(
        (c) => c.sourceId === info.sourceId && c.destinationId === targetId
      );
      if (exists) return;

      const newConn: Connection = {
        id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sourceId: info.sourceId,
        destinationId: targetId,
        trigger: condition === "no" ? "No" : condition === "yes" ? "Sì" : "Navigazione",
        flowType: "happy",
        condition,
      };
      setConnections((prev) => [...prev, newConn]);
      pushUndo({ type: "create_connection", connection: { ...newConn }, label: newConn.trigger || "nuovo collegamento" });
      setSelectedItem(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [drawingConn, screens, connections, screenToDiagram, pushUndo]);

  // ── Reconnect existing edge endpoint ──────────────────────────
  const handleEndpointDragStart = useCallback(
    (connectionId: string, end: "source" | "dest", e: React.MouseEvent) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (!conn) return;
      const fixedNodeId = end === "source" ? conn.destinationId : conn.sourceId;
      const { x, y } = screenToDiagram(e.clientX, e.clientY);
      const info = { connectionId, end, fixedNodeId, mouseX: x, mouseY: y };
      reconnectingRef.current = info;
      setReconnecting(info);
      setSelectedItem({ type: "edge", id: connectionId });
    },
    [connections, screenToDiagram]
  );

  // Window-level listeners for reconnect drag
  useEffect(() => {
    if (!reconnecting) return;

    const handleMove = (e: MouseEvent) => {
      const { x, y } = screenToDiagram(e.clientX, e.clientY);
      const next = { ...reconnectingRef.current!, mouseX: x, mouseY: y };
      reconnectingRef.current = next;
      setReconnecting(next);

      // Compute hover target for visual feedback
      let hoverId: string | null = null;
      let hoverCondition: "yes" | "no" | undefined = undefined;
      for (const s of screens) {
        if (s.id === next.fixedNodeId) continue;
        const isDecNode = s.nodeKind === "decision";
        const hitRight = isDecNode ? NODE_WIDTH + 32 : NODE_WIDTH + 16;
        const hitBottom = isDecNode ? DECISION_H + 28 : NODE_HEIGHT + 16;
        if (
          x >= s.x - 16 && x <= s.x + hitRight &&
          y >= s.y - 16 && y <= s.y + hitBottom
        ) {
          hoverId = s.id;
          // Detect condition when reconnecting source to a decision node
          if (next.end === "source" && isDecNode) {
            const yesPx = s.x + NODE_WIDTH + 26;
            const yesPy = s.y + DECISION_H / 2;
            const noPx = s.x + NODE_WIDTH / 2;
            const noPy = s.y + DECISION_H + 22;
            const distYes = Math.hypot(x - yesPx, y - yesPy);
            const distNo = Math.hypot(x - noPx, y - noPy);
            hoverCondition = distNo < distYes ? "no" : "yes";
          }
          break;
        }
      }
      setReconnectHover(hoverId ? { nodeId: hoverId, condition: hoverCondition } : null);
    };

    const handleUp = (e: MouseEvent) => {
      const info = reconnectingRef.current;
      reconnectingRef.current = null;
      setReconnecting(null);
      setReconnectHover(null);
      if (!info) return;

      // Hit-test: find target node under cursor
      const { x: mx, y: my } = screenToDiagram(e.clientX, e.clientY);
      let targetId: string | null = null;
      for (const s of screens) {
        if (s.id === info.fixedNodeId) continue; // can't connect node to itself
        const isDecNode = s.nodeKind === "decision";
        // Expand hit area for decision nodes to include arm tips (Si/No ports)
        const hitRight = isDecNode ? NODE_WIDTH + 32 : NODE_WIDTH + 16;
        const hitBottom = isDecNode ? DECISION_H + 28 : NODE_HEIGHT + 16;
        if (
          mx >= s.x - 16 && mx <= s.x + hitRight &&
          my >= s.y - 16 && my <= s.y + hitBottom
        ) {
          targetId = s.id;
          break;
        }
      }
      if (!targetId) return; // dropped on empty space — cancel

      // Determine condition when reconnecting source to a decision node
      const targetNode = screens.find((s) => s.id === targetId);
      const conn = connections.find((c) => c.id === info.connectionId);
      if (!conn) return;
      let newCondition: "yes" | "no" | undefined = undefined;
      if (info.end === "source" && targetNode?.nodeKind === "decision") {
        // Decide yes/no based on cursor proximity to the right (Si) vs bottom (No) arm
        const yesPx = targetNode.x + NODE_WIDTH + 26;
        const yesPy = targetNode.y + DECISION_H / 2;
        const noPx = targetNode.x + NODE_WIDTH / 2;
        const noPy = targetNode.y + DECISION_H + 22;
        const distYes = Math.hypot(mx - yesPx, my - yesPy);
        const distNo = Math.hypot(mx - noPx, my - noPy);
        newCondition = distNo < distYes ? "no" : "yes";
      } else if (info.end === "dest") {
        // Reconnecting destination: preserve the original condition (yes/no arm)
        newCondition = conn.condition;
      }

      const newSourceId = info.end === "source" ? targetId : info.fixedNodeId;
      const newDestId = info.end === "dest" ? targetId : info.fixedNodeId;

      // Can't connect to self
      if (newSourceId === newDestId) return;

      // If nothing actually changed (same source, dest, and condition), cancel
      if (
        newSourceId === conn.sourceId &&
        newDestId === conn.destinationId &&
        newCondition === conn.condition
      ) return;

      // If new source is NOT a decision node, clear condition
      if (info.end === "source" && targetNode?.nodeKind !== "decision") {
        newCondition = undefined;
      }

      const duplicate = connections.some(
        (c) => c.id !== info.connectionId && c.sourceId === newSourceId && c.destinationId === newDestId
          && (newCondition === undefined || c.condition === newCondition)
      );
      if (duplicate) return;

      // Save undo snapshot
      const srcName = screens.find((s) => s.id === conn.sourceId)?.name ?? "?";
      const dstName = screens.find((s) => s.id === conn.destinationId)?.name ?? "?";
      const newNodeName = screens.find((s) => s.id === targetId)?.name ?? "?";
      const condLabel = newCondition ? ` (${newCondition === "yes" ? "Sì" : "No"})` : "";
      const label = info.end === "source"
        ? `sorgente: ${srcName} → ${newNodeName}${condLabel}`
        : `destinazione: ${dstName} → ${newNodeName}`;
      pushUndo({
        type: "reconnect",
        connectionId: info.connectionId,
        oldSourceId: conn.sourceId,
        oldDestId: conn.destinationId,
        newSourceId,
        newDestId,
        oldCondition: conn.condition,
        newCondition,
        label,
      });

      // Apply the reconnection (including condition change)
      setConnections((prev) =>
        prev.map((c) =>
          c.id === info.connectionId
            ? { ...c, sourceId: newSourceId, destinationId: newDestId, condition: newCondition }
            : c
        )
      );
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [reconnecting, screens, connections, screenToDiagram, pushUndo]);

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: t.canvasBg }}>
      {/* Left Sidebar */}
      <Sidebar
        onAnalyze={handleAnalyze}
        loading={loading}
        error={error}
        screens={screens}
        connections={connections}
        selectedItem={selectedItem}
        onOpenScanner={handleOpenScanner}
        onOpenFlowDoc={() => setFlowDocModalOpen(true)}
        onUpdateConnection={(id, updates) => {
          setConnections((prev) =>
            prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
          );
        }}
        hiddenFlowTypes={hiddenFlowTypes}
        onToggleFlowType={handleToggleFlowType}
        onSoloFlowType={handleSoloFlowType}
        onShowAllFlowTypes={handleShowAllFlowTypes}
      />

      {/* Main Canvas */}
      <div
        ref={canvasContainerRef}
        className="relative flex-1 overflow-hidden"
        style={{ background: t.canvasBg }}
      >
        {/* SVG Canvas */}
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ cursor: sectionMode ? "crosshair" : isMarquee.current ? "crosshair" : draggingNodeId || draggingSectionId ? "grabbing" : isPanning ? "grabbing" : (drawingConn || reconnecting) ? "crosshair" : canvasMode === "hand" ? "grab" : "default" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Dot grid pattern */}
          <defs>
            <pattern id="dotgrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.8" fill={t.dotGrid} />
            </pattern>
            {/* Enhanced grid lines pattern (visible when snap is ON) */}
            <pattern id="snapgrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="20" y2="0" stroke={t.snapGridLine} strokeWidth="0.5" />
              <line x1="0" y1="0" x2="0" y2="20" stroke={t.snapGridLine} strokeWidth="0.5" />
              <circle cx="0" cy="0" r="1" fill={t.snapGridDot} opacity="0.25" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dotgrid)" data-bg="true" />
          {snapToGrid && (
            <rect width="100%" height="100%" fill="url(#snapgrid)" data-bg="true" style={{ pointerEvents: "none" }} />
          )}

          {/* Diagram group with pan & zoom */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Sections — rendered behind edges and nodes */}
            {sections.map((sec) => (
              <DiagramSection
                key={sec.id}
                section={sec}
                isSelected={selectedSectionId === sec.id}
                onClick={handleSectionClick}
                onDragStart={handleSectionDragStart}
                onResizeStart={handleSectionResizeStart}
                onDoubleClickName={handleSectionDoubleClickName}
                onDoubleClickBody={handleSectionAutoFit}
              />
            ))}
            {/* Section-draw preview rectangle */}
            {sectionDraw && (() => {
              const x = Math.min(sectionDraw.x1, sectionDraw.x2);
              const y = Math.min(sectionDraw.y1, sectionDraw.y2);
              const w = Math.abs(sectionDraw.x2 - sectionDraw.x1);
              const h = Math.abs(sectionDraw.y2 - sectionDraw.y1);
              return (
                <rect
                  x={x} y={y} width={w} height={h}
                  rx={6}
                  fill={`${DEFAULT_SECTION_COLOR}15`}
                  stroke={DEFAULT_SECTION_COLOR}
                  strokeWidth={2}
                  strokeDasharray="8,4"
                  style={{ pointerEvents: "none" }}
                />
              );
            })()}
            {/* Edges behind nodes — filtered by flow-type visibility */}
            {connections
              .filter((conn) => !hiddenFlowTypes.has(conn.flowType))
              .map((conn) => (
                <DiagramEdge
                  key={conn.id}
                  connection={conn}
                  screens={screens}
                  isSelected={selectedItem?.type === "edge" && selectedItem.id === conn.id}
                  showReasons={showReasons}
                  onClick={selectEdge}
                  onDoubleClickLabel={handleEdgeLabelDoubleClick}
                  onLabelTChange={handleLabelTChange}
                  onEndpointDragStart={handleEndpointDragStart}
                  isReconnecting={reconnecting?.connectionId === conn.id ? reconnecting.end : null}
                  reconnectMousePos={reconnecting?.connectionId === conn.id ? { x: reconnecting.mouseX, y: reconnecting.mouseY } : null}
                />
              ))}
            {/* Nodes on top */}
            {screens.map((screen) => (
              <DiagramNode
                key={screen.id}
                screen={screen}
                isSelected={
                  (selectedItem?.type === "node" && selectedItem.id === screen.id) ||
                  multiSelectedIds.has(screen.id)
                }
                connections={connections}
                onClick={selectNode}
                onDragStart={handleNodeDragStart}
                onOpenPreview={handleOpenPreview}
                onPortDragStart={handlePortDragStart}
                isConnectSource={drawingConn?.sourceId === screen.id}
                isConnectTarget={
                  (!!drawingConn && drawingConn.sourceId !== screen.id) ||
                  (!!reconnecting && reconnecting.fixedNodeId !== screen.id && !reconnectHover)
                }
                hideOutputPorts={selectedItem?.type === "edge"}
                isReconnectTarget={reconnectHover?.nodeId === screen.id}
                reconnectCondition={reconnectHover?.nodeId === screen.id ? reconnectHover.condition : undefined}
              />
            ))}

            {/* Selected edge endpoint handles — rendered ON TOP of nodes for z-order */}
            {selectedItem?.type === "edge" && !reconnecting && (() => {
              const conn = connections.find((c) => c.id === selectedItem.id);
              if (!conn) return null;
              const src = screens.find((s) => s.id === conn.sourceId);
              const dest = screens.find((s) => s.id === conn.destinationId);
              if (!src || !dest) return null;
              const ports = getBestPorts(src, dest, conn.condition);
              const color = "#f59e0b"; // selected edge color
              return (
                <g>
                  {/* Source endpoint */}
                  <circle
                    cx={ports.sx} cy={ports.sy}
                    r={10}
                    fill="transparent"
                    style={{ cursor: "crosshair" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleEndpointDragStart(conn.id, "source", e);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <circle cx={ports.sx} cy={ports.sy} r={5}
                    fill={t.portFill} stroke={color} strokeWidth={1.5}
                    style={{ pointerEvents: "none" }} />
                  <circle cx={ports.sx} cy={ports.sy} r={2}
                    fill={color} style={{ pointerEvents: "none" }} />
                  {/* Dest endpoint */}
                  <circle
                    cx={ports.dx} cy={ports.dy}
                    r={10}
                    fill="transparent"
                    style={{ cursor: "crosshair" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleEndpointDragStart(conn.id, "dest", e);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <circle cx={ports.dx} cy={ports.dy} r={5}
                    fill={t.portFill} stroke={color} strokeWidth={1.5}
                    style={{ pointerEvents: "none" }} />
                  <circle cx={ports.dx} cy={ports.dy} r={2}
                    fill={color} style={{ pointerEvents: "none" }} />
                </g>
              );
            })()}

            {/* Temporary connection line while drawing */}
            {drawingConn && (() => {
              const src = screens.find((s) => s.id === drawingConn.sourceId);
              if (!src) return null;
              const portPos = getPortPosition(src.nodeKind, drawingConn.portId);
              const x1 = src.x + portPos.x;
              const y1 = src.y + portPos.y;
              return (
                <g style={{ pointerEvents: "none" }}>
                  <line
                    x1={x1} y1={y1}
                    x2={drawingConn.mouseX} y2={drawingConn.mouseY}
                    stroke="#6366f1"
                    strokeWidth={2}
                    strokeDasharray="8,4"
                    opacity={0.8}
                  />
                  {/* Source port glow */}
                  <circle cx={x1} cy={y1} r={6} fill="#6366f1" opacity={0.3} />
                  {/* Cursor dot */}
                  <circle cx={drawingConn.mouseX} cy={drawingConn.mouseY} r={4} fill="#6366f1" opacity={0.6} />
                </g>
              );
            })()}

            {/* Reconnect visual feedback: dashed line from fixed endpoint to cursor + condition badge */}
            {reconnecting && (() => {
              const conn = connections.find((c) => c.id === reconnecting.connectionId);
              const fixedNode = screens.find((s) => s.id === reconnecting.fixedNodeId);
              if (!conn || !fixedNode) return null;
              // Compute the fixed endpoint position
              let fx: number, fy: number;
              if (reconnecting.end === "source") {
                // Dragging source → fixed end is the destination
                const fKind = fixedNode.nodeKind || "screen";
                const fH = fKind === "decision" ? DECISION_H : NODE_HEIGHT;
                fx = fixedNode.x + NODE_WIDTH / 2;
                fy = fixedNode.y; // top of dest node (approximate entry)
                // Use better port: pick left center of fixed node as the "entry" point
                fx = fixedNode.x;
                fy = fixedNode.y + fH / 2;
              } else {
                // Dragging dest → fixed end is the source
                const fKind = fixedNode.nodeKind || "screen";
                if (fKind === "decision") {
                  const cond = conn.condition;
                  if (cond === "no") {
                    fx = fixedNode.x + NODE_WIDTH / 2;
                    fy = fixedNode.y + DECISION_H + 22;
                  } else {
                    fx = fixedNode.x + NODE_WIDTH + 26;
                    fy = fixedNode.y + DECISION_H / 2;
                  }
                } else {
                  fx = fixedNode.x + NODE_WIDTH;
                  fy = fixedNode.y + NODE_HEIGHT / 2;
                }
              }
              const hoverCond = reconnectHover?.condition;
              return (
                <g style={{ pointerEvents: "none" }}>
                  {/* Cursor dot */}
                  <circle
                    cx={reconnecting.mouseX} cy={reconnecting.mouseY}
                    r={reconnectHover ? 6 : 4}
                    fill={reconnectHover ? "#f59e0b" : "#f59e0b"}
                    opacity={reconnectHover ? 0.8 : 0.5}
                  />
                  {/* Condition badge near cursor when hovering a decision node */}
                  {hoverCond && (
                    <g>
                      <rect
                        x={reconnecting.mouseX + 10}
                        y={reconnecting.mouseY - 20}
                        width={28} height={18}
                        rx={4}
                        fill={hoverCond === "yes" ? "#22c55e" : "#ef4444"}
                        opacity={0.9}
                      />
                      <text
                        x={reconnecting.mouseX + 24}
                        y={reconnecting.mouseY - 8}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={10}
                        fontFamily="system-ui, sans-serif"
                        fontWeight="bold"
                      >
                        {hoverCond === "yes" ? "Sì" : "No"}
                      </text>
                    </g>
                  )}
                </g>
              );
            })()}
          </g>

          {/* Marquee selection rectangle (rendered in screen-space, outside the pan/zoom group) */}
          {marquee && (
            <rect
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
              fill={t.marqueeFill}
              stroke={t.marqueeStroke}
              strokeWidth={1}
              strokeDasharray="6,3"
              style={{ pointerEvents: "none" }}
            />
          )}
        </svg>

        {/* Edge label edit overlay */}
        {editingEdge && (
          <div
            className="absolute z-50"
            style={{
              left: Math.max(8, Math.min(editingEdge.x - 140, (canvasContainerRef.current?.clientWidth || 600) - 296)),
              top: Math.max(8, editingEdge.y - 16),
            }}
          >
            <div
              style={{
                width: 320,
                background: t.menuBg,
                border: `1px solid ${t.surfaceBorder}`,
                borderRadius: 12,
                boxShadow: `0 8px 32px ${t.shadowStrong}`,
                padding: "12px 14px 10px",
                fontFamily: "system-ui, sans-serif",
              }}
            >
              {/* Trigger field */}
              <label style={{ display: "block", color: t.textSecondary, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                Etichetta flusso
              </label>
              <input
                ref={edgeInputRef}
                type="text"
                value={editingEdge.value}
                onChange={(e) => setEditingEdge((prev) => prev ? { ...prev, value: e.target.value } : null)}
                onKeyDown={handleEdgeInputKeyDown}
                className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
                style={{
                  background: t.surface,
                  border: `1px solid ${t.accent}`,
                  color: t.text,
                }}
                placeholder="es. Click su Continua"
              />

              {/* Reason field */}
              <label style={{ display: "block", color: t.reasonHeaderText, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 10, marginBottom: 4 }}>
                💡 Razionale UX
              </label>
              <textarea
                value={editingEdge.reasonValue}
                onChange={(e) => setEditingEdge((prev) => prev ? { ...prev, reasonValue: e.target.value } : null)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditingEdge(null);
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitEdgeEdit(); }
                }}
                className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                rows={3}
                style={{
                  background: t.reasonBg,
                  border: `1px solid ${t.reasonBorder}`,
                  color: t.reasonText,
                  fontStyle: "italic",
                  resize: "vertical" as const,
                  minHeight: 48,
                  maxHeight: 180,
                }}
                placeholder="Perché questa transizione? (opzionale)"
              />

              {/* Flow type selector */}
              <label style={{ display: "block", color: t.textSecondary, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 10, marginBottom: 4 }}>
                Tipologia flusso
              </label>
              <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
                {(["happy", "secondary", "variant", "error", "skip"] as FlowType[]).map((type) => {
                  const isActive = editingEdge.flowType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setEditingEdge((prev) => prev ? { ...prev, flowType: type } : null)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all"
                      style={{
                        background: isActive ? FLOW_COLORS[type] + "22" : "transparent",
                        border: isActive ? `1px solid ${FLOW_COLORS[type]}55` : `1px solid ${t.surfaceBorder}`,
                        color: isActive ? FLOW_COLORS[type] : t.textMuted,
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: FLOW_COLORS[type], display: "inline-block", flexShrink: 0 }} />
                      {FLOW_LABELS[type]}
                    </button>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
                <button
                  onClick={() => {
                    const edgeId = editingEdge.connectionId;
                    setEditingEdge(null);
                    // Select the edge and trigger deletion
                    setSelectedItem({ type: "edge", id: edgeId });
                    setTimeout(() => {
                      const edgeToDelete = connections.find((c) => c.id === edgeId);
                      if (!edgeToDelete) return;
                      const src = screens.find((s) => s.id === edgeToDelete.sourceId);
                      const dst = screens.find((s) => s.id === edgeToDelete.destinationId);
                      const label = `connessione ${src?.name ?? "?"} → ${dst?.name ?? "?"}`;
                      pushUndo({ type: "deletion", screens: [], connections: [edgeToDelete], label });
                      setConnections((prev) => prev.filter((c) => c.id !== edgeId));
                      setSelectedItem(null);
                    }, 0);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors"
                  style={{ background: "transparent", border: `1px solid ${t.dangerBorder}`, color: t.dangerText, cursor: "pointer" }}
                  title="Elimina connessione"
                >
                  <Trash2 size={12} />
                  Elimina
                </button>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setEditingEdge(null)}
                    className="px-2.5 py-1 rounded-md text-xs"
                    style={{ background: "transparent", border: `1px solid ${t.surfaceBorder}`, color: t.textSecondary }}
                  >
                    Annulla
                  </button>
                  <button
                    onClick={commitEdgeEdit}
                    className="px-3 py-1 rounded-md text-xs"
                    style={{ background: t.accent, color: "#fff" }}
                  >
                    Salva
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 4 }}>
                <span style={{ color: t.textDim, fontSize: 9 }}>
                  Enter / ⌘↵ per salvare · Esc annulla
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar overlay - top right (grouped menus) */}
        <Toolbar
          onOpenLogicBuilder={() => setLogicBuilderOpen(true)}
          onOpenFlowBuilder={() => { setScannerUrl(lastMakeUrl || ""); }}
          onOpenTemplates={() => setTemplatesOpen(true)}
          onOpenFlowDoc={() => setFlowDocModalOpen(true)}
          onOpenValidator={() => setValidatorOpen(true)}
          onOpenJsonModal={() => setJsonModalOpen(true)}
          onExportPDF={handleExportPDF}
          onExportSVG={handleExportSVG}
          onExportZip={handleExportZip}
          onSmartLayout={handleSmartLayout}
          onSmartLayoutHorizontal={handleSmartLayoutHorizontal}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetView={resetView}
          onZoomToFit={zoomToFit}
          snapToGrid={snapToGrid}
          onToggleSnapToGrid={toggleSnapToGrid}
          showReasons={showReasons}
          onToggleReasons={() => setShowReasons((v) => !v)}
          reasonCount={connections.filter((c) => c.reason).length}
          hasScreens={screens.length > 0}
          zoom={zoom}
        />

        {/* Hint text — bottom edge, below toolbar */}
        <div
          className="absolute left-1/2 -translate-x-1/2 text-xs z-20"
          style={{ bottom: 10, color: t.textDim, whiteSpace: "nowrap" }}
        >
          {canvasMode === "select"
            ? "Click to select \u00b7 Drag to marquee \u00b7 Space to pan \u00b7 Pinch to zoom \u00b7 V / H to switch"
            : "Drag to pan \u00b7 Pinch to zoom \u00b7 V / H to switch"}
        </div>

        {/* Multi-selection badge */}
        {multiSelectedIds.size > 0 && (
          <div
            className="absolute left-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs"
            style={{ bottom: 100, transform: "translateX(-50%)", background: t.surface, border: `1px solid ${t.accent}`, color: t.accentLight, boxShadow: `0 8px 32px ${t.shadow}`, fontFamily: "system-ui, sans-serif" }}
          >
            <span style={{ whiteSpace: "nowrap" }}>{multiSelectedIds.size} nodi selezionati</span>
            <div className="w-px h-5" style={{ background: t.surfaceBorder }} />
            <AlignToolbar onAlign={handleAlign} count={multiSelectedIds.size} />
            <div className="w-px h-5" style={{ background: t.surfaceBorder }} />
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-1 px-2 py-0.5 rounded transition-colors"
              style={{ background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, color: t.dangerText }}
              title="Elimina nodi selezionati (Delete/Backspace)"
            >
              <Trash2 size={12} />
              Elimina
            </button>
            <button
              onClick={() => { setMultiSelectedIds(new Set()); setSelectedItem(null); }}
              className="ml-1 hover:text-white"
              style={{ color: t.textMuted, background: "none", border: "none", cursor: "pointer" }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Section selection toolbar */}
        {selectedSectionId && !editingSectionId && (() => {
          const sec = sections.find((s) => s.id === selectedSectionId);
          if (!sec) return null;
          // Count nodes inside this section (center-based)
          const nodesInsideCount = screens.filter((n) => {
            const nw = NODE_WIDTH;
            const nh = n.type === "decision" ? DECISION_H : NODE_HEIGHT;
            const cx = n.x + nw / 2;
            const cy = n.y + nh / 2;
            return cx >= sec.x && cx <= sec.x + sec.width && cy >= sec.y && cy <= sec.y + sec.height;
          }).length;
          return (
            <div
              className="absolute left-1/2 z-40 flex flex-col items-stretch rounded-lg text-xs"
              style={{ bottom: 100, transform: "translateX(-50%)", background: t.surface, border: `1px solid ${sec.color}`, boxShadow: `0 8px 32px ${t.shadow}`, fontFamily: "system-ui, sans-serif", minWidth: 260 }}
            >
              {/* Main row */}
              <div className="flex items-center gap-2 px-4 py-2">
                {/* Section name */}
                <span style={{ whiteSpace: "nowrap", color: sec.color, fontWeight: 600 }}>{sec.name}</span>
                <div className="w-px h-5" style={{ background: t.surfaceBorder }} />
                {/* Rename */}
                <button
                  onClick={() => setEditingSectionId(sec.id)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded transition-colors"
                  style={{ background: "transparent", border: `1px solid ${t.surfaceBorder}`, color: t.textPrimary, cursor: "pointer" }}
                  title="Rinomina sezione"
                >
                  <Pencil size={12} />
                  Rinomina
                </button>
                {/* Auto-fit button */}
                <button
                  onClick={() => handleSectionAutoFit(sec.id)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded transition-colors"
                  style={{
                    background: nodesInsideCount > 0 ? `${sec.color}14` : "transparent",
                    border: `1px solid ${nodesInsideCount > 0 ? sec.color + "55" : t.surfaceBorder}`,
                    color: nodesInsideCount > 0 ? sec.color : t.textDim,
                    cursor: nodesInsideCount > 0 ? "pointer" : "not-allowed",
                    opacity: nodesInsideCount > 0 ? 1 : 0.5,
                  }}
                  disabled={nodesInsideCount === 0}
                  title={nodesInsideCount > 0 ? `Adatta ai ${nodesInsideCount} nodi contenuti` : "Nessun nodo nella sezione"}
                >
                  <Maximize2 size={12} />
                  Adatta
                </button>
                {/* Color accordion trigger */}
                <button
                  onClick={() => setSectionColorOpen((v) => !v)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded transition-colors"
                  style={{ background: "transparent", border: `1px solid ${t.surfaceBorder}`, color: t.textPrimary, cursor: "pointer" }}
                  title="Cambia colore"
                >
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: sec.color, flexShrink: 0, border: "1px solid rgba(255,255,255,0.3)" }} />
                  Colore
                  <ChevronDown size={10} style={{ transform: sectionColorOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
                </button>
                <div className="w-px h-5" style={{ background: t.surfaceBorder }} />
                {/* Delete */}
                <button
                  onClick={handleDeleteSection}
                  className="flex items-center gap-1 px-2 py-0.5 rounded transition-colors"
                  style={{ background: t.dangerBg, border: `1px solid ${t.dangerBorder}`, color: t.dangerText, cursor: "pointer" }}
                  title="Elimina sezione (Delete)"
                >
                  <Trash2 size={12} />
                  Elimina
                </button>
                <button
                  onClick={() => setSelectedSectionId(null)}
                  style={{ color: t.textMuted, background: "none", border: "none", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
              {/* Color picker accordion */}
              {sectionColorOpen && (
                <div className="flex items-center gap-1.5 px-4 py-2" style={{ borderTop: `1px solid ${t.surfaceBorder}` }}>
                  {SECTION_COLORS.map((col) => (
                    <button
                      key={col}
                      onClick={() => {
                        const oldName = sec.name;
                        const oldColor = sec.color;
                        if (col === sec.color) return;
                        pushUndo({ type: "edit_section", sectionId: sec.id, oldName, oldColor, newName: sec.name, newColor: col, label: `colore sezione "${sec.name}"` });
                        setSections((prev) => prev.map((s) => s.id === sec.id ? { ...s, color: col } : s));
                      }}
                      style={{
                        width: 18, height: 18, borderRadius: "50%", background: col,
                        border: col === sec.color ? "2px solid #fff" : "1px solid transparent",
                        boxShadow: col === sec.color ? `0 0 0 1.5px ${col}` : "none",
                        cursor: "pointer", flexShrink: 0, transition: "transform 0.1s",
                      }}
                      title={col}
                      onMouseEnter={(e) => { (e.currentTarget.style.transform = "scale(1.2)"); }}
                      onMouseLeave={(e) => { (e.currentTarget.style.transform = "scale(1)"); }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Section inline rename overlay */}
        {editingSectionId && (() => {
          const sec = sections.find((s) => s.id === editingSectionId);
          if (!sec) return null;
          // Position: near section on-screen
          const screenX = sec.x * zoom + pan.x + 12;
          const screenY = sec.y * zoom + pan.y + 2;
          return (
            <div
              className="absolute z-50"
              style={{ left: Math.max(8, screenX), top: Math.max(8, screenY) }}
            >
              <input
                autoFocus
                defaultValue={sec.name}
                className="px-3 py-1.5 rounded-lg text-sm outline-none"
                style={{
                  background: t.menuBg,
                  border: `2px solid ${sec.color}`,
                  color: t.text,
                  minWidth: 180,
                  fontWeight: 600,
                  boxShadow: `0 4px 20px ${t.shadow}`,
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const val = (e.target as HTMLInputElement).value.trim() || sec.name;
                    if (val !== sec.name) {
                      pushUndo({ type: "edit_section", sectionId: sec.id, oldName: sec.name, oldColor: sec.color, newName: val, newColor: sec.color, label: `nome sezione "${sec.name}" → "${val}"` });
                      setSections((prev) => prev.map((s) => s.id === sec.id ? { ...s, name: val } : s));
                    }
                    setEditingSectionId(null);
                  }
                  if (e.key === "Escape") setEditingSectionId(null);
                }}
                onBlur={(e) => {
                  const val = e.target.value.trim() || sec.name;
                  if (val !== sec.name) {
                    pushUndo({ type: "edit_section", sectionId: sec.id, oldName: sec.name, oldColor: sec.color, newName: val, newColor: sec.color, label: `nome sezione "${sec.name}" → "${val}"` });
                    setSections((prev) => prev.map((s) => s.id === sec.id ? { ...s, name: val } : s));
                  }
                  setEditingSectionId(null);
                }}
              />
            </div>
          );
        })()}



        {/* Empty state */}
        {screens.length === 0 && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div style={{ color: t.surfaceBorder, fontSize: 48 }}>&#x2B21;</div>
            <div className="mt-3 text-sm" style={{ color: t.textDim }}>
              Enter a Figma URL, Make site link, or type "mock" to get started
            </div>
          </div>
        )}

        {/* Node Palette — drag & drop to create nodes */}
        <NodePalette
          onDragMove={setPaletteDrag}
          onDrop={handlePaletteDrop}
          canvasRef={canvasContainerRef}
          zoom={zoom}
          pan={pan}
          snapToGrid={snapToGrid}
          canvasMode={canvasMode}
          onSetCanvasMode={setCanvasMode}
          sectionMode={sectionMode}
          onToggleSectionMode={toggleSectionMode}
        />

        {/* Palette drag ghost — rendered as a fixed-position overlay */}
        {paletteDrag && (
          <div
            className="fixed pointer-events-none z-50"
            style={{
              left: paletteDrag.screenX,
              top: paletteDrag.screenY,
              transform: "translate(-50%, -50%)",
            }}
          >
            <svg
              width={paletteDrag.kind === "decision" ? 80 : 72}
              height={paletteDrag.kind === "decision" ? 60 : 100}
              style={{ opacity: 0.7, filter: "drop-shadow(0 4px 12px rgba(99,102,241,0.4))" }}
            >
              {paletteDrag.kind === "decision" ? (
                <>
                  <polygon
                    points="40,2 78,30 40,58 2,30"
                    fill={t.decisionFill}
                    stroke={t.decisionStroke}
                    strokeWidth={2}
                  />
                  <text x={40} y={33} textAnchor="middle" fill={t.decisionText} fontSize={10} fontFamily="system-ui">
                    ?
                  </text>
                </>
              ) : (
                <>
                  <rect x={1} y={1} width={70} height={98} rx={6} fill={t.nodeFill} stroke={t.accent} strokeWidth={2} />
                  <rect x={6} y={6} width={60} height={8} rx={3} fill={t.surfaceBorder} />
                  <rect x={6} y={18} width={60} height={50} rx={3} fill={t.nodeThumbBgAlt} />
                  <rect x={14} y={75} width={44} height={6} rx={2} fill={t.accent} opacity={0.4} />
                  <rect x={14} y={85} width={30} height={5} rx={2} fill={t.textDim} opacity={0.3} />
                </>
              )}
            </svg>
          </div>
        )}

        {/* Unified Undo/Redo toast */}
        {undoToast && (
          <div
            className="absolute left-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs"
            style={{
              bottom: (selectedSectionId && !editingSectionId)
                ? (multiSelectedIds.size > 0 ? 190 : 150)
                : (multiSelectedIds.size > 0 ? 148 : 108),
              transform: "translateX(-50%)",
              transition: "bottom 0.15s ease",
              background: t.surface,
              border: `1px solid ${undoToast.icon === "trash" ? t.dangerBorder : t.accent}`,
              boxShadow: `0 8px 32px ${t.shadow}`,
              color: t.textPrimary,
              fontFamily: "system-ui, sans-serif",
            }}
          >
            {/* Icon */}
            {undoToast.icon === "trash" && <Trash2 size={14} style={{ color: t.dangerText, flexShrink: 0 }} />}
            {undoToast.icon === "link" && <Undo2 size={14} style={{ color: "#f59e0b", flexShrink: 0 }} />}
            {undoToast.icon === "edit" && <Pencil size={14} style={{ color: t.accent, flexShrink: 0 }} />}

            {/* Message */}
            <span style={{ whiteSpace: "nowrap" }}>{undoToast.message}</span>

            {/* Undo button */}
            {undoStack.length > 0 && (
              <button
                onClick={handleUndo}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors"
                style={{ background: "transparent", color: t.accentLight, border: `1px solid ${t.accent}`, cursor: "pointer" }}
                title="Annulla (⌘Z)"
              >
                <Undo2 size={12} />
                Annulla
              </button>
            )}

            {/* Redo button */}
            {redoStack.length > 0 && (
              <button
                onClick={handleRedo}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors"
                style={{ background: "transparent", color: t.accentLight, border: `1px solid ${t.accent}`, cursor: "pointer" }}
                title="Ripeti (⌘⇧Z)"
              >
                <Redo2 size={12} />
                Ripeti
              </button>
            )}

            {/* Close */}
            <button
              onClick={() => {
                if (undoToastTimer.current) clearTimeout(undoToastTimer.current);
                setUndoToast(null);
              }}
              style={{ color: t.textDim, cursor: "pointer", background: "none", border: "none" }}
              title="Chiudi"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Screen preview modal */}
      {previewScreenId && (
        <ScreenPreviewModal
          initialScreenId={previewScreenId}
          connections={connections}
          screens={screens}
          onClose={() => setPreviewScreenId(null)}
          onSelectScreen={(id) => setSelectedItem({ type: "node", id })}
          onUpdateScreen={handleUpdateScreen}
        />
      )}

      {/* Figma Make Flow Builder modal */}
      {scannerUrl !== null && (
        <MakePageScanner
          baseUrl={scannerUrl}
          onClose={() => setScannerUrl(null)}
          onConfirm={handleScannerConfirm}
        />
      )}

      {/* Logic Flow Builder modal */}
      {logicBuilderOpen && (
        <LogicFlowBuilder
          onConfirm={handleLogicFlowConfirm}
          onClose={() => setLogicBuilderOpen(false)}
          initialScreens={screens.length > 0 ? screens : undefined}
          initialConnections={connections.length > 0 ? connections : undefined}
        />
      )}

      {/* Flow Validator modal */}
      {validatorOpen && (
        <FlowValidator
          screens={screens}
          connections={connections}
          onClose={() => setValidatorOpen(false)}
          onSelectNode={(id) => setSelectedItem({ type: "node", id })}
          onSelectEdge={(id) => setSelectedItem({ type: "edge", id })}
        />
      )}

      {/* Flow Templates modal */}
      {templatesOpen && (
        <FlowTemplates
          onConfirm={handleTemplateConfirm}
          onClose={() => setTemplatesOpen(false)}
        />
      )}

      {/* JSON Import/Export modal */}
      {jsonModalOpen && (
        <JsonImportExport
          screens={screens}
          connections={connections}
          onImport={handleJsonImport}
          onClose={() => setJsonModalOpen(false)}
        />
      )}

      {/* FlowDoc Import/Export modal */}
      {flowDocModalOpen && (
        <FlowDocReader
          screens={screens}
          connections={connections}
          onImport={handleFlowDocImport}
          onClose={() => setFlowDocModalOpen(false)}
        />
      )}

      {/* Loading overlay */}
      <LoadingOverlay
        visible={loading}
        progress={loadingProgress}
        alerts={loadingAlerts}
        onDismissAlert={dismissAlert}
      />
    </div>
  );
}

export default function App() {
  // FlowMapper — interactive user flow diagramming tool
  return (
    <FlowMapperThemeProvider>
      <AppInner />
    </FlowMapperThemeProvider>
  );
}