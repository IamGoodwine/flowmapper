import type { Screen, Connection } from "./types";
import { NODE_WIDTH, NODE_HEIGHT, H_SPACING, V_SPACING, DECISION_H } from "./types";

/** Effective bounding height for a node (including label below) */
function nodeHeight(s: Screen): number {
  return (s.nodeKind === "decision" ? DECISION_H + 20 : NODE_HEIGHT + 25);
}

/** Effective bounding width for a node (including label & edge-label clearance) */
function nodeWidth(_s: Screen): number {
  // Nodes are 90px wide, but edge trigger labels can extend ~70px each side
  return NODE_WIDTH + 60;
}

/** Check if two axis-aligned rectangles overlap (with padding) */
function overlaps(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
  pad: number,
): boolean {
  return (
    ax - pad < bx + bw &&
    ax + aw + pad > bx &&
    ay - pad < by + bh &&
    ay + ah + pad > by
  );
}

export function autoLayout(screens: Screen[], connections: Connection[]): Screen[] {
  if (screens.length === 0) return screens;

  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const s of screens) {
    adj.set(s.id, []);
    inDegree.set(s.id, 0);
  }

  for (const c of connections) {
    adj.get(c.sourceId)?.push(c.destinationId);
    inDegree.set(c.destinationId, (inDegree.get(c.destinationId) || 0) + 1);
  }

  // Find root nodes (no incoming)
  const roots = screens.filter((s) => (inDegree.get(s.id) || 0) === 0);
  if (roots.length === 0) roots.push(screens[0]);

  // BFS to assign levels (with cycle protection)
  const levels = new Map<string, number>();
  const queue: string[] = [];
  const visitCount = new Map<string, number>();
  const MAX_VISITS_PER_NODE = 3;
  const MAX_ITERATIONS = screens.length * 10;
  let iterations = 0;

  for (const r of roots) {
    levels.set(r.id, 0);
    queue.push(r.id);
    visitCount.set(r.id, 1);
  }

  while (queue.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    const current = queue.shift()!;
    const currentLevel = levels.get(current)!;
    for (const child of adj.get(current) || []) {
      const existingLevel = levels.get(child);
      const visits = visitCount.get(child) || 0;
      if (visits >= MAX_VISITS_PER_NODE) continue;
      if (existingLevel === undefined || existingLevel < currentLevel + 1) {
        levels.set(child, currentLevel + 1);
        visitCount.set(child, visits + 1);
        queue.push(child);
      }
    }
  }

  // Assign levels to any unvisited nodes
  for (const s of screens) {
    if (!levels.has(s.id)) {
      levels.set(s.id, 0);
    }
  }

  // Group by level
  const levelGroups = new Map<number, string[]>();
  for (const [id, level] of levels) {
    if (!levelGroups.has(level)) levelGroups.set(level, []);
    levelGroups.get(level)!.push(id);
  }

  const maxLevel = Math.max(...levelGroups.keys());
  const screenMap = new Map(screens.map((s) => [s.id, s]));

  // --- Sort nodes within each level to minimise edge crossings ---
  // For each level, order children based on the median x-position of their
  // parents in the previous level.  This is a single-pass heuristic (the
  // full barycenter method iterates, but one pass already helps a lot).
  for (let level = 1; level <= maxLevel; level++) {
    const nodesAtLevel = levelGroups.get(level);
    if (!nodesAtLevel || nodesAtLevel.length <= 1) continue;

    // Build reverse-adj for quick parent lookup
    const parentXMedian = new Map<string, number>();
    for (const id of nodesAtLevel) {
      const parentXs: number[] = [];
      for (const c of connections) {
        if (c.destinationId === id) {
          const parentScreen = screenMap.get(c.sourceId);
          if (parentScreen && levels.get(c.sourceId)! < level) {
            parentXs.push(parentScreen.x);
          }
        }
      }
      if (parentXs.length > 0) {
        parentXs.sort((a, b) => a - b);
        const mid = Math.floor(parentXs.length / 2);
        parentXMedian.set(id, parentXs[mid]);
      }
    }

    nodesAtLevel.sort((a, b) => {
      const ma = parentXMedian.get(a) ?? 0;
      const mb = parentXMedian.get(b) ?? 0;
      return ma - mb;
    });
  }

  // --- Initial placement: centre each level row ---
  for (let level = 0; level <= maxLevel; level++) {
    const nodesAtLevel = levelGroups.get(level) || [];
    const count = nodesAtLevel.length;
    const totalWidth = count * NODE_WIDTH + (count - 1) * (H_SPACING - NODE_WIDTH);
    const startX = -totalWidth / 2;

    // Compute max node height in this row for vertical centering
    let rowMaxH = 0;
    for (const id of nodesAtLevel) {
      const screen = screenMap.get(id);
      if (screen) {
        const h = screen.nodeKind === "decision" ? DECISION_H : NODE_HEIGHT;
        if (h > rowMaxH) rowMaxH = h;
      }
    }

    nodesAtLevel.forEach((id, i) => {
      const screen = screenMap.get(id);
      if (screen) {
        const actualH = screen.nodeKind === "decision" ? DECISION_H : NODE_HEIGHT;
        screen.x = startX + i * H_SPACING;
        // Center vertically within the row
        screen.y = level * V_SPACING + (rowMaxH - actualH) / 2;
      }
    });
  }

  // --- Post-layout: resolve remaining overlaps ---
  // Uses a simple iterative scan: for each pair of nodes check their
  // bounding boxes (including labels) and push apart if needed.
  const PAD = 30; // minimum gap between bounding boxes
  const MAX_RESOLVE = 20;

  for (let pass = 0; pass < MAX_RESOLVE; pass++) {
    let moved = false;
    for (let i = 0; i < screens.length; i++) {
      for (let j = i + 1; j < screens.length; j++) {
        const a = screens[i];
        const b = screens[j];
        const aw = nodeWidth(a);
        const ah = nodeHeight(a);
        const bw = nodeWidth(b);
        const bh = nodeHeight(b);
        // Centre the effective bounding box on the node's position
        const ax = a.x - (aw - NODE_WIDTH) / 2;
        const ay = a.y;
        const bx = b.x - (bw - NODE_WIDTH) / 2;
        const by = b.y;

        if (!overlaps(ax, ay, aw, ah, bx, by, bw, bh, PAD)) continue;

        // Determine principal overlap axis and push apart
        const overlapX =
          Math.min(ax + aw + PAD, bx + bw + PAD) -
          Math.max(ax, bx);
        const overlapY =
          Math.min(ay + ah + PAD, by + bh + PAD) -
          Math.max(ay, by);

        if (overlapX > 0 && overlapY > 0) {
          moved = true;
          if (overlapX < overlapY) {
            // Push horizontally
            const push = (overlapX / 2) + 1;
            if (a.x <= b.x) {
              a.x -= push;
              b.x += push;
            } else {
              a.x += push;
              b.x -= push;
            }
          } else {
            // Push vertically
            const push = (overlapY / 2) + 1;
            if (a.y <= b.y) {
              a.y -= push;
              b.y += push;
            } else {
              a.y += push;
              b.y -= push;
            }
          }
        }
      }
    }
    if (!moved) break;
  }

  return screens;
}