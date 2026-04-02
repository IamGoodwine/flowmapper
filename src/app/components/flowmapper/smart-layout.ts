import type { Screen, Connection } from "./types";
import { NODE_WIDTH, NODE_HEIGHT, DECISION_H } from "./types";

/* ================================================================
   Smart Layout v2 — Flow-aware layered graph drawing
   ================================================================
   Designed for funnel / wizard flows with a clear "spine" and
   branches.  Key differences from generic Sugiyama:
   
   1. Back-edges (navigation-back, guards, loop-closers) are
      detected via DFS and EXCLUDED from layer assignment so the
      main flow always goes top → bottom.
   2. NO layer compaction — nodes keep their proper depth.
   3. NO virtual (dummy) nodes — unnecessary for ≤ 50 real nodes
      and they distort spacing.
   4. Happy-path edges are weighted 3× in the barycenter so the
      main spine stays straight.
   5. Generous per-layer spacing computed from actual node sizes.
   6. Connected components are laid out side-by-side.
   ================================================================ */

// ── Spacing ──────────────────────────────────────────────────────
const H_GAP  = 80;   // min horizontal gap between bounding boxes (vertical layout)
const V_GAP  = 70;   // min vertical gap between layer rows (vertical layout)
const COMP_GAP = 140; // gap between disconnected components

// Horizontal-specific spacing — columns need more room for edge labels & reasons
const H_GAP_HORIZ  = 180;  // column-to-column gap (horizontal layout)
const V_GAP_HORIZ  = 90;   // row gap inside each column (horizontal layout)

/** Bounding height including label area */
function nodeH(s: Screen): number {
  return (s.nodeKind === "decision" ? DECISION_H : NODE_HEIGHT) + 35;
}
/** Bounding width including port / label clearance */
function nodeW(_s: Screen): number {
  return NODE_WIDTH + 40;
}

// ── Helpers ──────────────────────────────────────────────────────
type Adj = Map<string, Set<string>>;

function buildAdj(ids: Set<string>, connections: Connection[]): {
  fwd: Adj; rev: Adj; conns: Connection[];
} {
  const fwd: Adj = new Map();
  const rev: Adj = new Map();
  for (const id of ids) { fwd.set(id, new Set()); rev.set(id, new Set()); }
  const conns: Connection[] = [];
  for (const c of connections) {
    if (!ids.has(c.sourceId) || !ids.has(c.destinationId)) continue;
    if (c.sourceId === c.destinationId) continue;
    // Dedupe: only keep first edge per (src, dst) pair
    if (fwd.get(c.sourceId)!.has(c.destinationId)) { conns.push(c); continue; }
    fwd.get(c.sourceId)!.add(c.destinationId);
    rev.get(c.destinationId)!.add(c.sourceId);
    conns.push(c);
  }
  return { fwd, rev, conns };
}

// ── 1. Detect back-edges via DFS ─────────────────────────────────
/** Returns the set of (sourceId, destinationId) keys that are back-edges */
function detectBackEdges(ids: Set<string>, fwd: Adj): Set<string> {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of ids) color.set(id, WHITE);
  const backEdgeKeys = new Set<string>();

  function dfs(u: string) {
    color.set(u, GRAY);
    for (const v of fwd.get(u) || []) {
      if (color.get(v) === GRAY) {
        backEdgeKeys.add(`${u}→${v}`);
      } else if (color.get(v) === WHITE) {
        dfs(v);
      }
    }
    color.set(u, BLACK);
  }

  // Start DFS from nodes with in-degree 0, then remaining
  const hasIncoming = new Set<string>();
  for (const [, targets] of fwd) {
    for (const t of targets) hasIncoming.add(t);
  }
  for (const id of ids) {
    if (!hasIncoming.has(id) && color.get(id) === WHITE) dfs(id);
  }
  for (const id of ids) {
    if (color.get(id) === WHITE) dfs(id);
  }

  return backEdgeKeys;
}

// ── 2. Layer assignment (longest-path, forward edges only) ───────
function assignLayers(
  ids: Set<string>,
  fwd: Adj,
  backEdgeKeys: Set<string>,
): Map<string, number> {
  // Build forward-only adjacency and in-degrees
  const fwdOnly: Adj = new Map();
  const inDeg = new Map<string, number>();
  for (const id of ids) { fwdOnly.set(id, new Set()); inDeg.set(id, 0); }

  for (const [u, targets] of fwd) {
    for (const v of targets) {
      if (backEdgeKeys.has(`${u}→${v}`)) continue;
      if (!ids.has(v)) continue;
      fwdOnly.get(u)!.add(v);
      inDeg.set(v, (inDeg.get(v) || 0) + 1);
    }
  }

  // Kahn's algorithm giving longest-path layers
  const layers = new Map<string, number>();
  const queue: string[] = [];
  for (const id of ids) {
    if (inDeg.get(id) === 0) { layers.set(id, 0); queue.push(id); }
  }

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    const uL = layers.get(u)!;
    for (const v of fwdOnly.get(u)!) {
      const cur = layers.get(v);
      if (cur === undefined || cur < uL + 1) layers.set(v, uL + 1);
      inDeg.set(v, inDeg.get(v)! - 1);
      if (inDeg.get(v) === 0) queue.push(v);
    }
  }

  // Assign remaining (in pure cycles) to layer 0
  for (const id of ids) {
    if (!layers.has(id)) layers.set(id, 0);
  }
  return layers;
}

// ── 3. Build layer groups ────────────────────────────────────────
function buildLayerGroups(layers: Map<string, number>): { groups: Map<number, string[]>; maxLayer: number } {
  const groups = new Map<number, string[]>();
  let maxLayer = 0;
  for (const [id, l] of layers) {
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l)!.push(id);
    if (l > maxLayer) maxLayer = l;
  }
  // Ensure every layer 0..max exists
  for (let l = 0; l <= maxLayer; l++) {
    if (!groups.has(l)) groups.set(l, []);
  }
  return { groups, maxLayer };
}

// ── 4. Crossing minimisation — weighted barycenter ───────────────
function minimiseCrossings(
  groups: Map<number, string[]>,
  maxLayer: number,
  connections: Connection[],
  layers: Map<string, number>,
  backEdgeKeys: Set<string>,
  iterations = 24,
) {
  // Adjacency with weights — happy edges count 3×
  interface WEdge { peer: string; weight: number; }
  const childrenOf = new Map<string, WEdge[]>();
  const parentsOf  = new Map<string, WEdge[]>();

  for (const c of connections) {
    const key = `${c.sourceId}→${c.destinationId}`;
    const sL = layers.get(c.sourceId);
    const dL = layers.get(c.destinationId);
    if (sL === undefined || dL === undefined) continue;
    // Only use edges that go from lower to higher layer (forward in the DAG)
    // Back-edges are excluded for ordering
    if (backEdgeKeys.has(key)) continue;
    if (sL >= dL) continue; // same-layer or backwards → skip
    const w = c.flowType === "happy" ? 3 : 1;
    if (!childrenOf.has(c.sourceId)) childrenOf.set(c.sourceId, []);
    childrenOf.get(c.sourceId)!.push({ peer: c.destinationId, weight: w });
    if (!parentsOf.has(c.destinationId)) parentsOf.set(c.destinationId, []);
    parentsOf.get(c.destinationId)!.push({ peer: c.sourceId, weight: w });
  }

  const orderOf = new Map<string, number>();
  function refreshOrders() {
    for (const [, nodes] of groups) {
      nodes.forEach((id, i) => orderOf.set(id, i));
    }
  }
  refreshOrders();

  function wBarycenter(edges: WEdge[] | undefined, fallback: number): number {
    if (!edges || edges.length === 0) return fallback;
    let sumW = 0, sumPos = 0;
    for (const e of edges) {
      const pos = orderOf.get(e.peer) ?? 0;
      sumPos += pos * e.weight;
      sumW += e.weight;
    }
    return sumW > 0 ? sumPos / sumW : fallback;
  }

  for (let iter = 0; iter < iterations; iter++) {
    if (iter % 2 === 0) {
      // Down sweep
      for (let l = 1; l <= maxLayer; l++) {
        const nodes = groups.get(l)!;
        if (nodes.length <= 1) continue;
        nodes.sort((a, b) => {
          const ba = wBarycenter(parentsOf.get(a), orderOf.get(a) ?? 0);
          const bb = wBarycenter(parentsOf.get(b), orderOf.get(b) ?? 0);
          return ba - bb;
        });
        refreshOrders();
      }
    } else {
      // Up sweep
      for (let l = maxLayer - 1; l >= 0; l--) {
        const nodes = groups.get(l)!;
        if (nodes.length <= 1) continue;
        nodes.sort((a, b) => {
          const ba = wBarycenter(childrenOf.get(a), orderOf.get(a) ?? 0);
          const bb = wBarycenter(childrenOf.get(b), orderOf.get(b) ?? 0);
          return ba - bb;
        });
        refreshOrders();
      }
    }
  }
}

// ── 5. X-coordinate assignment ───────────────────────────────────
function assignX(
  groups: Map<number, string[]>,
  maxLayer: number,
  connections: Connection[],
  layers: Map<string, number>,
  backEdgeKeys: Set<string>,
  screenMap: Map<string, Screen>,
): Map<string, number> {
  // Build forward adjacency with weights
  interface WEdge { peer: string; weight: number; }
  const neighborsOf = new Map<string, WEdge[]>();

  for (const c of connections) {
    const key = `${c.sourceId}→${c.destinationId}`;
    if (backEdgeKeys.has(key)) continue;
    const sL = layers.get(c.sourceId);
    const dL = layers.get(c.destinationId);
    if (sL === undefined || dL === undefined) continue;
    if (sL >= dL) continue;
    const w = c.flowType === "happy" ? 3 : 1;
    if (!neighborsOf.has(c.sourceId)) neighborsOf.set(c.sourceId, []);
    neighborsOf.get(c.sourceId)!.push({ peer: c.destinationId, weight: w });
    if (!neighborsOf.has(c.destinationId)) neighborsOf.set(c.destinationId, []);
    neighborsOf.get(c.destinationId)!.push({ peer: c.sourceId, weight: w });
  }

  function getW(id: string): number {
    const s = screenMap.get(id);
    return s ? nodeW(s) : NODE_WIDTH + 40;
  }

  const xPos = new Map<string, number>();

  // Initial placement: equally spaced, centred at 0 per layer
  for (let l = 0; l <= maxLayer; l++) {
    const nodes = groups.get(l)!;
    let totalW = 0;
    for (const id of nodes) totalW += getW(id);
    totalW += Math.max(0, nodes.length - 1) * H_GAP;
    let cx = -totalW / 2;
    for (const id of nodes) {
      const w = getW(id);
      xPos.set(id, cx + w / 2);
      cx += w + H_GAP;
    }
  }

  // Iterative barycenter-based X refinement
  for (let pass = 0; pass < 30; pass++) {
    let totalShift = 0;
    const down = pass % 2 === 0;

    for (
      let l = down ? 0 : maxLayer;
      down ? l <= maxLayer : l >= 0;
      l += down ? 1 : -1
    ) {
      const nodes = groups.get(l)!;
      if (nodes.length === 0) continue;

      // Move each node toward weighted average of its neighbours
      for (const id of nodes) {
        const edges = neighborsOf.get(id);
        if (!edges || edges.length === 0) continue;
        let sumW = 0, sumPos = 0;
        for (const e of edges) {
          const px = xPos.get(e.peer);
          if (px !== undefined) { sumPos += px * e.weight; sumW += e.weight; }
        }
        if (sumW === 0) continue;
        const desired = sumPos / sumW;
        const current = xPos.get(id)!;
        const next = current + (desired - current) * 0.55;
        totalShift += Math.abs(next - current);
        xPos.set(id, next);
      }

      // Enforce minimum spacing left → right
      for (let i = 1; i < nodes.length; i++) {
        const p = nodes[i - 1], c = nodes[i];
        const minDist = (getW(p) + getW(c)) / 2 + H_GAP;
        if (xPos.get(c)! - xPos.get(p)! < minDist) {
          xPos.set(c, xPos.get(p)! + minDist);
        }
      }
      // … and right → left
      for (let i = nodes.length - 2; i >= 0; i--) {
        const c = nodes[i], n = nodes[i + 1];
        const minDist = (getW(c) + getW(n)) / 2 + H_GAP;
        if (xPos.get(n)! - xPos.get(c)! < minDist) {
          xPos.set(c, xPos.get(n)! - minDist);
        }
      }
    }
    if (totalShift < 0.5) break;
  }

  return xPos;
}

// ── 6. Y-coordinate assignment ───────────────────────────────────
function assignY(
  groups: Map<number, string[]>,
  maxLayer: number,
  screenMap: Map<string, Screen>,
): { layerY: Map<number, number>; layerMaxH: Map<number, number> } {
  const layerY = new Map<number, number>();
  const layerMaxH = new Map<number, number>();
  let cy = 0;
  for (let l = 0; l <= maxLayer; l++) {
    layerY.set(l, cy);
    const nodes = groups.get(l)!;
    let maxH = 60; // minimum layer height
    for (const id of nodes) {
      const s = screenMap.get(id);
      if (s) { const h = nodeH(s); if (h > maxH) maxH = h; }
    }
    layerMaxH.set(l, maxH);
    cy += maxH + V_GAP;
  }
  return { layerY, layerMaxH };
}

// ── Connected components ─────────────────────────────────────────
function findComponents(ids: Set<string>, fwd: Adj, rev: Adj): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];
  function bfs(start: string): string[] {
    const comp: string[] = [];
    const q = [start];
    visited.add(start);
    while (q.length > 0) {
      const u = q.shift()!;
      comp.push(u);
      for (const v of fwd.get(u) || []) {
        if (!visited.has(v) && ids.has(v)) { visited.add(v); q.push(v); }
      }
      for (const v of rev.get(u) || []) {
        if (!visited.has(v) && ids.has(v)) { visited.add(v); q.push(v); }
      }
    }
    return comp;
  }
  for (const id of ids) {
    if (!visited.has(id)) components.push(bfs(id));
  }
  components.sort((a, b) => b.length - a.length);
  return components;
}

// ── Final overlap resolution (safety net) ────────────────────────
function resolveOverlaps(screens: Screen[]) {
  const PAD = 25;
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < screens.length; i++) {
      for (let j = i + 1; j < screens.length; j++) {
        const a = screens[i], b = screens[j];
        const aw = nodeW(a), ah = nodeH(a);
        const bw = nodeW(b), bh = nodeH(b);
        const ax = a.x - (aw - NODE_WIDTH) / 2, ay = a.y;
        const bx = b.x - (bw - NODE_WIDTH) / 2, by = b.y;
        if (ax + aw + PAD <= bx || bx + bw + PAD <= ax ||
            ay + ah + PAD <= by || by + bh + PAD <= ay) continue;
        moved = true;
        const oX = Math.min(ax + aw + PAD, bx + bw + PAD) - Math.max(ax, bx);
        const oY = Math.min(ay + ah + PAD, by + bh + PAD) - Math.max(ay, by);
        if (oX < oY) {
          const push = oX / 2 + 2;
          if (a.x <= b.x) { a.x -= push; b.x += push; }
          else             { a.x += push; b.x -= push; }
        } else {
          const push = oY / 2 + 2;
          if (a.y <= b.y) { a.y -= push; b.y += push; }
          else             { a.y += push; b.y -= push; }
        }
      }
    }
    if (!moved) break;
  }
}

// ══════════════════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════════════════

export type LayoutOrientation = "vertical" | "horizontal";

export function smartLayout(
  screens: Screen[],
  connections: Connection[],
  orientation: LayoutOrientation = "vertical",
): Screen[] {
  if (screens.length === 0) return screens;
  if (screens.length === 1) { screens[0].x = 0; screens[0].y = 0; return screens; }

  const screenMap = new Map(screens.map(s => [s.id, s]));
  const ids = new Set(screens.map(s => s.id));
  const { fwd, rev, conns } = buildAdj(ids, connections);

  const components = findComponents(ids, fwd, rev);
  let globalOffset = 0; // offset along the cross-axis (X for vertical, Y for horizontal)

  for (const compIds of components) {
    if (compIds.length === 0) continue;
    const compSet = new Set(compIds);

    // Subset of connections inside this component
    const compConns = conns.filter(c => compSet.has(c.sourceId) && compSet.has(c.destinationId));

    // Build component-local adjacency
    const compFwd: Adj = new Map();
    const compRev: Adj = new Map();
    for (const id of compIds) { compFwd.set(id, new Set()); compRev.set(id, new Set()); }
    for (const c of compConns) {
      compFwd.get(c.sourceId)!.add(c.destinationId);
      compRev.get(c.destinationId)!.add(c.sourceId);
    }

    // 1. Detect back-edges
    const backEdgeKeys = detectBackEdges(compSet, compFwd);

    // 2. Layer assignment (forward edges only)
    const layers = assignLayers(compSet, compFwd, backEdgeKeys);

    // 3. Build layer groups
    const { groups, maxLayer } = buildLayerGroups(layers);

    // 4. Crossing minimisation
    minimiseCrossings(groups, maxLayer, compConns, layers, backEdgeKeys, 28);

    // 5 & 6. Position assignment depends on orientation
    if (orientation === "vertical") {
      // Vertical: layers = rows (Y), position within layer = X
      const xPos = assignX(groups, maxLayer, compConns, layers, backEdgeKeys, screenMap);
      const { layerY, layerMaxH } = assignY(groups, maxLayer, screenMap);

      let compMinX = Infinity, compMaxX = -Infinity;
      for (const id of compIds) {
        const s = screenMap.get(id)!;
        const x = xPos.get(id) ?? 0;
        const l = layers.get(id) ?? 0;
        const actualH = s.nodeKind === "decision" ? DECISION_H : NODE_HEIGHT;
        const rowMaxH = layerMaxH.get(l) ?? actualH;
        s.x = x - NODE_WIDTH / 2;
        // Center vertically within the row (align midpoints)
        s.y = (layerY.get(l) ?? 0) + (rowMaxH - actualH) / 2;
        if (s.x < compMinX) compMinX = s.x;
        if (s.x + NODE_WIDTH > compMaxX) compMaxX = s.x + NODE_WIDTH;
      }

      const shift = globalOffset - compMinX;
      for (const id of compIds) screenMap.get(id)!.x += shift;
      globalOffset = compMaxX + shift + COMP_GAP;
    } else {
      // Horizontal: layers = columns (X), position within layer = Y
      // Reuse crossing-minimised groups; assign Y within each column, X per column
      const yWithinLayer = assignXAsY(groups, maxLayer, compConns, layers, backEdgeKeys, screenMap);
      const colX = assignXColumns(groups, maxLayer, screenMap);

      // ── Center-of-load vertical alignment ──────────────────────
      // Find the "anchor" node per column: prefer the happy-path node
      // (most connected via happy edges), fallback to column centroid.
      // Then align all columns so their anchors share a common Y.

      // Build a set of happy-path node IDs (nodes that participate in ≥1 happy edge)
      const happyScore = new Map<string, number>();
      for (const c of compConns) {
        if (c.flowType === "happy") {
          happyScore.set(c.sourceId, (happyScore.get(c.sourceId) || 0) + 1);
          happyScore.set(c.destinationId, (happyScore.get(c.destinationId) || 0) + 1);
        }
      }

      // Per-column anchor Y and the shift needed
      const anchorYs: number[] = [];
      const columnAnchors = new Map<number, { anchorY: number }>();

      for (let l = 0; l <= maxLayer; l++) {
        const nodes = groups.get(l)!;
        if (nodes.length === 0) continue;

        // Pick the node with the highest happy-score as the anchor
        let bestId = nodes[0];
        let bestScore = happyScore.get(nodes[0]) || 0;
        for (const id of nodes) {
          const sc = happyScore.get(id) || 0;
          if (sc > bestScore) { bestScore = sc; bestId = id; }
        }
        const anchorY = yWithinLayer.get(bestId) ?? 0;
        columnAnchors.set(l, { anchorY });
        anchorYs.push(anchorY);
      }

      // Global centroid of all anchor Y values
      const globalAnchorY = anchorYs.length > 0
        ? anchorYs.reduce((a, b) => a + b, 0) / anchorYs.length
        : 0;

      // Shift each column so its anchor aligns with the global centroid
      for (let l = 0; l <= maxLayer; l++) {
        const nodes = groups.get(l)!;
        const col = columnAnchors.get(l);
        if (!col || nodes.length === 0) continue;
        const dy = globalAnchorY - col.anchorY;
        if (Math.abs(dy) < 0.5) continue;
        for (const id of nodes) {
          yWithinLayer.set(id, (yWithinLayer.get(id) ?? 0) + dy);
        }
      }

      // Re-enforce minimum spacing within each column after alignment shift
      for (let l = 0; l <= maxLayer; l++) {
        const nodes = groups.get(l)!;
        if (nodes.length <= 1) continue;
        // Sort by Y so spacing enforcement is ordered
        nodes.sort((a, b) => (yWithinLayer.get(a) ?? 0) - (yWithinLayer.get(b) ?? 0));
        for (let i = 1; i < nodes.length; i++) {
          const p = nodes[i - 1], c = nodes[i];
          const pH = screenMap.get(p) ? nodeH(screenMap.get(p)!) : NODE_HEIGHT + 35;
          const cH = screenMap.get(c) ? nodeH(screenMap.get(c)!) : NODE_HEIGHT + 35;
          const minDist = (pH + cH) / 2 + V_GAP_HORIZ;
          const py = yWithinLayer.get(p) ?? 0;
          const cy = yWithinLayer.get(c) ?? 0;
          if (cy - py < minDist) {
            yWithinLayer.set(c, py + minDist);
          }
        }
      }

      // ── Vertical centering: place spine at midpoint of total extent ──
      // After alignment the spine (anchor nodes) sit at globalAnchorY but
      // branches only hang below, pushing the spine to the top.  Re-center
      // so the spine sits at the vertical midpoint of the bounding box.
      {
        let allMinY = Infinity, allMaxY = -Infinity;
        for (const id of compIds) {
          const yVal = yWithinLayer.get(id) ?? 0;
          const s = screenMap.get(id)!;
          const hh = nodeH(s) / 2;
          if (yVal - hh < allMinY) allMinY = yVal - hh;
          if (yVal + hh > allMaxY) allMaxY = yVal + hh;
        }
        // Compute actual spine Y (average of anchor Ys after all shifts)
        let spineSum = 0, spineCnt = 0;
        for (let l = 0; l <= maxLayer; l++) {
          const col = columnAnchors.get(l);
          if (!col) continue;
          // Recalculate anchor Y after alignment shifts
          const nodes = groups.get(l)!;
          let bestId = nodes[0];
          let bestScore = happyScore.get(nodes[0]) || 0;
          for (const nid of nodes) {
            const sc = happyScore.get(nid) || 0;
            if (sc > bestScore) { bestScore = sc; bestId = nid; }
          }
          spineSum += yWithinLayer.get(bestId) ?? 0;
          spineCnt++;
        }
        const spineY = spineCnt > 0 ? spineSum / spineCnt : 0;
        const midY = (allMinY + allMaxY) / 2;
        const centerShift = midY - spineY;
        // Apply: shift all nodes so spine moves to midY
        if (Math.abs(centerShift) > 0.5) {
          for (const id of compIds) {
            yWithinLayer.set(id, (yWithinLayer.get(id) ?? 0) + centerShift);
          }
        }
      }

      // ── Apply positions to screens ─────────────────────────────
      let compMinY = Infinity, compMaxY = -Infinity;
      for (const id of compIds) {
        const s = screenMap.get(id)!;
        const yVal = yWithinLayer.get(id) ?? 0;
        const l = layers.get(id) ?? 0;
        const actualH = s.nodeKind === "decision" ? DECISION_H : NODE_HEIGHT;
        s.x = colX.get(l) ?? 0;
        s.y = yVal - actualH / 2;
        if (s.y < compMinY) compMinY = s.y;
        if (s.y + actualH > compMaxY) compMaxY = s.y + actualH;
      }

      const shift = globalOffset - compMinY;
      for (const id of compIds) screenMap.get(id)!.y += shift;
      globalOffset = compMaxY + shift + COMP_GAP;
    }
  }

  // Safety: resolve any remaining overlaps
  resolveOverlaps(screens);

  return screens;
}

// ── Horizontal helpers ─────────────────────────────────────────────

/** For horizontal layout: compute Y positions within each column (same algorithm as assignX but on the cross-axis) */
function assignXAsY(
  groups: Map<number, string[]>,
  maxLayer: number,
  connections: Connection[],
  layers: Map<string, number>,
  backEdgeKeys: Set<string>,
  screenMap: Map<string, Screen>,
): Map<string, number> {
  // Reuse the same weighted-barycenter approach, but position = Y
  interface WEdge { peer: string; weight: number; }
  const neighborsOf = new Map<string, WEdge[]>();

  for (const c of connections) {
    const key = `${c.sourceId}→${c.destinationId}`;
    if (backEdgeKeys.has(key)) continue;
    const sL = layers.get(c.sourceId);
    const dL = layers.get(c.destinationId);
    if (sL === undefined || dL === undefined) continue;
    if (sL >= dL) continue;
    const w = c.flowType === "happy" ? 3 : 1;
    if (!neighborsOf.has(c.sourceId)) neighborsOf.set(c.sourceId, []);
    neighborsOf.get(c.sourceId)!.push({ peer: c.destinationId, weight: w });
    if (!neighborsOf.has(c.destinationId)) neighborsOf.set(c.destinationId, []);
    neighborsOf.get(c.destinationId)!.push({ peer: c.sourceId, weight: w });
  }

  function getH(id: string): number {
    const s = screenMap.get(id);
    return s ? nodeH(s) : NODE_HEIGHT + 35;
  }

  const yPos = new Map<string, number>();

  // Initial placement: equally spaced, centred at 0 per layer
  for (let l = 0; l <= maxLayer; l++) {
    const nodes = groups.get(l)!;
    let totalH = 0;
    for (const id of nodes) totalH += getH(id);
    totalH += Math.max(0, nodes.length - 1) * V_GAP_HORIZ;
    let cy = -totalH / 2;
    for (const id of nodes) {
      const h = getH(id);
      yPos.set(id, cy + h / 2);
      cy += h + V_GAP_HORIZ;
    }
  }

  // Iterative barycenter-based Y refinement
  for (let pass = 0; pass < 30; pass++) {
    let totalShift = 0;
    const down = pass % 2 === 0;

    for (
      let l = down ? 0 : maxLayer;
      down ? l <= maxLayer : l >= 0;
      l += down ? 1 : -1
    ) {
      const nodes = groups.get(l)!;
      if (nodes.length === 0) continue;

      for (const id of nodes) {
        const edges = neighborsOf.get(id);
        if (!edges || edges.length === 0) continue;
        let sumW = 0, sumPos = 0;
        for (const e of edges) {
          const py = yPos.get(e.peer);
          if (py !== undefined) { sumPos += py * e.weight; sumW += e.weight; }
        }
        if (sumW === 0) continue;
        const desired = sumPos / sumW;
        const current = yPos.get(id)!;
        const next = current + (desired - current) * 0.55;
        totalShift += Math.abs(next - current);
        yPos.set(id, next);
      }

      // Enforce minimum spacing top → bottom
      for (let i = 1; i < nodes.length; i++) {
        const p = nodes[i - 1], c = nodes[i];
        const minDist = (getH(p) + getH(c)) / 2 + V_GAP_HORIZ;
        if (yPos.get(c)! - yPos.get(p)! < minDist) {
          yPos.set(c, yPos.get(p)! + minDist);
        }
      }
      for (let i = nodes.length - 2; i >= 0; i--) {
        const c = nodes[i], n = nodes[i + 1];
        const minDist = (getH(c) + getH(n)) / 2 + V_GAP_HORIZ;
        if (yPos.get(n)! - yPos.get(c)! < minDist) {
          yPos.set(c, yPos.get(n)! - minDist);
        }
      }
    }
    if (totalShift < 0.5) break;
  }

  return yPos;
}

/** For horizontal layout: assign X per column (layer), spacing left→right */
function assignXColumns(
  groups: Map<number, string[]>,
  maxLayer: number,
  screenMap: Map<string, Screen>,
): Map<number, number> {
  const colX = new Map<number, number>();
  let cx = 0;
  for (let l = 0; l <= maxLayer; l++) {
    colX.set(l, cx);
    const nodes = groups.get(l)!;
    let maxW = 60;
    for (const id of nodes) {
      const s = screenMap.get(id);
      if (s) { const w = nodeW(s); if (w > maxW) maxW = w; }
    }
    cx += maxW + H_GAP_HORIZ;
  }
  return colX;
}