import type { Screen, Connection, FlowType, ManualFlow } from "./types";
import { NODE_WIDTH, NODE_HEIGHT } from "./types";
import { LIMITS } from "./LoadingOverlay";
import type { LoadingAlert } from "./LoadingOverlay";

// ───────────────────────────────────────────────────────
// Progress callback type
// ───────────────────────────────────────────────────────

export type ProgressCallback = (phase: string, detail?: string, percent?: number) => void;
export type AlertCallback = (alert: Omit<LoadingAlert, "id" | "timestamp">) => void;

// ───────────────────────────────────────────────────────
// Fetch with timeout helper
// ───────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = LIMITS.FETCH_TIMEOUT_MS, ...fetchOpts } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, { ...fetchOpts, signal: controller.signal });
    return resp;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s. The file may be too large or the server is slow.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read response as text, checking body size along the way.
 * Throws if the body exceeds the abort threshold.
 * Reports download progress if Content-Length is available.
 */
async function readResponseWithSizeCheck(
  resp: Response,
  onAlert?: AlertCallback,
  onProgress?: ProgressCallback
): Promise<{ text: string; sizeBytes: number }> {
  // Try Content-Length header first
  const clHeader = resp.headers.get("content-length");
  const declaredSize = clHeader ? parseInt(clHeader, 10) : null;

  if (declaredSize && declaredSize > LIMITS.RESPONSE_SIZE_ABORT) {
    throw new Error(
      `Response is too large (${(declaredSize / 1024 / 1024).toFixed(1)} MB). Maximum is ${(LIMITS.RESPONSE_SIZE_ABORT / 1024 / 1024).toFixed(0)} MB.`
    );
  }

  if (declaredSize && declaredSize > LIMITS.RESPONSE_SIZE_WARN) {
    onAlert?.({
      level: "warning",
      title: "Large file detected",
      message: `Response size is ~${(declaredSize / 1024 / 1024).toFixed(1)} MB — downloading may take a while.`,
      dismissible: true,
      autoDismissMs: 12000,
    });
  }

  // Read via stream to check actual size and report progress
  const reader = resp.body?.getReader();
  if (!reader) {
    const text = await resp.text();
    return { text, sizeBytes: text.length };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let lastProgressUpdate = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalBytes += value.byteLength;

    if (totalBytes > LIMITS.RESPONSE_SIZE_ABORT) {
      reader.cancel();
      throw new Error(
        `Response exceeded ${(LIMITS.RESPONSE_SIZE_ABORT / 1024 / 1024).toFixed(0)} MB limit and was aborted. Try a smaller Figma file or request a specific page.`
      );
    }

    // Report download progress every 500KB or when we have Content-Length
    const now = totalBytes;
    if (now - lastProgressUpdate > 512 * 1024) {
      lastProgressUpdate = now;
      const sizeMb = (totalBytes / 1024 / 1024).toFixed(1);
      if (declaredSize) {
        const pct = Math.min(99, Math.round((totalBytes / declaredSize) * 100));
        onProgress?.("Downloading file", `${sizeMb} / ${(declaredSize / 1024 / 1024).toFixed(1)} MB`, pct);
      } else {
        onProgress?.("Downloading file", `${sizeMb} MB downloaded`);
      }
    }
  }

  const decoder = new TextDecoder();
  const text = chunks.map((c) => decoder.decode(c, { stream: true })).join("") + decoder.decode();

  if (totalBytes > LIMITS.RESPONSE_SIZE_WARN) {
    onAlert?.({
      level: "warning",
      title: "Large response",
      message: `Downloaded ${(totalBytes / 1024 / 1024).toFixed(1)} MB — parsing may take a moment.`,
      dismissible: true,
      autoDismissMs: 10000,
    });
  }

  return { text, sizeBytes: totalBytes };
}

// ───────────────────────────────────────────────────────
// URL detection
// ───────────────────────────────────────────────────────

/** Check if URL is a Figma Make deployed site (*.figma.site) */
export function isFigmaMakeUrl(url: string): boolean {
  const trimmed = url.trim();
  return /^https?:\/\/[^/]+\.figma\.site/i.test(trimmed);
}

/** Normalise a Figma Make base URL (strip trailing slash) */
function normaliseMakeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function extractFileKey(url: string): string | null {
  const trimmed = url.trim();

  // Published Figma Sites (*.figma.site) — no file key extractable
  if (/\.figma\.site/i.test(trimmed)) {
    return null;
  }

  const patterns = [
    /figma\.com\/proto\/([a-zA-Z0-9]+)/,
    /figma\.com\/file\/([a-zA-Z0-9]+)/,
    /figma\.com\/design\/([a-zA-Z0-9]+)/,
    /figma\.com\/make\/([a-zA-Z0-9]+)/,
    /figma\.com\/board\/([a-zA-Z0-9]+)/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }

  // Bare alphanumeric key (10–40 chars, no slashes/dots) — accept as-is
  if (/^[a-zA-Z0-9]{10,40}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/** Returns true if the input looks like a published *.figma.site URL */
export function isFigmaSiteUrl(url: string): boolean {
  return /\.figma\.site/i.test(url.trim());
}

interface FigmaReaction {
  action?: {
    type: string;
    destinationId?: string;
    navigation?: string;
    // Older Figma API versions use transitionNodeID
    transitionNodeID?: string;
  };
  trigger?: { type: string };
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  reactions?: FigmaReaction[];
  // Older field for prototype connections
  transitionNodeID?: string;
  // Size info (used for smart filtering)
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
}

/** Node types that can represent a prototype screen */
const SCREEN_NODE_TYPES = new Set([
  "FRAME",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
]);

/** Container types that might wrap screens */
const CONTAINER_NODE_TYPES = new Set([
  "SECTION",
  "GROUP",
  "CANVAS",
]);

/** Names that suggest internal/utility nodes, not screens */
const IGNORED_NAME_PREFIXES = ["_", ".", "#"];
const IGNORED_NAME_PATTERNS = [
  /^icon/i,
  /^component/i,
  /^symbol/i,
  /^variant/i,
  /^\[internal\]/i,
];

function isLikelyScreen(node: FigmaNode): boolean {
  // Skip tiny nodes (less than 50x50) — likely icons or buttons
  const bb = node.absoluteBoundingBox;
  if (bb && (bb.width < 50 || bb.height < 50)) return false;

  // Skip nodes whose names look like internal components
  const name = node.name.trim();
  if (IGNORED_NAME_PREFIXES.some((p) => name.startsWith(p))) return false;
  if (IGNORED_NAME_PATTERNS.some((p) => p.test(name))) return false;

  return true;
}

/**
 * Collect frames from a page with multi-strategy approach:
 *
 * Strategy 1 — Direct children (standard Figma layout):
 *   page > FRAME/COMPONENT/INSTANCE
 *
 * Strategy 2 — Unwrap containers (SECTIONs, GROUPs):
 *   page > SECTION/GROUP > FRAME/COMPONENT/INSTANCE
 *
 * Strategy 3 — Deep recursive search (nested structures):
 *   page > ... any depth ... > FRAME (if it has reactions or is big enough)
 *
 * If Strategy 1+2 find nothing, Strategy 3 kicks in as fallback.
 */
function collectTopLevelFrames(page: FigmaNode): FigmaNode[] {
  const frames: FigmaNode[] = [];
  const seenIds = new Set<string>();

  if (!page.children) return frames;

  function addFrame(node: FigmaNode) {
    if (seenIds.has(node.id)) return;
    seenIds.add(node.id);
    frames.push(node);
  }

  // ─── Strategy 1 & 2: Direct children + one-level unwrap ───
  for (const child of page.children) {
    if (SCREEN_NODE_TYPES.has(child.type)) {
      addFrame(child);
    } else if (CONTAINER_NODE_TYPES.has(child.type) && child.children) {
      // Unwrap containers: look inside SECTIONs, GROUPs
      for (const inner of child.children) {
        if (SCREEN_NODE_TYPES.has(inner.type)) {
          addFrame(inner);
        }
        // Also unwrap nested SECTION > GROUP > FRAME
        if (CONTAINER_NODE_TYPES.has(inner.type) && inner.children) {
          for (const deep of inner.children) {
            if (SCREEN_NODE_TYPES.has(deep.type)) {
              addFrame(deep);
            }
          }
        }
      }
    }
  }

  // ─── Strategy 3: Deep recursive fallback ───
  // If nothing found yet, do a full recursive search for frames
  // that have reactions (prototype connections) or look like screens
  if (frames.length === 0) {
    console.log(
      `[FlowMapper] Strategy 1+2 found 0 frames on page "${page.name}". ` +
      `Falling back to deep recursive search...`
    );

    const deepSearch = (node: FigmaNode, depth: number) => {
      if (depth > 10) return; // safety limit
      if (!node.children) return;

      for (const child of node.children) {
        if (SCREEN_NODE_TYPES.has(child.type) && isLikelyScreen(child)) {
          // Check if it has prototype reactions (strong signal)
          const hasReactions = hasAnyReaction(child);
          // Or if it's reasonably sized (>= 200px in at least one dimension)
          const bb = child.absoluteBoundingBox;
          const isBigEnough = bb && (bb.width >= 200 || bb.height >= 200);

          if (hasReactions || isBigEnough) {
            addFrame(child);
          }
        }
        // Keep searching deeper
        deepSearch(child, depth + 1);
      }
    };

    deepSearch(page, 0);
  }

  return frames;
}

/** Quick check if a node or any of its children has prototype reactions */
function hasAnyReaction(node: FigmaNode): boolean {
  if (node.reactions && node.reactions.length > 0) return true;
  if (node.transitionNodeID) return true;
  if (node.children) {
    for (const child of node.children) {
      if (hasAnyReaction(child)) return true;
    }
  }
  return false;
}

/**
 * Given a node that lives somewhere deep inside a frame tree,
 * find its top-level frame ancestor ID.
 */
function buildChildToFrameMap(frames: FigmaNode[]): Map<string, string> {
  const map = new Map<string, string>();

  function walk(node: FigmaNode, topFrameId: string) {
    map.set(node.id, topFrameId);
    if (node.children) {
      for (const child of node.children) {
        walk(child, topFrameId);
      }
    }
  }

  for (const frame of frames) {
    walk(frame, frame.id);
  }

  return map;
}

/**
 * Recursively collect ALL reactions from every node in the tree,
 * returning the source node ID and the reaction data.
 */
function collectAllReactions(
  node: FigmaNode
): Array<{ nodeId: string; reaction: FigmaReaction }> {
  const results: Array<{ nodeId: string; reaction: FigmaReaction }> = [];

  if (node.reactions) {
    for (const reaction of node.reactions) {
      results.push({ nodeId: node.id, reaction });
    }
  }

  // Also check legacy transitionNodeID field
  if (node.transitionNodeID) {
    results.push({
      nodeId: node.id,
      reaction: {
        action: {
          type: "NAVIGATE",
          destinationId: node.transitionNodeID,
        },
        trigger: { type: "ON_CLICK" },
      },
    });
  }

  if (node.children) {
    for (const child of node.children) {
      results.push(...collectAllReactions(child));
    }
  }

  return results;
}

/** Recognized action types that represent a prototype navigation */
const NAV_ACTION_TYPES = new Set([
  "NAVIGATE",
  "NODE",          // legacy
  "SWAP",          // overlay swap (still navigates)
  "OVERLAY",       // open overlay
]);

/**
 * Extract prototype connections from the collected frames.
 * Reactions can live on ANY child node (buttons, icons, text, etc.),
 * so we recursively walk each frame's tree and map reactions back to
 * their top-level frame.
 */
function extractConnections(
  frames: FigmaNode[]
): Array<{ sourceId: string; destinationId: string; trigger: string }> {
  const frameIds = new Set(frames.map((f) => f.id));
  const childToFrame = buildChildToFrameMap(frames);

  // Collect reactions from every node inside every frame
  const allReactions: Array<{ nodeId: string; reaction: FigmaReaction }> = [];
  for (const frame of frames) {
    allReactions.push(...collectAllReactions(frame));
  }

  // Deduplicate: same source-frame → destination pair should appear once
  const seen = new Set<string>();
  const conns: Array<{
    sourceId: string;
    destinationId: string;
    trigger: string;
  }> = [];

  for (const { nodeId, reaction } of allReactions) {
    const action = reaction.action;
    if (!action) continue;

    // Check if this action is a navigation type
    const actionType = action.type?.toUpperCase() || "";
    if (!NAV_ACTION_TYPES.has(actionType)) continue;

    // Get destination ID
    const destId = action.destinationId || action.transitionNodeID;
    if (!destId) continue;

    // Destination must be a known top-level frame
    if (!frameIds.has(destId)) continue;

    // Map the source node to its parent top-level frame
    const sourceFrameId = childToFrame.get(nodeId);
    if (!sourceFrameId) continue;

    // Skip self-loops
    if (sourceFrameId === destId) continue;

    const key = `${sourceFrameId}->${destId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Format the trigger label nicely
    const rawTrigger = reaction.trigger?.type || "ON_CLICK";
    const trigger = formatTrigger(rawTrigger);

    conns.push({
      sourceId: sourceFrameId,
      destinationId: destId,
      trigger,
    });
  }

  return conns;
}

function formatTrigger(raw: string): string {
  // Convert "ON_CLICK" → "On Click", "ON_HOVER" → "On Hover", etc.
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function classifyConnections(
  screens: Screen[],
  rawConns: Array<{
    sourceId: string;
    destinationId: string;
    trigger: string;
  }>
): Connection[] {
  if (rawConns.length === 0) return [];

  // Find root (no incoming connections)
  const hasIncoming = new Set(rawConns.map((c) => c.destinationId));
  const screenIds = screens.map((s) => s.id);
  const root = screenIds.find((id) => !hasIncoming.has(id)) || screenIds[0];

  // Find longest path from root (happy path)
  const adj = new Map<string, string[]>();
  for (const c of rawConns) {
    if (!adj.has(c.sourceId)) adj.set(c.sourceId, []);
    adj.get(c.sourceId)!.push(c.destinationId);
  }

  function longestPath(
    node: string,
    visited: Set<string>
  ): string[] {
    if (visited.has(node)) return [];
    visited.add(node);
    const neighbors = adj.get(node) || [];
    let best: string[] = [node];
    for (const n of neighbors) {
      const path = [node, ...longestPath(n, new Set(visited))];
      if (path.length > best.length) best = path;
    }
    return best;
  }

  const happyPath = longestPath(root, new Set());
  const happyEdges = new Set<string>();
  for (let i = 0; i < happyPath.length - 1; i++) {
    happyEdges.add(`${happyPath[i]}->${happyPath[i + 1]}`);
  }
  const happySet = new Set(happyPath);

  return rawConns.map((c, i) => {
    const key = `${c.sourceId}->${c.destinationId}`;
    let flowType: FlowType = "secondary";
    if (happyEdges.has(key)) {
      flowType = "happy";
    } else {
      const srcIdx = happyPath.indexOf(c.sourceId);
      const dstIdx = happyPath.indexOf(c.destinationId);
      if (srcIdx >= 0 && dstIdx >= 0 && dstIdx - srcIdx > 1) {
        flowType = "skip";
      } else if (!happySet.has(c.sourceId) || !happySet.has(c.destinationId)) {
        flowType = "secondary";
      } else {
        flowType = "skip";
      }
    }
    return {
      id: `conn-${i}`,
      sourceId: c.sourceId,
      destinationId: c.destinationId,
      trigger: c.trigger,
      flowType,
    };
  });
}

export async function parseFigmaFile(
  fileKey: string,
  token: string,
  onProgress?: ProgressCallback,
  onAlert?: AlertCallback
): Promise<{ screens: Screen[]; connections: Connection[] }> {
  onProgress?.("Fetching file data", "Starting download", 0);

  const resp = await fetchWithTimeout(`https://api.figma.com/v1/files/${fileKey}`, {
    headers: { "X-Figma-Token": token },
    timeoutMs: LIMITS.FETCH_TIMEOUT_MS,
  });

  if (!resp.ok) {
    if (resp.status === 403) throw new Error("Invalid token or no access to this file.");
    if (resp.status === 404) throw new Error("File not found. Check the URL.");
    throw new Error(`Figma API error: ${resp.status} ${resp.statusText}`);
  }

  const { text: fileData, sizeBytes } = await readResponseWithSizeCheck(resp, onAlert, onProgress);
  onProgress?.("Fetching file data", "Download complete", 100);

  const data = JSON.parse(fileData);
  const allFrames: FigmaNode[] = [];

  // ─── Diagnostic: count node types per page ─────────
  const pageDiag: string[] = [];
  for (const page of data.document.children || []) {
    const pageFrames = collectTopLevelFrames(page);
    allFrames.push(...pageFrames);

    // Collect type stats for diagnostics
    const typeCounts = new Map<string, number>();
    const countTypes = (node: FigmaNode) => {
      typeCounts.set(node.type, (typeCounts.get(node.type) || 0) + 1);
      if (node.children) node.children.forEach(countTypes);
    };
    countTypes(page);
    const stats = Array.from(typeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `${t}:${c}`)
      .join(", ");
    pageDiag.push(`"${page.name}": ${pageFrames.length} frames [${stats}]`);
  }

  console.log(`[FlowMapper] Page diagnostics:\n${pageDiag.join("\n")}`);

  if (allFrames.length === 0) {
    // Build a helpful error message
    const pages = data.document.children || [];
    const pageCount = pages.length;
    const totalChildren = pages.reduce(
      (sum: number, p: FigmaNode) => sum + (p.children?.length || 0),
      0
    );
    const childTypes = new Set<string>();
    for (const p of pages) {
      for (const c of p.children || []) {
        childTypes.add(c.type);
      }
    }
    const typeList = Array.from(childTypes).join(", ") || "none";

    throw new Error(
      `No prototype screens found across ${pageCount} page(s) ` +
      `(${totalChildren} top-level nodes of types: ${typeList}). ` +
      `Make sure the file contains FRAME nodes with prototype connections. ` +
      `Check the browser console for detailed diagnostics.`
    );
  }

  onProgress?.("Processing frames", `Found ${allFrames.length} frames`, 30);

  // ─── Frame count checks ────────────────────────────
  if (allFrames.length > LIMITS.FRAME_COUNT_ABORT) {
    throw new Error(
      `File contains ${allFrames.length} frames (limit: ${LIMITS.FRAME_COUNT_ABORT}). ` +
      `Use a smaller file or a single-page prototype.`
    );
  }
  if (allFrames.length > LIMITS.FRAME_COUNT_WARN) {
    onAlert?.({
      level: "warning",
      title: "Many frames detected",
      message: `${allFrames.length} frames found — processing and rendering may be slow.`,
      dismissible: true,
      autoDismissMs: 10000,
    });
  }

  onProgress?.("Extracting connections", "Scanning reactions", 50);
  const rawConns = extractConnections(allFrames);

  // Only keep frames that participate in connections, OR all frames if few enough
  const connectedIds = new Set<string>();
  for (const c of rawConns) {
    connectedIds.add(c.sourceId);
    connectedIds.add(c.destinationId);
  }

  const relevantFrames =
    rawConns.length > 0
      ? allFrames.filter((f) => connectedIds.has(f.id))
      : allFrames;

  // ─── Screen count warning ──────────────────────────
  if (relevantFrames.length > LIMITS.SCREEN_COUNT_WARN) {
    onAlert?.({
      level: "warning",
      title: "Large diagram",
      message: `${relevantFrames.length} screens will be rendered — the canvas may be slow. Consider filtering.`,
      dismissible: true,
      autoDismissMs: 10000,
    });
  }

  const screens: Screen[] = relevantFrames.map((f) => ({
    id: f.id,
    name: f.name,
    x: 0,
    y: 0,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    figmaFrameId: f.id,
  }));

  onProgress?.("Classifying flow types", `${rawConns.length} connections`, 70);
  const connections = classifyConnections(screens, rawConns);

  // Try to get thumbnails (batched for large files)
  onProgress?.("Fetching thumbnails", `${screens.length} screens`, 80);
  try {
    const batchSize = LIMITS.THUMB_BATCH_SIZE;
    const batches: Screen[][] = [];
    for (let i = 0; i < screens.length; i += batchSize) {
      batches.push(screens.slice(i, i + batchSize));
    }

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const ids = batch.map((s) => s.id).join(",");
      const pct = 80 + Math.round(((b + 1) / batches.length) * 18); // 80→98
      onProgress?.(
        "Fetching thumbnails",
        batches.length > 1
          ? `Batch ${b + 1}/${batches.length} (${batch.length} screens)`
          : `${screens.length} screens`,
        pct
      );

      const imgResp = await fetchWithTimeout(
        `https://api.figma.com/v1/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=png&scale=1`,
        {
          headers: { "X-Figma-Token": token },
          timeoutMs: LIMITS.THUMB_TIMEOUT_MS,
        }
      );
      if (imgResp.ok) {
        const imgData = await imgResp.json();
        if (imgData.images) {
          for (const screen of batch) {
            if (imgData.images[screen.id]) {
              screen.thumbnailUrl = imgData.images[screen.id];
            }
          }
        }
      }
    }
  } catch {
    onAlert?.({
      level: "info",
      title: "Thumbnails unavailable",
      message: "Could not fetch screen thumbnails — they will show as placeholders.",
      dismissible: true,
      autoDismissMs: 5000,
    });
  }

  onProgress?.("Complete", `${screens.length} screens, ${connections.length} connections`, 100);

  console.log(
    `[FlowMapper] Parsed ${allFrames.length} total frames, ${relevantFrames.length} relevant, ${rawConns.length} connections found. Payload: ${(sizeBytes / 1024).toFixed(0)} KB`
  );

  return { screens, connections };
}

// ───────────────────────────────────────────────────────
// Figma Make site parser
// ───────────────────────────────────────────────────────

// ─── Solution 1: Figma REST API route discovery ─────────
// Uses the Figma API to read the file structure and derive
// page routes from top-level frame names.
// ─────────────────────────────────────────────────────────

export interface FigmaApiDiscoveryResult {
  routes: string[];
  frameNames: string[];
  pageNames: string[];
  diagnostics: DiscoveryDiagnostic[];
  error?: string;
}

/** Convert a Figma frame name into a URL route path */
function frameNameToRoute(name: string): string {
  const n = name.trim();
  // Common "home" names
  if (/^(home|homepage|index|landing|main|start|hero)$/i.test(n)) return "/";
  // Already looks like a route path
  if (n.startsWith("/")) return n.toLowerCase().replace(/\s+/g, "-");
  // Convert "Login Page" → /login-page, "User Profile" → /user-profile etc.
  return "/" + n
    .toLowerCase()
    .replace(/\s*[→>–—|/\\]\s*/g, "/")   // arrows/separators → path sep
    .replace(/[^a-z0-9/]+/g, "-")         // non-alphanum → dash
    .replace(/-+/g, "-")                   // collapse dashes
    .replace(/^-|-$/g, "")                 // trim dashes
    .replace(/\/+/g, "/");                 // collapse slashes
}

/**
 * Discover routes by reading the Figma file structure via REST API.
 * This bypasses CORS entirely since it uses api.figma.com.
 *
 * It fetches the file with depth=1 (lightweight), collects top-level
 * frame names from each page, and converts them to route paths.
 */
export async function discoverRoutesViaFigmaAPI(
  fileKey: string,
  token: string
): Promise<FigmaApiDiscoveryResult> {
  const diagnostics: DiscoveryDiagnostic[] = [];
  const frameNames: string[] = [];
  const pageNames: string[] = [];
  const routes = new Set<string>(["/"]);

  try {
    // Validate inputs
    if (!fileKey || fileKey.length < 5) {
      const msg = `Invalid file key: "${fileKey}". Paste a Figma URL (design/file/proto) or just the key.`;
      diagnostics.push({ strategy: "Validation", ok: false, detail: msg });
      return { routes: ["/"], frameNames: [], pageNames: [], diagnostics, error: msg };
    }
    // Reject keys that look like full URLs (caller should have extracted the key)
    if (/^https?:\/\//i.test(fileKey) || /\.figma\.site/i.test(fileKey)) {
      const msg = `"${fileKey.slice(0, 60)}" looks like a URL, not a file key. Use extractFileKey() first, or paste a figma.com/design/… URL.`;
      diagnostics.push({ strategy: "Validation", ok: false, detail: msg });
      return { routes: ["/"], frameNames: [], pageNames: [], diagnostics, error: msg };
    }
    if (!token || token.length < 10) {
      const msg = "Token looks too short. Use a Figma Personal Access Token (Settings → Account → Personal access tokens).";
      diagnostics.push({ strategy: "Validation", ok: false, detail: msg });
      return { routes: ["/"], frameNames: [], pageNames: [], diagnostics, error: msg };
    }

    // Helper: attempt to fetch a file key and return parsed JSON or null
    async function tryFetchFile(key: string, label: string): Promise<any | null> {
      const url = `https://api.figma.com/v1/files/${key}?depth=2`;
      diagnostics.push({ strategy: label, ok: true, detail: `GET …/files/${key}?depth=2` });
      console.log(`[FlowMapper API Discovery] ${label}: ${url}`);
      const r = await fetchWithTimeout(url, { headers: { "X-Figma-Token": token }, timeoutMs: 30000 });
      if (r.ok) {
        const d = await r.json();
        diagnostics.push({ strategy: label, ok: true, detail: `File "${d.name}" — ${(d.document?.children || []).length} page(s)` });
        return d;
      }
      // Read error body
      let body = ""; try { body = await r.text(); } catch {}
      let msg = ""; try { msg = JSON.parse(body).err || JSON.parse(body).message || ""; } catch { msg = body.slice(0, 200); }
      diagnostics.push({ strategy: label, ok: false, detail: `HTTP ${r.status} — ${msg}` });
      console.error(`[FlowMapper API Discovery] ${label}: HTTP ${r.status}`, { key, msg });
      return { _httpStatus: r.status, _msg: msg };
    }

    // ── Step 1: Try fetching the file directly ─────────────────────
    let data = await tryFetchFile(fileKey, "Figma API");

    // ── Step 1b: Handle "File type not supported" (Make/Sites files) ──
    const isMakeFileError = data?._httpStatus === 400 &&
      (data._msg || "").toLowerCase().includes("file type not supported");

    if (isMakeFileError) {
      diagnostics.push({
        strategy: "Make detection",
        ok: true,
        detail: `Key "${fileKey}" is a Figma Make/Sites project — not a design file. Searching for linked design file…`,
      });

      // ── Strategy A: Try /v1/files/:key/versions (works on more file types) ──
      let designFileKey: string | null = null;
      try {
        const verResp = await fetchWithTimeout(
          `https://api.figma.com/v1/files/${fileKey}/versions?page_size=1`,
          { headers: { "X-Figma-Token": token }, timeoutMs: 10000 }
        );
        if (verResp.ok) {
          const verData = await verResp.json();
          diagnostics.push({ strategy: "Versions API", ok: true, detail: `Versions endpoint responded — file is accessible` });
          // If versions works, the key is valid but /files/ doesn't support it
          // We can try to scan the versions for linked data, but usually there's no cross-reference
        } else {
          diagnostics.push({ strategy: "Versions API", ok: false, detail: `HTTP ${verResp.status}` });
        }
      } catch {}

      // ── Strategy B: Try project siblings ─────────────────────────
      // Use /v1/files/:key/… to get project_id, then list project files
      try {
        // The /v1/me endpoint to verify auth
        const meResp = await fetchWithTimeout("https://api.figma.com/v1/me", {
          headers: { "X-Figma-Token": token }, timeoutMs: 10000,
        });
        if (meResp.ok) {
          const me = await meResp.json();
          diagnostics.push({ strategy: "Auth check", ok: true, detail: `Authenticated as "${me.handle || me.email}"` });
        }
      } catch {}

      // ── Strategy C: Ask user to provide the design file URL ─────
      if (!designFileKey) {
        const userMsg =
          `This is a Figma Make/Sites project — the REST API doesn't support Make file keys.\n\n` +
          `Please paste the DESIGN file URL instead:\n` +
          `  1. Open the Make project in Figma editor\n` +
          `  2. Look in the left sidebar for the linked design source\n` +
          `  3. Right-click → "Copy link" on the design file\n` +
          `  4. Paste the figma.com/design/… or figma.com/file/… URL here`;
        diagnostics.push({ strategy: "Action needed", ok: false, detail: "Use the Design file URL, not the Make URL." });
        return { routes: ["/"], frameNames: [], pageNames: [], diagnostics, error: userMsg };
      }

      // If we found the linked design file, fetch it
      data = await tryFetchFile(designFileKey, "Linked design file");
    }

    // ── Handle other errors ────────────────────────────────────────
    if (!data || data._httpStatus) {
      const status = data?._httpStatus || "unknown";
      const msg = data?._msg || "Unknown error";
      let userMsg: string;
      if (status === 403) {
        userMsg = `Access denied (403). ${msg || "Check that your token has access to this file."}`;
      } else if (status === 404) {
        userMsg = `File not found (404). ${msg || `Key "${fileKey}" doesn't exist.`}`;
      } else {
        userMsg = `HTTP ${status}. ${msg}`;
      }
      diagnostics.push({ strategy: "Debug", ok: false, detail: `Key: "${fileKey}" | Token: ${token.slice(0, 6)}…${token.slice(-4)}` });
      return { routes: ["/"], frameNames: [], pageNames: [], diagnostics, error: userMsg };
    }

    // ── Step 2: Parse the successful file response ─────────────────
    console.log(`[FlowMapper API Discovery] File: "${data.name}", schema: ${data.schemaVersion}, lastModified: ${data.lastModified}`);
    const docChildren = data.document?.children || [];

    // Walk each page
    for (const page of docChildren) {
      pageNames.push(page.name);
      const children = page.children || [];

      // Collect top-level frames (FRAME, COMPONENT, INSTANCE)
      let pageFrameCount = 0;
      for (const child of children) {
        if (!SCREEN_NODE_TYPES.has(child.type)) {
          // Also check inside SECTIONs
          if ((child.type === "SECTION" || child.type === "GROUP") && child.children) {
            for (const inner of child.children) {
              if (SCREEN_NODE_TYPES.has(inner.type) && isLikelyScreen(inner)) {
                frameNames.push(inner.name);
                const route = frameNameToRoute(inner.name);
                if (route && route.length < 80) routes.add(route);
                pageFrameCount++;
              }
            }
          }
          continue;
        }
        if (!isLikelyScreen(child)) continue;

        frameNames.push(child.name);
        const route = frameNameToRoute(child.name);
        if (route && route.length < 80) routes.add(route);
        pageFrameCount++;
      }

      diagnostics.push({
        strategy: `Page "${page.name}"`,
        ok: pageFrameCount > 0,
        detail: `${pageFrameCount} screen frame${pageFrameCount !== 1 ? "s" : ""} → ${children.length} total children`,
      });
    }

    const finalRoutes = Array.from(routes).sort();
    diagnostics.push({
      strategy: "Summary",
      ok: finalRoutes.length > 1,
      detail: `${finalRoutes.length} route${finalRoutes.length !== 1 ? "s" : ""} from ${frameNames.length} frame${frameNames.length !== 1 ? "s" : ""}`,
    });

    return { routes: finalRoutes, frameNames, pageNames, diagnostics };
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    diagnostics.push({ strategy: "Figma API", ok: false, detail: msg });
    return { routes: ["/"], frameNames: [], pageNames: [], diagnostics, error: msg };
  }
}

// ─── Solution 2: Bookmarklet generator ──────────────────
// Generates a bookmarklet that scans the current page for routes.
// ─────────────────────────────────────────────────────────

/**
 * Returns the raw JavaScript code for the route scanner.
 * This is meant to be pasted directly into the browser DevTools console.
 * No `javascript:` prefix, no URL-encoding.
 */
export function getRouteSnippetRawCode(): string {
  return `(function(){
  var routes=new Set(["/"]);
  document.querySelectorAll('a[href^="/"]').forEach(function(a){
    var p=new URL(a.href,location.origin).pathname.replace(/\\/+$/,"")||"/";
    if(p.length<80&&!/\\.\\w{2,4}$/.test(p)) routes.add(p);
  });
  document.querySelectorAll('[to^="/"]').forEach(function(el){
    routes.add(el.getAttribute("to"));
  });
  var scripts=performance.getEntriesByType("resource").filter(function(r){return r.name.endsWith(".js")});
  var pending=scripts.length, done=0;
  function finish(){
    var arr=Array.from(routes).filter(function(r){return r.startsWith("/")&&r.length<80&&!/\\.\\w{2,4}$/.test(r)}).sort();
    var json=JSON.stringify(arr,null,2);
    prompt("FlowMapper: "+arr.length+" routes found. Copy this JSON:",json);
    try{navigator.clipboard.writeText(json)}catch(e){}
  }
  if(scripts.length===0){finish();return}
  scripts.forEach(function(s){
    fetch(s.name).then(function(r){return r.text()}).then(function(t){
      var m;
      var r1=/\\bpath\\s*:\\s*["'](\\/([-\\w]+\\/?)+)["']/g;
      while(m=r1.exec(t))if(m[1].length<80)routes.add(m[1]);
      var r2=/\\bto\\s*[=:]\\s*["'](\\/([-\\w]+\\/?)+)["']/g;
      while(m=r2.exec(t))if(m[1].length<80)routes.add(m[1]);
      var r3=/\\bhref\\s*[:=]\\s*["'](\\/([-\\w]+\\/?)+)["']/g;
      while(m=r3.exec(t))if(!m[1].match(/\\.\\w{2,4}$/)&&m[1].length<80)routes.add(m[1]);
      var r4=/(?:navigate|push|replace|redirect)\\s*\\(\\s*["'](\\/([-\\w]+\\/?)+)["']/g;
      while(m=r4.exec(t))if(m[1].length<80)routes.add(m[1]);
    }).catch(function(){}).finally(function(){if(++done>=pending)finish()});
  });
  setTimeout(finish,8000);
})();`;
}

export function generateRouteBookmarklet(): string {
  return "javascript:" + encodeURIComponent(getRouteSnippetRawCode());
}

// ─── Solution 3: postMessage bridge snippet ─────────────
// A ready-to-use code snippet the designer adds to their project.
// ─────────────────────────────────────────────────────────

export const POST_MESSAGE_BRIDGE_SNIPPET = `// FlowMapper Bridge — add this to your project's main entry file (e.g. main.tsx or App.tsx)
// It allows FlowMapper to auto-discover routes via the Live Preview iframe.
// Safe to leave in production — it only responds to FlowMapper requests.

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'flowmapper-discover') return;

    const routes = new Set(['/']);

    // 1. Scan all <a> links
    document.querySelectorAll('a[href]').forEach((a) => {
      try {
        const url = new URL((a as HTMLAnchorElement).href, location.origin);
        if (url.origin === location.origin) {
          const path = url.pathname.replace(/\\/+$/, '') || '/';
          if (path.length < 80 && !/\\.\\w{2,4}$/.test(path)) routes.add(path);
        }
      } catch {}
    });

    // 2. Scan React Router <Link to="...">
    document.querySelectorAll('[to]').forEach((el) => {
      const to = el.getAttribute('to');
      if (to?.startsWith('/')) routes.add(to);
    });

    // 3. Scan loaded JS bundles for route patterns (same-origin, no CORS)
    const jsUrls = performance
      .getEntriesByType('resource')
      .filter((r) => r.name.endsWith('.js'))
      .map((r) => r.name);

    Promise.all(
      jsUrls.map((url) =>
        fetch(url).then((r) => r.text()).then((text) => {
          const patterns = [
            /\\bpath\\s*:\\s*["'](\\/([-\\w]+\\/?)+)["']/g,
            /\\bto\\s*[=:]\\s*["'](\\/([-\\w]+\\/?)+)["']/g,
            /\\bhref\\s*[:=]\\s*["'](\\/([-\\w]+\\/?)+)["']/g,
            /(?:navigate|push|replace)\\s*\\(\\s*["'](\\/([-\\w]+\\/?)+)["']/g,
          ];
          for (const rx of patterns) {
            let m;
            while ((m = rx.exec(text))) {
              if (m[1].length < 80 && !/\\.\\w{2,4}$/.test(m[1])) routes.add(m[1]);
            }
          }
        }).catch(() => {})
      )
    ).finally(() => {
      event.source?.postMessage(
        {
          type: 'flowmapper-routes',
          routes: Array.from(routes).sort(),
          timestamp: Date.now(),
        },
        { targetOrigin: event.origin }
      );
    });
  });
}`;

export const POST_MESSAGE_BRIDGE_PROMPT = `Add this code snippet to your Figma Make project's main entry file (e.g. main.tsx, App.tsx, or index.tsx).

It enables FlowMapper to automatically discover all routes via the Live Preview iframe. The snippet:
• Listens for a "flowmapper-discover" postMessage from the FlowMapper iframe
• Scans the DOM for <a href> links and React Router <Link to> elements  
• Scans all loaded JS bundles for route patterns (path:, to:, href:, navigate())
• Responds with the complete list of discovered routes

It's safe to leave in production — it only responds to FlowMapper-specific requests and doesn't expose any sensitive data.

Copy and paste this into your project:

\`\`\`tsx
${POST_MESSAGE_BRIDGE_SNIPPET}
\`\`\``;

/**
 * Discover all routes published in a Figma Make (*.figma.site) deployment.
 * Exported so MakePageScanner can call it for auto-population.
 *
 * Multi-strategy approach:
 *  1. sitemap.xml | 2. robots.txt | 3. Root HTML
 *  4. Vite/build manifests | 5. All JS bundles (React Router v6+ patterns)
 */

export interface DiscoveryDiagnostic {
  strategy: string;
  ok: boolean;
  detail: string;
}

export interface DiscoveryResult {
  routes: string[];
  diagnostics: DiscoveryDiagnostic[];
  error?: string;
  allCorsBlocked?: boolean;
  usedProxy?: boolean;
}

// ─── CORS proxy helper ──────────────────────────────────
const CORS_PROXIES = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

async function proxyFetch(url: string, useProxy: boolean): Promise<Response> {
  if (!useProxy) return fetch(url, { mode: "cors" });
  let lastErr: any;
  for (const mkProxy of CORS_PROXIES) {
    try {
      const resp = await fetch(mkProxy(url));
      if (resp.ok || resp.status === 404) return resp;   // let caller handle 404
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error("All CORS proxies failed");
}

export async function discoverMakeRoutes(baseUrl: string, options?: { useProxy?: boolean }): Promise<DiscoveryResult> {
  const routes = new Set<string>(["/"]);
  const base = baseUrl.replace(/\/+$/, "");
  const diagnostics: DiscoveryDiagnostic[] = [];
  const px = options?.useProxy ?? false;
  if (px) diagnostics.push({ strategy: "Mode", ok: true, detail: "Using CORS proxy" });

  try {
    // ── 1. sitemap.xml ─────────────────────────────────────────────────
    try {
      const sm = await proxyFetch(`${base}/sitemap.xml`, px);
      if (sm.ok) {
        const xml = await sm.text();
        const baseDomain = new URL(base).hostname;
        const locRx = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
        let lm: RegExpExecArray | null;
        const before = routes.size;
        while ((lm = locRx.exec(xml)) !== null) {
          try {
            const u = new URL(lm[1]);
            if (u.hostname === baseDomain) routes.add(u.pathname.replace(/\/+$/, "") || "/");
          } catch {}
        }
        const found = routes.size - before;
        diagnostics.push({ strategy: "sitemap.xml", ok: true, detail: `${found} new route${found !== 1 ? "s" : ""} from sitemap` });
      } else {
        diagnostics.push({ strategy: "sitemap.xml", ok: false, detail: `HTTP ${sm.status}` });
      }
    } catch (e: any) {
      diagnostics.push({ strategy: "sitemap.xml", ok: false, detail: e?.message?.includes("CORS") || e?.message?.includes("Failed to fetch") ? "CORS blocked" : (e?.message || "failed") });
    }

    // ���─ 2. robots.txt → extra sitemaps ────────────────────────────────
    try {
      const rb = await proxyFetch(`${base}/robots.txt`, px);
      if (rb.ok) {
        const robotsText = await rb.text();
        const sitemapUrls = [...robotsText.matchAll(/Sitemap:\s*(\S+)/gi)];
        let extra = 0;
        for (const sm of sitemapUrls) {
          try {
            const s2 = await proxyFetch(sm[1], px);
            if (s2.ok) {
              const xml2 = await s2.text();
              const lrx = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
              let lm2: RegExpExecArray | null;
              while ((lm2 = lrx.exec(xml2)) !== null) {
                try { const prev = routes.size; routes.add(new URL(lm2[1]).pathname.replace(/\/+$/, "") || "/"); if (routes.size > prev) extra++; } catch {}
              }
            }
          } catch {}
        }
        diagnostics.push({ strategy: "robots.txt", ok: true, detail: `${sitemapUrls.length} sitemap ref${sitemapUrls.length !== 1 ? "s" : ""}, ${extra} new route${extra !== 1 ? "s" : ""}` });
      } else {
        diagnostics.push({ strategy: "robots.txt", ok: false, detail: `HTTP ${rb.status}` });
      }
    } catch (e: any) {
      diagnostics.push({ strategy: "robots.txt", ok: false, detail: e?.message?.includes("Failed to fetch") ? "CORS blocked" : (e?.message || "failed") });
    }

    // ── 3. Root HTML ───────────────────────────────────────────────────
    let html = "";
    const scriptSrcs: string[] = [];
    try {
      const resp = await proxyFetch(baseUrl, px);
      if (!resp.ok) {
        diagnostics.push({ strategy: "Root HTML", ok: false, detail: `HTTP ${resp.status}` });
      } else {
        html = await resp.text();
        const scriptRegex = /<script[^>]+src="([^"]+\.js[^"]*)">/gi;
        let match: RegExpExecArray | null;
        while ((match = scriptRegex.exec(html)) !== null) scriptSrcs.push(match[1]);
        const preloadRx = /<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js[^"]*)"/gi;
        let pmatch: RegExpExecArray | null;
        while ((pmatch = preloadRx.exec(html)) !== null) scriptSrcs.push(pmatch[1]);
        const before = routes.size;
        { const linkRegex2 = /href="(\/[a-zA-Z0-9][a-zA-Z0-9/_-]*)"/gi; let lm: RegExpExecArray | null; while ((lm = linkRegex2.exec(html)) !== null) if (!lm[1].match(/\.\w{2,4}$/)) routes.add(lm[1]); }
        { const toRegex2 = /\bto\s*[=:]\s*["'](\/[a-zA-Z0-9][a-zA-Z0-9/_-]*)["']/g; let lm: RegExpExecArray | null; while ((lm = toRegex2.exec(html)) !== null) routes.add(lm[1]); }
        const found = routes.size - before;
        diagnostics.push({ strategy: "Root HTML", ok: true, detail: `${(html.length / 1024).toFixed(0)} KB, ${scriptSrcs.length} script${scriptSrcs.length !== 1 ? "s" : ""}, ${found} href route${found !== 1 ? "s" : ""}` });
      }
    } catch (e: any) {
      diagnostics.push({ strategy: "Root HTML", ok: false, detail: e?.message?.includes("Failed to fetch") ? "CORS blocked" : (e?.message || "failed") });
    }

    // 4. Vite / build manifests
    {
      let manifestFound = false;
      for (const mPath of ["/.vite/manifest.json", "/asset-manifest.json", "/manifest.json"]) {
        try {
          const mr = await proxyFetch(`${base}${mPath}`, px);
          if (!mr.ok) continue;
          const manifest = await mr.json();
          const before = routes.size;
          for (const key of Object.keys(manifest)) {
            const pm = key.match(/(?:pages?|views?|routes?|screens?)\/([^/]+)\.(tsx?|jsx?)$/i);
            if (pm) {
              const name = pm[1];
              if (!/^(index|app|root|layout|_app|not.?found|error|loading|404|500)$/i.test(name))
                routes.add("/" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
            }
          }
          const found = routes.size - before;
          diagnostics.push({ strategy: `Manifest (${mPath})`, ok: true, detail: `${Object.keys(manifest).length} entries, ${found} new route${found !== 1 ? "s" : ""}` });
          console.log(`[FlowMapper Make] ${mPath} → ${routes.size} routes`);
          manifestFound = true;
          break;
        } catch {}
      }
      if (!manifestFound) {
        diagnostics.push({ strategy: "Manifests", ok: false, detail: "No Vite/asset manifest found" });
      }
    }

    // ── 5. Multi-pattern JS route scanner ─────────────────────────────
    function scanJsForRoutes(jsText: string) {
      let m: RegExpExecArray | null;
      // a) absolute path: "/route"
      const ra = /\bpath\s*:\s*["'](\/[a-zA-Z0-9][a-zA-Z0-9/_-]*)["']/g;
      while ((m = ra.exec(jsText)) !== null)
        if (!m[1].includes(":") && !m[1].includes("*") && m[1].length < 80) routes.add(m[1]);
      // b) RR v6 child: path:"routeName" near element/Component/lazy (no leading slash)
      const rb = /path\s*:\s*["']([a-zA-Z][a-zA-Z0-9/_-]{1,50})["'][^}]{0,200}?(?:element|Component|lazy|children)\b/g;
      while ((m = rb.exec(jsText)) !== null) {
        const s = m[1];
        if (!s.includes(":") && !s.includes("*") && s !== "index") routes.add("/" + s.toLowerCase());
      }
      const rb2 = /(?:element|Component|lazy)\b[^}]{0,200}?path\s*:\s*["']([a-zA-Z][a-zA-Z0-9/_-]{1,50})["']/g;
      while ((m = rb2.exec(jsText)) !== null) {
        const s = m[1];
        if (!s.includes(":") && !s.includes("*") && s !== "index") routes.add("/" + s.toLowerCase());
      }
      // c) to="/route" (React Router Link)
      const rc = /\bto\s*[=:]\s*["'](\/[a-zA-Z0-9][a-zA-Z0-9/_-]*)["']/g;
      while ((m = rc.exec(jsText)) !== null) if (m[1].length < 80) routes.add(m[1]);
      // d) navigate/push/replace/redirect("/route")
      const rd = /(?:navigate|router\.push|router\.replace|push|replace|redirect)\s*\(\s*["'](\/[a-zA-Z0-9][a-zA-Z0-9/_-]*)["']/g;
      while ((m = rd.exec(jsText)) !== null) if (m[1].length < 80) routes.add(m[1]);
      // e) href="/route"
      const re2 = /\bhref\s*[:=]\s*["'](\/[a-zA-Z0-9][a-zA-Z0-9/_-]*)["']/g;
      while ((m = re2.exec(jsText)) !== null)
        if (!m[1].match(/\.\w{2,4}$/) && m[1].length < 80) routes.add(m[1]);
      // f) lazy chunk names → pagename
      const rf = /import\s*\(\s*["'][./]+([A-Za-z][A-Za-z0-9_-]*)(?:-[a-f0-9]+)?\.(?:js|tsx?|jsx?)["']\)/g;
      while ((m = rf.exec(jsText)) !== null) {
        const ch = m[1];
        if (!/^(index|app|main|root|layout|vendor|chunk|router|utils?|lib|common|polyfill|entry|client|server|runtime|manifest)$/i.test(ch)) {
          const rt = "/" + ch.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          if (rt.length > 1 && rt.length < 60) routes.add(rt);
        }
      }
    }

    // ── 5a. Scan inline <script> blocks in root HTML ─────────────────
    {
      let inlineCount = 0;
      const beforeInline = routes.size;
      const inlineRx = /<script(?:\s[^>]*)?>([^<]{10,})<\/script>/gis;
      let im: RegExpExecArray | null;
      while ((im = inlineRx.exec(html)) !== null) {
        if (im[0].includes(' src="') || im[0].includes(" src='")) continue;
        inlineCount++;
        scanJsForRoutes(im[1]);
      }
      const foundInline = routes.size - beforeInline;
      if (inlineCount > 0) {
        diagnostics.push({ strategy: "Inline scripts", ok: true, detail: `${inlineCount} block${inlineCount !== 1 ? "s" : ""}, ${foundInline} new route${foundInline !== 1 ? "s" : ""}` });
      }
    }

    // ── 5b. Scan ALL external JS bundles ─────────────────────────────
    const uniqueSrcs = Array.from(new Set(scriptSrcs));
    console.log(`[FlowMapper Make] Scanning ${uniqueSrcs.length} JS bundle(s)…`);

    {
      let bundlesScanned = 0;
      let bundlesFailed = 0;
      const beforeBundles = routes.size;
      for (const src of uniqueSrcs) {
        try {
          const jsSrc = src.startsWith("http") ? src : new URL(src, base).href;
          const jsResp = await proxyFetch(jsSrc, px);
          if (!jsResp.ok) { bundlesFailed++; continue; }
          const jsText = await jsResp.text();
          scanJsForRoutes(jsText);
          bundlesScanned++;
        } catch { bundlesFailed++; }
      }
      const foundBundles = routes.size - beforeBundles;
      diagnostics.push({
        strategy: "JS bundles",
        ok: bundlesScanned > 0,
        detail: `${bundlesScanned}/${uniqueSrcs.length} scanned${bundlesFailed > 0 ? ` (${bundlesFailed} failed/CORS)` : ""}, ${foundBundles} new route${foundBundles !== 1 ? "s" : ""}`,
      });
    }
  } catch (e: any) {
    const msg = e?.message || "Unknown error";
    console.log("[FlowMapper Make] Route discovery error:", e);
    diagnostics.push({ strategy: "Overall", ok: false, detail: msg });
    const allCorsBlocked = diagnostics.every((d) => !d.ok);
    return {
      routes: ["/"],
      diagnostics,
      error: msg.includes("Failed to fetch") || msg.includes("CORS") ? "CORS blocked all requests" : msg,
      allCorsBlocked,
      usedProxy: px,
    };
  }

  // Detect if everything was CORS blocked
  const allCorsBlocked = diagnostics.filter(d => d.strategy !== "Mode").every((d) => !d.ok);

  const finalRoutes = Array.from(routes)
    .filter(r => r.startsWith("/") && !r.match(/\.\w{2,4}$/) && r.length < 100 && !r.includes("?") && !r.includes("#"))
    .sort();
  console.log(`[FlowMapper Make] Discovery complete: ${finalRoutes.length} routes →`, finalRoutes);
  return { routes: finalRoutes, diagnostics, allCorsBlocked, usedProxy: px };
}

function routeToName(route: string): string {
  if (route === "/") return "Home";
  return route
    .split("/")
    .filter(Boolean)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " "))
    .join(" › ");
}

export async function parseFigmaMakeSite(
  baseUrl: string,
  extraRoutes: string[] = [],
  onProgress?: ProgressCallback,
  onAlert?: AlertCallback,
  manualFlows: ManualFlow[] = []
): Promise<{ screens: Screen[]; connections: Connection[] }> {
  const base = baseUrl.replace(/\/+$/, "");
  onProgress?.("Scanning Figma Make site", base, 0);

  // ─── 1. Collect all routes ─────────────────────────
  // From manual flows, extra routes, and auto-discovery
  const flowRoutes = manualFlows.flatMap((f) => f.routes);
  const allInputRoutes = [...extraRoutes, ...flowRoutes];

  const autoResult = allInputRoutes.length > 0 ? { routes: ["/"], diagnostics: [] } : await discoverMakeRoutes(base);
  const allRoutes = Array.from(
    new Set([
      ...autoResult.routes,
      ...allInputRoutes.map((r) => (r.startsWith("/") ? r : "/" + r)),
    ])
  ).sort();
  if (allRoutes.length === 0) allRoutes.push("/");

  onProgress?.("Building screens", `${allRoutes.length} routes`, 40);

  // ─── 2. Create screens ─────────────────────────────
  const screens: Screen[] = allRoutes.map((route, i) => ({
    id: `make-${i}`,
    name: routeToName(route),
    x: 0,
    y: 0,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    figmaFrameId: route,
    pageUrl: route === "/" ? base : `${base}${route}`,
  }));

  const routeToScreenId = new Map(screens.map((s) => [s.figmaFrameId, s.id]));

  // ─── 3. Build connections from manual flows ────────
  const connections: Connection[] = [];
  const seenEdges = new Set<string>();
  let connIdx = 0;

  if (manualFlows.length > 0) {
    onProgress?.("Building flow connections", `${manualFlows.length} flows defined`, 60);

    for (const flow of manualFlows) {
      const routePaths = flow.routes.map((r) => (r.startsWith("/") ? r : "/" + r));

      for (let i = 0; i < routePaths.length - 1; i++) {
        const srcId = routeToScreenId.get(routePaths[i]);
        const dstId = routeToScreenId.get(routePaths[i + 1]);
        if (!srcId || !dstId || srcId === dstId) continue;

        const edgeKey = `${srcId}->${dstId}`;
        if (seenEdges.has(edgeKey)) continue;
        seenEdges.add(edgeKey);

        connections.push({
          id: `conn-${connIdx++}`,
          sourceId: srcId,
          destinationId: dstId,
          trigger: flow.name || "Navigate",
          flowType: flow.flowType,
        });
      }
    }

    onAlert?.({
      level: "success",
      title: "Flows applied",
      message: `${manualFlows.length} flow(s) → ${connections.length} connections generated.`,
      dismissible: true,
      autoDismissMs: 5000,
    });
  } else {
    // ─── 4. Fallback: try auto-discovery via fetch, then heuristic ─
    onProgress?.("Discovering connections", "Scanning links", 60);
    const rawConns: Array<{ sourceId: string; destinationId: string; trigger: string }> = [];

    for (const screen of screens) {
      try {
        const resp = await fetch(screen.pageUrl!, { mode: "cors" });
        if (!resp.ok) continue;
        const html = await resp.text();
        const linkRegex = /href="(\/[a-zA-Z0-9/_-]*)"/gi;
        let match: RegExpExecArray | null;
        const seen = new Set<string>();
        while ((match = linkRegex.exec(html)) !== null) {
          const targetRoute = match[1] || "/";
          const targetScreenId = routeToScreenId.get(targetRoute);
          if (targetScreenId && targetScreenId !== screen.id && !seen.has(targetScreenId)) {
            seen.add(targetScreenId);
            rawConns.push({ sourceId: screen.id, destinationId: targetScreenId, trigger: "Navigation" });
          }
        }
      } catch {}
    }

    if (rawConns.length > 0) {
      // Use auto-discovered connections with classification
      const classified = classifyConnections(screens, rawConns);
      connections.push(...classified);
    } else if (screens.length > 1) {
      // Last resort: try heuristic connections based on URL structure
      onProgress?.("Inferring connections", "Analyzing URL structure", 70);
      const heuristic = inferHeuristicConnections(screens, routeToScreenId);
      if (heuristic.length > 0) {
        connections.push(...heuristic);
        onAlert?.({
          level: "info",
          title: "Connections inferred",
          message: `CORS blocked direct scanning. ${heuristic.length} connections were inferred from URL structure. Use the Flow Editor for precise control.`,
          dismissible: true,
          autoDismissMs: 8000,
        });
      } else {
        // Absolute last resort: sequential
        for (let i = 0; i < screens.length - 1; i++) {
          connections.push({
            id: `conn-${connIdx++}`,
            sourceId: screens[i].id,
            destinationId: screens[i + 1].id,
            trigger: "Navigate",
            flowType: i === 0 ? "happy" : "secondary",
          });
        }
        onAlert?.({
          level: "warning",
          title: "Sequential fallback",
          message: "Could not detect navigation structure. Connections are sequential. Use the Flow Editor to define the actual flows.",
          dismissible: true,
          autoDismissMs: 8000,
        });
      }
    }
  }

  onProgress?.("Complete", `${screens.length} screens, ${connections.length} connections`, 100);
  console.log(`[FlowMapper Make] ${allRoutes.length} routes, ${connections.length} connections from ${base}`);
  return { screens, connections };
}

/**
 * Infer connections from URL structure when CORS blocks direct scanning.
 *
 * Heuristics:
 * 1. Parent→child: /foo connects to /foo/bar
 * 2. Sequential siblings: /step-1 → /step-2 → /step-3
 * 3. Hub pattern: / connects to all top-level routes
 * 4. Shared prefix groups: /checkout/cart → /checkout/review → /checkout/confirm
 */
function inferHeuristicConnections(
  screens: Screen[],
  routeToScreenId: Map<string, string>
): Connection[] {
  const connections: Connection[] = [];
  const seen = new Set<string>();
  let idx = 0;

  function addConn(srcRoute: string, dstRoute: string, trigger: string, flowType: FlowType) {
    const srcId = routeToScreenId.get(srcRoute);
    const dstId = routeToScreenId.get(dstRoute);
    if (!srcId || !dstId || srcId === dstId) return;
    const key = `${srcId}->${dstId}`;
    if (seen.has(key)) return;
    seen.add(key);
    connections.push({
      id: `conn-${idx++}`,
      sourceId: srcId,
      destinationId: dstId,
      trigger,
      flowType,
    });
  }

  const routes = screens.map((s) => s.figmaFrameId).sort();

  // 1. Hub: "/" connects to all single-segment routes
  const root = "/";
  if (routeToScreenId.has(root)) {
    for (const route of routes) {
      if (route === root) continue;
      const segments = route.split("/").filter(Boolean);
      if (segments.length === 1) {
        addConn(root, route, "Navigate", "happy");
      }
    }
  }

  // 2. Parent→child: /foo → /foo/bar
  for (const route of routes) {
    if (route === "/") continue;
    const segments = route.split("/").filter(Boolean);
    if (segments.length > 1) {
      const parent = "/" + segments.slice(0, -1).join("/");
      if (routeToScreenId.has(parent)) {
        addConn(parent, route, "Navigate", "secondary");
      }
    }
  }

  // 3. Sequential siblings: group by prefix, sort by suffix
  const groups = new Map<string, string[]>();
  for (const route of routes) {
    if (route === "/") continue;
    const segments = route.split("/").filter(Boolean);
    const prefix = segments.length > 1 ? "/" + segments.slice(0, -1).join("/") : "/";
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(route);
  }

  for (const [prefix, siblings] of groups) {
    if (siblings.length < 2) continue;

    // Sort siblings - try to detect numeric ordering
    const sorted = [...siblings].sort((a, b) => {
      const aLast = a.split("/").pop() || "";
      const bLast = b.split("/").pop() || "";
      // Extract trailing numbers
      const aNum = aLast.match(/(\d+)$/);
      const bNum = bLast.match(/(\d+)$/);
      if (aNum && bNum) return parseInt(aNum[1]) - parseInt(bNum[1]);
      return aLast.localeCompare(bLast);
    });

    for (let i = 0; i < sorted.length - 1; i++) {
      addConn(sorted[i], sorted[i + 1], "Next", "secondary");
    }
  }

  return connections;
}