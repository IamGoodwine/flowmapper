import React, { useState, useCallback, useRef } from "react";
import {
  X,
  BookOpen,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Play,
  ClipboardPaste,
  Eye,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Shield,
  Clock,
  Zap,
  FileWarning,
  GitBranch,
  Rows3,
  Link,
  Globe,
} from "lucide-react";
import type { Screen, Connection, FlowType, NodeKind } from "./types";
import { NODE_WIDTH, NODE_HEIGHT, FLOW_COLORS, FLOW_LABELS } from "./types";
import { autoLayout } from "./layout";
import { smartLayout } from "./smart-layout";
import { FlowDocHelp } from "./FlowDocHelp";

// ─── Types ─────────────────────────────────────────────

export interface FlowDocResult {
  screens: Screen[];
  connections: Connection[];
}

// ─── Processing progress tracker ───────────────────────

interface ProcessingStep {
  id: string;
  label: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
  detail?: string;
  durationMs?: number;
}

const INITIAL_STEPS: () => ProcessingStep[] = () => [
  { id: "validate", label: "Validazione input", status: "pending" },
  { id: "extract", label: "Estrazione blocchi JSON", status: "pending" },
  { id: "parse", label: "Parsing struttura dati", status: "pending" },
  { id: "text", label: "Analisi testo strutturato", status: "pending" },
  { id: "dedup", label: "Deduplicazione", status: "pending" },
  { id: "convert", label: "Conversione diagramma", status: "pending" },
  { id: "layout", label: "Auto-layout nodi", status: "pending" },
];

// Max content size: 500KB
const MAX_CONTENT_SIZE = 512_000;
// Max processing time: 8 seconds
const PROCESSING_TIMEOUT_MS = 8_000;
// Max items per category to prevent runaway loops
const MAX_ITEMS = 500;

/** Allow the browser to repaint between steps */
function yieldToUI(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/** Parsed flow documentation structure */
interface ParsedFlowDoc {
  rawText: string;
  screens: ParsedScreen[];
  connections: ParsedConnection[];
  decisions: ParsedDecision[];
  flows: ParsedFlow[];
  notes: string[];
  /** Optional base URL of the site (e.g. "https://my-site.figma.site") */
  siteUrl?: string;
}

interface ParsedScreen {
  id: string;
  name: string;
  route?: string;
  pageUrl?: string;
  thumbnailUrl?: string;
  description?: string;
  /** User-facing goal: what does the user want to achieve on this screen */
  userGoal?: string;
  /** Acceptance criteria or key interactions on this screen */
  interactions?: string[];
  /** When we detect a FlowMapper export, store the original Screen object for direct passthrough */
  _originalScreen?: Screen;
}

interface ParsedConnection {
  from: string;
  to: string;
  trigger: string;
  flowType: FlowType;
  condition?: "yes" | "no";
  reason?: string;
  /** User intent: the psychological motivation driving this transition */
  userIntent?: string;
}

interface ParsedDecision {
  id: string;
  question: string;
  yesTarget: string;
  noTarget: string;
  /** Explicit flowType for the NO path (if omitted, inferred by heuristic) */
  noFlowType?: FlowType;
  /** ID of the screen that leads INTO this decision (helps splicing) */
  sourceId?: string;
}

interface ParsedFlow {
  name: string;
  flowType: FlowType;
  steps: string[];
}

// ─── Parser (synchronous, called from async pipeline) ──

function parseFlowDocumentation(text: string): ParsedFlowDoc {
  const doc: ParsedFlowDoc = {
    rawText: text,
    screens: [],
    connections: [],
    decisions: [],
    flows: [],
    notes: [],
  };

  const jsonBlocks = extractJsonBlocks(text);
  for (const block of jsonBlocks) {
    try {
      const parsed = JSON.parse(block);
      if (parsed && typeof parsed === "object") {
        mergeJsonData(doc, parsed);
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  parseStructuredText(doc, text);
  parseArrowNotation(doc, text);
  parseMarkdownFlows(doc, text);
  deduplicateDoc(doc);

  // Safety: clamp to MAX_ITEMS
  doc.screens = doc.screens.slice(0, MAX_ITEMS);
  doc.connections = doc.connections.slice(0, MAX_ITEMS);
  doc.decisions = doc.decisions.slice(0, MAX_ITEMS);
  doc.flows = doc.flows.slice(0, MAX_ITEMS);

  return doc;
}

/**
 * Improved JSON block extraction that handles large nested objects.
 * Uses bracket-counting instead of regex for standalone blocks.
 */
function extractJsonBlocks(text: string): string[] {
  const blocks: string[] = [];

  // 1. Fenced code blocks: ```json ... ``` (handles large content)
  const fencedRe = /```(?:json)?\s*\n([\s\S]*?)```/gi;
  let fm: RegExpExecArray | null;
  while ((fm = fencedRe.exec(text)) !== null) {
    const content = fm[1].trim();
    if (content.length > 5) blocks.push(content);
  }

  // 2. Bracket-counting extraction for standalone { } or [ ]
  //    This correctly handles deeply nested JSON that lazy regex misses
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") continue;

    const open = ch;
    const close = ch === "{" ? "}" : "]";
    let depth = 1;
    let j = i + 1;
    let inString = false;
    let escaped = false;

    while (j < text.length && depth > 0) {
      const c = text[j];
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === '"') {
        inString = !inString;
      } else if (!inString) {
        if (c === open) depth++;
        else if (c === close) depth--;
      }
      j++;
    }

    if (depth === 0) {
      const candidate = text.slice(i, j).trim();
      // Only consider substantial blocks with JSON-like content
      if (candidate.length > 30 && candidate.includes('"')) {
        // Avoid duplicates from fenced blocks we already captured
        if (!blocks.some((b) => b.includes(candidate) || candidate.includes(b))) {
          blocks.push(candidate);
        }
        i = j - 1; // skip past this block
      }
    }
  }

  return blocks;
}

function mergeJsonData(doc: ParsedFlowDoc, data: any): void {
  if (Array.isArray(data)) {
    for (const item of data.slice(0, MAX_ITEMS)) {
      if (item.name && (item.route || item.path || item.url || item.pageUrl)) {
        doc.screens.push({
          id: item.id || item.name.toLowerCase().replace(/\s+/g, "-"),
          name: item.name,
          route: item.route || item.path || item.figmaFrameId,
          pageUrl: item.pageUrl || (typeof item.url === "string" && item.url.startsWith("http") ? item.url : undefined),
          thumbnailUrl: item.thumbnailUrl,
          description: item.description,
        });
      }
    }
    return;
  }

  // Detect FlowMapper JSON export: has version field and screens with figmaFrameId
  const isFlowMapperExport = data.version && Array.isArray(data.screens) &&
    data.screens.length > 0 && data.screens[0].figmaFrameId !== undefined;

  if (data.screens || data.pages || data.nodes) {
    const screenList = (data.screens || data.pages || data.nodes || []).slice(0, MAX_ITEMS);
    for (const s of screenList) {
      const resolvedPageUrl = s.pageUrl || (typeof s.url === "string" && s.url.startsWith("http") ? s.url : undefined);
      const parsed: ParsedScreen = {
        id: s.id || s.name?.toLowerCase().replace(/\s+/g, "-") || `s-${doc.screens.length}`,
        name: s.name || s.label || s.title || "Unnamed",
        route: s.route || s.path || s.figmaFrameId,
        pageUrl: resolvedPageUrl,
        thumbnailUrl: s.thumbnailUrl,
        description: s.description || s.desc,
        userGoal: s.userGoal || s.goal || s.objective,
        interactions: Array.isArray(s.interactions) ? s.interactions.slice(0, 20) : undefined,
      };
      // If this is a FlowMapper export, store the original Screen object for lossless passthrough
      if (isFlowMapperExport && s.figmaFrameId !== undefined) {
        parsed._originalScreen = {
          id: s.id,
          name: s.name,
          x: typeof s.x === "number" ? s.x : 0,
          y: typeof s.y === "number" ? s.y : 0,
          width: s.width || NODE_WIDTH,
          height: s.height || NODE_HEIGHT,
          figmaFrameId: s.figmaFrameId,
          pageUrl: resolvedPageUrl,
          thumbnailUrl: s.thumbnailUrl,
          nodeKind: s.nodeKind,
          question: s.question,
        };
      }
      doc.screens.push(parsed);
    }
  }

  if (data.connections || data.edges || data.transitions || data.links) {
    const connList = (data.connections || data.edges || data.transitions || data.links || []).slice(0, MAX_ITEMS);
    for (const c of connList) {
      doc.connections.push({
        from: c.from || c.source || c.sourceId || "",
        to: c.to || c.target || c.destination || c.destinationId || "",
        trigger: c.trigger || c.label || c.action || "Navigate",
        flowType: normalizeFlowType(c.flowType || c.type || "happy"),
        condition: c.condition,
        reason: c.reason || c.motivation || c.rationale,
        userIntent: c.userIntent || c.intent || c.userMotivation,
      });
    }
  }

  if (data.decisions || data.decisionNodes) {
    const decList = (data.decisions || data.decisionNodes || []).slice(0, MAX_ITEMS);
    for (const d of decList) {
      doc.decisions.push({
        id: d.id || `dec-${doc.decisions.length}`,
        question: d.question || d.condition || d.label || "Decision?",
        yesTarget: d.yesTarget || d.yes || d.truePath || "",
        noTarget: d.noTarget || d.no || d.falsePath || "",
        noFlowType: d.noFlowType ? normalizeFlowType(d.noFlowType) : undefined,
        sourceId: d.sourceId || d.source || d.from || undefined,
      });
    }
  }

  if (data.flows || data.paths || data.userFlows) {
    const flowList = (data.flows || data.paths || data.userFlows || []).slice(0, MAX_ITEMS);
    for (const f of flowList) {
      doc.flows.push({
        name: f.name || f.label || `Flow ${doc.flows.length + 1}`,
        flowType: normalizeFlowType(f.flowType || f.type || "happy"),
        steps: f.steps || f.routes || f.pages || [],
      });
    }
  }

  if (data.notes) {
    if (Array.isArray(data.notes)) doc.notes.push(...data.notes.slice(0, 100));
    else if (typeof data.notes === "string") doc.notes.push(data.notes);
  }

  // Read siteUrl from JSON (top-level field)
  if (!doc.siteUrl && typeof (data.siteUrl || data.siteurl || data.baseUrl || data.baseurl) === "string") {
    doc.siteUrl = (data.siteUrl || data.siteurl || data.baseUrl || data.baseurl || "").replace(/\/+$/, "");
  }
}

function normalizeFlowType(raw: string): FlowType {
  const lower = (raw || "").toLowerCase().trim();
  if (lower.includes("happy") || lower === "main" || lower === "primary") return "happy";
  if (lower.includes("error") || lower === "failure" || lower === "fail") return "error";
  if (lower.includes("skip") || lower === "conditional") return "skip";
  if (lower.includes("variant") || lower === "alt" || lower === "alternative") return "variant";
  if (lower.includes("secondary") || lower === "sub") return "secondary";
  return "happy";
}

/**
 * Determine the flowType for a decision's NO path.
 * Priority: 1) explicit noFlowType from JSON, 2) existing connection flowType,
 * 3) keyword heuristic on the question text.
 *
 * Keywords suggesting NO = error (negative outcome / failure):
 *   corretto, sufficiente, valido, riuscit, verificat, confermat, autorizzat,
 *   disponibil, completat, riconosciut, attivo, abilitat, present, esist
 *
 * Keywords suggesting NO = variant/skip (neutral branch):
 *   richiede, necessita, prevede, contiene, include, tipo, è, ha, vuole,
 *   selezionat, scelto, prefer
 */
const ERROR_KEYWORDS_RE =
  /\b(corrett|sufficient|valid|riuscit|verificat|confermat|autorizzat|disponibil|completat|riconosciut|attiv|abilitat|present|esist|superati?|falliti?|scadut|bloccati?)\b/i;

function inferNoFlowType(
  dec: ParsedDecision,
  doc: ParsedFlowDoc,
  resolveToName?: (ref: string) => string,
): FlowType {
  // 1) Explicit from JSON
  if (dec.noFlowType) return dec.noFlowType;

  // 2) Check if there's already a decision→noTarget connection in doc.connections with a flowType
  if (dec.noTarget) {
    const noTargetName = resolveToName ? resolveToName(dec.noTarget) : dec.noTarget;
    const existing = doc.connections.find(
      (c) => {
        const fromName = resolveToName ? resolveToName(c.from) : c.from;
        const toName = resolveToName ? resolveToName(c.to) : c.to;
        return (
          fromName.toLowerCase() === dec.question.toLowerCase() &&
          toName.toLowerCase() === noTargetName.toLowerCase()
        );
      }
    );
    if (existing) return existing.flowType;
  }

  // 3) Keyword heuristic on the question
  //    If the question implies a success check (corretto, sufficiente, valido…),
  //    then NO = error. Otherwise NO = variant (neutral alternative).
  if (ERROR_KEYWORDS_RE.test(dec.question)) return "error";

  // Default: neutral alternative path, not an error
  return "variant";
}

function parseStructuredText(doc: ParsedFlowDoc, text: string): void {
  const screenPattern = /(?:screen|page|nodo|schermata|pagina)\s*[:：]\s*(.+)/gi;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = screenPattern.exec(text)) !== null && count < MAX_ITEMS) {
    const name = m[1].trim().replace(/[*_`]/g, "");
    if (name && name.length < 100) {
      const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      if (!doc.screens.some((s) => s.name === name || s.id === id)) {
        doc.screens.push({ id, name });
        count++;
      }
    }
  }

  const routeLines = text.matchAll(/(?:^|\n)\s*[-•*]?\s*(\/[a-zA-Z0-9/_-]+)\s*[-–—:]\s*(.+)/g);
  for (const rm of routeLines) {
    if (count >= MAX_ITEMS) break;
    const route = rm[1].trim();
    const name = rm[2].trim().replace(/[*_`]/g, "");
    if (route && name && name.length < 100) {
      const id = route.replace(/\//g, "-").replace(/^-/, "") || "home";
      if (!doc.screens.some((s) => s.route === route)) {
        doc.screens.push({ id, name, route });
        count++;
      }
    }
  }
}

function parseArrowNotation(doc: ParsedFlowDoc, text: string): void {
  const arrowPattern = /([A-Za-zÀ-ÿ0-9 _/()-]+)\s*(?:→|->|=>|➡️|➜)\s*([A-Za-zÀ-ÿ0-9 _/()-]+)(?:\s*(?:\(|[:：])\s*([^)\n]+)\)?)?/g;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = arrowPattern.exec(text)) !== null && count < MAX_ITEMS) {
    const from = m[1].trim().replace(/[*_`]/g, "");
    const to = m[2].trim().replace(/[*_`]/g, "");
    const trigger = m[3]?.trim().replace(/[*_`]/g, "") || "Navigate";

    if (from && to && from.length < 80 && to.length < 80) {
      const lineStart = text.lastIndexOf("\n", m.index);
      const line = text.slice(lineStart, m.index + m[0].length);
      let flowType: FlowType = "happy";
      if (/error|errore|fallimento|fail/i.test(line)) flowType = "error";
      else if (/skip|salto|condizion/i.test(line)) flowType = "skip";
      else if (/variante|variant|alt/i.test(line)) flowType = "variant";
      else if (/secondar|sub|altern/i.test(line)) flowType = "secondary";

      doc.connections.push({ from, to, trigger, flowType });
      count++;
    }
  }
}

function parseMarkdownFlows(doc: ParsedFlowDoc, text: string): void {
  const flowPattern = /(?:(?:happy|main|error|secondary|variant|percorso|flusso)\s*(?:path|flow)?)\s*[:：]\s*(.+)/gi;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = flowPattern.exec(text)) !== null && count < MAX_ITEMS) {
    const flowLine = m[0];
    const stepsStr = m[1].trim();

    let steps: string[];
    if (stepsStr.includes("→") || stepsStr.includes("->")) {
      steps = stepsStr.split(/\s*(?:→|->|=>)\s*/).map((s) => s.trim()).filter(Boolean);
    } else if (stepsStr.includes(",")) {
      steps = stepsStr.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      steps = stepsStr.split(/\s*[→>]\s*/).filter(Boolean);
    }

    if (steps.length >= 2) {
      let flowType: FlowType = "happy";
      if (/error|errore/i.test(flowLine)) flowType = "error";
      else if (/secondary|secondar/i.test(flowLine)) flowType = "secondary";
      else if (/variant|variante/i.test(flowLine)) flowType = "variant";
      else if (/skip|salto/i.test(flowLine)) flowType = "skip";

      doc.flows.push({
        name: flowLine.split(/[:：]/)[0].trim(),
        flowType,
        steps: steps.map((s) => s.replace(/[*_`\d.)\]]/g, "").trim()),
      });
      count++;
    }
  }
}

function deduplicateDoc(doc: ParsedFlowDoc): void {
  const seenScreens = new Map<string, ParsedScreen>();
  for (const s of doc.screens) {
    const key = s.name.toLowerCase();
    if (!seenScreens.has(key)) {
      seenScreens.set(key, s);
    } else {
      const existing = seenScreens.get(key)!;
      if (!existing.route && s.route) existing.route = s.route;
      if (!existing.pageUrl && s.pageUrl) existing.pageUrl = s.pageUrl;
      if (!existing.thumbnailUrl && s.thumbnailUrl) existing.thumbnailUrl = s.thumbnailUrl;
      if (!existing.description && s.description) existing.description = s.description;
      if (!existing._originalScreen && s._originalScreen) existing._originalScreen = s._originalScreen;
    }
  }
  doc.screens = Array.from(seenScreens.values());

  const seenConns = new Set<string>();
  doc.connections = doc.connections.filter((c) => {
    const key = `${c.from.toLowerCase()}->${c.to.toLowerCase()}`;
    if (seenConns.has(key)) return false;
    seenConns.add(key);
    return true;
  });
}

// ─── Converter: ParsedFlowDoc → DiagramData ────────────

function convertToDiagramData(doc: ParsedFlowDoc, siteUrl?: string): FlowDocResult {
  const screens: Screen[] = [];
  const connections: Connection[] = [];
  const nameToId = new Map<string, string>();
  let screenIdx = 0;
  let connIdx = 0;

  // Build a lookup from original parsed screen id → parsed screen.
  // Connections and decisions in the JSON often reference screens by their id
  // (e.g. "myposte") rather than their display name (e.g. "MyPoste").
  const parsedScreenById = new Map<string, ParsedScreen>();
  for (const s of doc.screens) {
    parsedScreenById.set(s.id.toLowerCase(), s);
  }

  /** Resolve a reference (could be a screen id or a screen name) to the canonical screen name */
  const resolveToName = (ref: string): string => {
    if (!ref) return ref;
    const lower = ref.toLowerCase().trim();
    // 1. Exact match on parsed screen id
    const byId = parsedScreenById.get(lower);
    if (byId) return byId.name;
    // 2. Exact match on parsed screen name
    const byName = doc.screens.find((s) => s.name.toLowerCase() === lower);
    if (byName) return byName.name;
    // 3. Fuzzy: check if any screen id contains/is contained by the ref
    for (const [sid, screen] of parsedScreenById) {
      if (sid.includes(lower) || lower.includes(sid)) return screen.name;
    }
    // 4. Return as-is (will create a standalone node)
    return ref;
  };

  // Collect unique screen names — resolve all refs through parsedScreenById first
  // to avoid duplicates from id vs name mismatch
  const allScreenNames = new Set<string>();
  for (const s of doc.screens) allScreenNames.add(s.name);
  for (const d of doc.decisions) allScreenNames.add(d.question);
  for (const f of doc.flows) {
    for (const step of f.steps) allScreenNames.add(resolveToName(step));
  }
  for (const c of doc.connections) {
    allScreenNames.add(resolveToName(c.from));
    allScreenNames.add(resolveToName(c.to));
  }
  for (const d of doc.decisions) {
    if (d.yesTarget) allScreenNames.add(resolveToName(d.yesTarget));
    if (d.noTarget) allScreenNames.add(resolveToName(d.noTarget));
  }

  for (const name of allScreenNames) {
    if (!name || name.length > 100) continue;
    if (screenIdx >= MAX_ITEMS) break;

    const id = `doc-${screenIdx++}`;
    const existing = doc.screens.find((s) => s.name.toLowerCase() === name.toLowerCase());
    const decision = doc.decisions.find((d) => d.question.toLowerCase() === name.toLowerCase());
    const nodeKind: NodeKind = decision ? "decision" : "screen";

    // If we have the original FlowMapper Screen object, use it directly for lossless import
    if (existing?._originalScreen) {
      const orig = existing._originalScreen;
      screens.push({
        ...orig,
        id,
        nodeKind: nodeKind || orig.nodeKind,
        question: decision?.question || orig.question,
      });
    } else {
      // Derive pageUrl: explicit pageUrl > siteUrl + route > undefined
      const derivedPageUrl = existing?.pageUrl
        || (siteUrl && existing?.route ? `${siteUrl}${existing.route}` : undefined);
      screens.push({
        id,
        name: existing?.name || name,
        x: 0,
        y: 0,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        figmaFrameId: existing?.route || id,
        pageUrl: derivedPageUrl,
        thumbnailUrl: existing?.thumbnailUrl,
        nodeKind,
        question: decision?.question,
      });
    }

    nameToId.set(name.toLowerCase(), id);
    if (existing?.route) nameToId.set(existing.route.toLowerCase(), id);
    // Also map the original parsed screen id so connections referencing ids resolve correctly
    if (existing?.id) nameToId.set(existing.id.toLowerCase(), id);
  }

  for (const c of doc.connections) {
    if (connIdx >= MAX_ITEMS) break;
    const srcName = resolveToName(c.from);
    const dstName = resolveToName(c.to);
    const srcId = resolveScreenId(srcName, nameToId);
    const dstId = resolveScreenId(dstName, nameToId);
    if (!srcId || !dstId || srcId === dstId) continue;

    connections.push({
      id: `conn-${connIdx++}`,
      sourceId: srcId,
      destinationId: dstId,
      trigger: c.trigger,
      flowType: c.flowType,
      condition: c.condition,
      reason: c.userIntent ? `${c.reason || ""}${c.reason && c.userIntent ? " — " : ""}${c.userIntent || ""}`.trim() || undefined : c.reason,
    });
  }

  for (const flow of doc.flows) {
    for (let i = 0; i < flow.steps.length - 1; i++) {
      if (connIdx >= MAX_ITEMS) break;
      const srcName = resolveToName(flow.steps[i]);
      const dstName = resolveToName(flow.steps[i + 1]);
      const srcId = resolveScreenId(srcName, nameToId);
      const dstId = resolveScreenId(dstName, nameToId);
      if (!srcId || !dstId || srcId === dstId) continue;
      if (connections.some((c) => c.sourceId === srcId && c.destinationId === dstId)) continue;

      connections.push({
        id: `conn-${connIdx++}`,
        sourceId: srcId,
        destinationId: dstId,
        trigger: flow.name || "Navigate",
        flowType: flow.flowType,
      });
    }
  }

  // ── Inline-insert decisions into the flow graph ─────────
  // Each decision D has yesTarget and noTarget. We find the screen S that
  // currently connects to those targets and splice D in between:
  //   Before:  S → Y,  S → N
  //   After:   S → D,  D → Y (yes),  D → N (no)

  for (const dec of doc.decisions) {
    const decId = resolveScreenId(dec.question, nameToId);
    if (!decId) continue;

    const yesName = dec.yesTarget ? resolveToName(dec.yesTarget) : null;
    const noName = dec.noTarget ? resolveToName(dec.noTarget) : null;
    const yesId = yesName ? resolveScreenId(yesName, nameToId) : null;
    const noId = noName ? resolveScreenId(noName, nameToId) : null;

    // Find a source screen S that connects to BOTH yesTarget AND noTarget.
    // Only splice inline when both targets are known and a single source feeds both;
    // this avoids false splicing for orphan/ambiguous decisions.
    let bestSource: string | null = null;

    // Priority 0: explicit sourceId from JSON
    if (dec.sourceId) {
      const explicitSrc = resolveScreenId(resolveToName(dec.sourceId), nameToId);
      if (explicitSrc) bestSource = explicitSrc;
    }

    if (!bestSource && yesId && noId) {
      // Strict: source must connect to BOTH targets
      for (const c of connections) {
        if (c.sourceId === decId) continue;
        if (c.destinationId !== yesId && c.destinationId !== noId) continue;
        const sId = c.sourceId;
        const toYes = connections.some((cc) => cc.sourceId === sId && cc.destinationId === yesId);
        const toNo = connections.some((cc) => cc.sourceId === sId && cc.destinationId === noId);
        if (toYes && toNo) { bestSource = sId; break; }
      }
    }

    if (!bestSource && yesId && noId) {
      // Relaxed fallback: retry-loop pattern.
      // "OTP corretto?" yes→Esito, no→ConfermaOTP — with ConfermaOTP as source.
      // Accept if: source S connects to yesTarget AND noTarget === S (retry on NO).
      // We DON'T accept the reverse (yes loops back) — that creates confusing self-loops.
      for (const c of connections) {
        if (c.sourceId === decId) continue;
        if (c.destinationId === yesId && noId === c.sourceId) {
          bestSource = c.sourceId;
          break;
        }
      }
    }

    if (bestSource) {
      // Identify direct S→target connections to replace
      const toRemoveIds = new Set<string>();
      for (const c of connections) {
        if (c.sourceId !== bestSource) continue;
        if (yesId && c.destinationId === yesId) toRemoveIds.add(c.id);
        if (noId && c.destinationId === noId) toRemoveIds.add(c.id);
      }

      // Preserve trigger/reason from the removed connection for S→Decision edge
      const removedHappy = connections.find(
        (c) => toRemoveIds.has(c.id) && (c.flowType === "happy" || c.flowType === "secondary")
      );

      // Remove the direct connections
      for (const rid of toRemoveIds) {
        const idx = connections.findIndex((c) => c.id === rid);
        if (idx >= 0) connections.splice(idx, 1);
      }

      // Add S → Decision
      if (!connections.some((c) => c.sourceId === bestSource && c.destinationId === decId) && connIdx < MAX_ITEMS) {
        connections.push({
          id: `conn-${connIdx++}`,
          sourceId: bestSource,
          destinationId: decId,
          trigger: removedHappy?.trigger || "Verifica condizione",
          flowType: removedHappy?.flowType || "happy",
          reason: removedHappy?.reason,
        });
      }
    }

    // Add Decision → yesTarget (SÌ)
    if (yesId && yesId !== decId && connIdx < MAX_ITEMS) {
      const existingYes = connections.find((c) => c.sourceId === decId && c.destinationId === yesId);
      if (existingYes) {
        // Patch condition onto the already-created connection (e.g. from flow steps)
        existingYes.condition = "yes";
        if (!existingYes.trigger || existingYes.trigger === existingYes.flowType) existingYes.trigger = "SÌ";
      } else {
        connections.push({
          id: `conn-${connIdx++}`,
          sourceId: decId,
          destinationId: yesId,
          trigger: "SÌ",
          flowType: "happy",
          condition: "yes",
        });
      }
    }

    // Add Decision → noTarget (NO) with inferred flowType
    if (noId && noId !== decId && connIdx < MAX_ITEMS) {
      const existingNo = connections.find((c) => c.sourceId === decId && c.destinationId === noId);
      if (existingNo) {
        // Patch condition onto the already-created connection (e.g. from flow steps)
        existingNo.condition = "no";
        existingNo.flowType = inferNoFlowType(dec, doc);
        if (!existingNo.trigger || existingNo.trigger === existingNo.flowType) existingNo.trigger = "NO";
      } else {
        connections.push({
          id: `conn-${connIdx++}`,
          sourceId: decId,
          destinationId: noId,
          trigger: "NO",
          flowType: inferNoFlowType(dec, doc),
          condition: "no",
        });
      }
    }
  }

  const laid = autoLayout(screens, connections);
  return { screens: laid, connections };
}

// ─── Lanes converter: each flow becomes a horizontal row with duplicated nodes ─

type LayoutMode = "graph" | "lanes";

// Lane spacing now handled by smartLayout("horizontal") — constants removed.

function convertToDiagramDataLanes(doc: ParsedFlowDoc, siteUrl?: string): FlowDocResult {
  const screens: Screen[] = [];
  const connections: Connection[] = [];
  let screenIdx = 0;
  let connIdx = 0;

  // Build a lookup from parsed-screen id → parsed screen (for metadata resolution)
  const parsedScreenById = new Map<string, ParsedScreen>();
  for (const s of doc.screens) parsedScreenById.set(s.id.toLowerCase(), s);

  const resolveToName = (ref: string): string => {
    if (!ref) return ref;
    const lower = ref.toLowerCase().trim();
    const byId = parsedScreenById.get(lower);
    if (byId) return byId.name;
    const byName = doc.screens.find((s) => s.name.toLowerCase() === lower);
    if (byName) return byName.name;
    for (const [sid, screen] of parsedScreenById) {
      if (sid.includes(lower) || lower.includes(sid)) return screen.name;
    }
    return ref;
  };

  const findParsedScreen = (name: string): ParsedScreen | undefined => {
    return doc.screens.find((s) => s.name.toLowerCase() === name.toLowerCase());
  };

  const isDecision = (name: string): boolean => {
    return doc.decisions.some((d) => d.question.toLowerCase() === name.toLowerCase());
  };

  // ── Collect flow chains ────────────────────────────────
  interface LaneChain {
    label: string;
    flowType: FlowType;
    steps: string[]; // resolved screen names
  }

  const lanes: LaneChain[] = [];

  // 1) Explicit flows from doc.flows
  for (const flow of doc.flows) {
    const steps = flow.steps.map((s) => resolveToName(s)).filter(Boolean);
    if (steps.length < 2) continue;
    lanes.push({
      label: flow.name || FLOW_LABELS[flow.flowType],
      flowType: flow.flowType,
      steps,
    });
  }

  // 2) Build chains from connections grouped by flowType (skip types already covered by explicit flows)
  const coveredTypes = new Set(lanes.map((l) => l.flowType));
  const connsByType = new Map<FlowType, ParsedConnection[]>();

  // Exclude connections originating from decision nodes — decisions will be
  // spliced inline by step 3 instead of becoming standalone chain roots.
  const decisionNamesSet = new Set(
    doc.decisions.map((d) => d.question.toLowerCase())
  );

  for (const c of doc.connections) {
    const fromName = resolveToName(c.from).toLowerCase();
    if (decisionNamesSet.has(fromName)) continue;

    if (!connsByType.has(c.flowType)) connsByType.set(c.flowType, []);
    connsByType.get(c.flowType)!.push(c);
  }

  for (const [flowType, conns] of connsByType) {
    if (coveredTypes.has(flowType) && lanes.some((l) => l.flowType === flowType && l.steps.length >= 2)) continue;

    // Build adjacency and find roots (nodes with no incoming edge in this group)
    const adj = new Map<string, string[]>();
    const hasIncoming = new Set<string>();
    for (const c of conns) {
      const from = resolveToName(c.from);
      const to = resolveToName(c.to);
      if (!adj.has(from)) adj.set(from, []);
      adj.get(from)!.push(to);
      hasIncoming.add(to);
    }
    const allNodes = new Set([...adj.keys(), ...hasIncoming]);
    const roots = [...allNodes].filter((n) => !hasIncoming.has(n));
    if (roots.length === 0 && allNodes.size > 0) roots.push([...allNodes][0]);

    // DFS from each root to build chains
    for (const root of roots) {
      const visited = new Set<string>();
      const chain: string[] = [];
      let current: string | undefined = root;
      while (current && !visited.has(current)) {
        visited.add(current);
        chain.push(current);
        const nexts = adj.get(current);
        current = nexts?.[0]; // follow first outgoing
      }
      if (chain.length >= 2) {
        lanes.push({
          label: FLOW_LABELS[flowType],
          flowType,
          steps: chain,
        });
      }
    }
  }

  // 3) Splice decision nodes INTO existing lanes.
  //    For each decision D with yes→Y and no→N, find a lane that contains
  //    [..., S, Y, ...] where S also connects to N — insert D between S and Y.
  //    Then add a branch lane for the NO path.

  for (const dec of doc.decisions) {
    const yesName = dec.yesTarget ? resolveToName(dec.yesTarget) : null;
    const noName = dec.noTarget ? resolveToName(dec.noTarget) : null;
    if (!yesName) continue;

    const qLower = dec.question.toLowerCase();
    const noFlowType = inferNoFlowType(dec, doc, resolveToName);

    // Skip if decision is already in some lane
    if (lanes.some((l) => l.steps.some((s) => s.toLowerCase() === qLower))) continue;

    let spliced = false;

    // Strategy 0 (explicit sourceId): if the decision specifies sourceId, find [source, ...] and splice after source
    if (dec.sourceId) {
      const srcName = resolveToName(dec.sourceId).toLowerCase();
      for (const lane of lanes) {
        const sIdx = lane.steps.findIndex((s) => s.toLowerCase() === srcName);
        if (sIdx >= 0) {
          lane.steps.splice(sIdx + 1, 0, dec.question);
          spliced = true;
          break;
        }
      }
      if (spliced && noName) {
        const noLower = noName.toLowerCase();
        const noBranchExists = lanes.some(
          (l) =>
            l.steps.length >= 2 &&
            l.steps[0].toLowerCase() === qLower &&
            l.steps.some((s) => s.toLowerCase() === noLower)
        );
        if (!noBranchExists) {
          lanes.push({
            label: `${dec.question} → NO`,
            flowType: noFlowType,
            steps: [dec.question, noName],
          });
        }
      }
    }

    // Strategy A (strict): find lane with [..., S, Y, ...] where S also connects to N
    if (!spliced && noName) {
      const noLower = noName.toLowerCase();
      const yesLower = yesName.toLowerCase();

      for (const lane of lanes) {
        for (let i = 0; i < lane.steps.length - 1; i++) {
          if (lane.steps[i + 1].toLowerCase() !== yesLower) continue;
          const srcLower = lane.steps[i].toLowerCase();

          const srcToNo =
            (i + 2 < lane.steps.length && lane.steps[i + 2].toLowerCase() === noLower) ||
            lanes.some((l2) =>
              l2.steps.some(
                (s, j) =>
                  s.toLowerCase() === srcLower &&
                  j + 1 < l2.steps.length &&
                  l2.steps[j + 1].toLowerCase() === noLower
              )
            ) ||
            srcLower === noLower ||
            doc.connections.some(
              (c) =>
                resolveToName(c.from).toLowerCase() === srcLower &&
                resolveToName(c.to).toLowerCase() === noLower
            );

          if (srcToNo) {
            // Insert decision between S and Y: [..., S, D, Y, ...]
            lane.steps.splice(i + 1, 0, dec.question);
            spliced = true;
            // Do NOT remove noTarget from the chain — it may be legitimately
            // reachable via the YES path too (e.g. Importo → Decision → Data → Riepilogo).
            break;
          }
        }
        if (spliced) break;
      }

      if (spliced) {
        const noBranchExists = lanes.some(
          (l) =>
            l.steps.length >= 2 &&
            l.steps[0].toLowerCase() === qLower &&
            l.steps.some((s) => s.toLowerCase() === noLower)
        );
        if (!noBranchExists) {
          lanes.push({
            label: `${dec.question} → NO`,
            flowType: noFlowType,
            steps: [dec.question, noName],
          });
        }
      }
    }

    // Strategy B (relaxed): find any lane with yesTarget after some step
    if (!spliced) {
      const yesLower = yesName.toLowerCase();
      for (const lane of lanes) {
        const yIdx = lane.steps.findIndex(
          (s, idx) => idx > 0 && s.toLowerCase() === yesLower
        );
        if (yIdx > 0) {
          lane.steps.splice(yIdx, 0, dec.question);
          spliced = true;
          break;
        }
      }

      if (spliced && noName) {
        const noLower = noName.toLowerCase();
        const noBranchExists = lanes.some(
          (l) =>
            l.steps.length >= 2 &&
            l.steps[0].toLowerCase() === qLower &&
            l.steps.some((s) => s.toLowerCase() === noLower)
        );
        if (!noBranchExists) {
          lanes.push({
            label: `${dec.question} → NO`,
            flowType: noFlowType,
            steps: [dec.question, noName],
          });
        }
      }
    }

    // Fallback: create standalone decision lanes (orphan)
    if (!spliced) {
      if (yesName) {
        lanes.push({
          label: `${dec.question} → SÌ`,
          flowType: "happy",
          steps: [dec.question, yesName],
        });
      }
      if (noName) {
        lanes.push({
          label: `${dec.question} → NO`,
          flowType: noFlowType,
          steps: [dec.question, noName],
        });
      }
    }
  }

  if (lanes.length === 0) {
    // Fallback: use the standard graph converter
    return convertToDiagramData(doc);
  }

  // ── Generate diagram data per lane ─────────────────────
  for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
    const lane = lanes[laneIdx];
    const laneNodeIds: string[] = [];

    // Create a "lane label" node (invisible small node for the lane header)
    // We'll use a screen node with a special name prefix
    for (let stepIdx = 0; stepIdx < lane.steps.length; stepIdx++) {
      if (screenIdx >= MAX_ITEMS) break;
      const stepName = lane.steps[stepIdx];
      const parsed = findParsedScreen(stepName);
      const decision = isDecision(stepName);
      const id = `lane-${laneIdx}-${stepIdx}`;

      // If we have the original FlowMapper Screen object, use it for lossless import
      if (parsed?._originalScreen) {
        const orig = parsed._originalScreen;
        screens.push({
          ...orig,
          id,
          name: stepName,
          nodeKind: decision ? "decision" : (orig.nodeKind || "screen"),
          question: decision ? stepName : orig.question,
        });
      } else {
        const derivedPageUrl = parsed?.pageUrl
          || (siteUrl && parsed?.route ? `${siteUrl}${parsed.route}` : undefined);
        screens.push({
          id,
          name: stepName,
          x: 0,
          y: 0,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          figmaFrameId: parsed?.route || id,
          pageUrl: derivedPageUrl,
          thumbnailUrl: parsed?.thumbnailUrl,
          nodeKind: decision ? "decision" : "screen",
          question: decision ? stepName : undefined,
        });
      }
      screenIdx++;
      laneNodeIds.push(id);
    }

    // Create sequential connections within the lane
    for (let i = 0; i < laneNodeIds.length - 1; i++) {
      if (connIdx >= MAX_ITEMS) break;
      // Try to find the original connection for trigger/reason
      const srcName = lane.steps[i];
      const dstName = lane.steps[i + 1];
      const originalConn = doc.connections.find(
        (c) =>
          resolveToName(c.from).toLowerCase() === srcName.toLowerCase() &&
          resolveToName(c.to).toLowerCase() === dstName.toLowerCase()
      );

      // Determine condition for decision→target connections:
      // If the source is a decision node, check if the destination matches
      // yesTarget or noTarget to assign the correct condition.
      let condition = originalConn?.condition as "yes" | "no" | undefined;
      let connFlowType = lane.flowType;
      let trigger = originalConn?.trigger || lane.label;

      if (!condition && isDecision(srcName)) {
        const dec = doc.decisions.find(
          (d) => d.question.toLowerCase() === srcName.toLowerCase()
        );
        if (dec) {
          const dstLower = dstName.toLowerCase();
          const yesResolved = dec.yesTarget ? resolveToName(dec.yesTarget).toLowerCase() : null;
          const noResolved = dec.noTarget ? resolveToName(dec.noTarget).toLowerCase() : null;
          if (noResolved && dstLower === noResolved) {
            condition = "no";
            connFlowType = inferNoFlowType(dec, doc, resolveToName);
            if (!originalConn?.trigger) trigger = "NO";
          } else if (yesResolved && dstLower === yesResolved) {
            condition = "yes";
            connFlowType = "happy";
            if (!originalConn?.trigger) trigger = "SÌ";
          }
        }
      }

      connections.push({
        id: `conn-${connIdx++}`,
        sourceId: laneNodeIds[i],
        destinationId: laneNodeIds[i + 1],
        trigger,
        flowType: connFlowType,
        condition,
        reason: originalConn?.reason,
      });
    }
  }

  // Apply horizontal smart layout — each lane is a connected component,
  // so smartLayout will lay them out left→right and stack vertically.
  const laid = smartLayout(screens, connections, "horizontal");
  return { screens: laid, connections };
}

function resolveScreenId(name: string, nameToId: Map<string, string>): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase().trim();
  if (nameToId.has(lower)) return nameToId.get(lower);
  for (const [key, id] of nameToId) {
    if (key.includes(lower) || lower.includes(key)) return id;
  }
  return undefined;
}

// (Auto-fetch removed — manual paste only)





// ─── Processing Overlay Component ──────────────────────

function ProcessingOverlay({
  steps,
  elapsedMs,
  contentSize,
  onCancel,
}: {
  steps: ProcessingStep[];
  elapsedMs: number;
  contentSize: number;
  onCancel: () => void;
}) {
  const doneCount = steps.filter((s) => s.status === "done").length;
  const progress = Math.round((doneCount / steps.length) * 100);
  const currentStep = steps.find((s) => s.status === "running");

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      {/* Main spinner area */}
      <div className="relative">
        <svg width="80" height="80" viewBox="0 0 80 80">
          {/* Background circle */}
          <circle cx="40" cy="40" r="34" fill="none" stroke="#1f2937" strokeWidth="4" />
          {/* Progress arc */}
          <circle
            cx="40" cy="40" r="34" fill="none"
            stroke="#a855f7" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${progress * 2.14} 214`}
            transform="rotate(-90 40 40)"
            style={{ transition: "stroke-dasharray 0.3s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ color: "#a855f7", fontSize: 16 }}>{progress}%</span>
        </div>
      </div>

      {/* Title */}
      <div className="text-center">
        <div className="text-sm" style={{ color: "#e2e8f0" }}>
          Elaborazione in corso...
        </div>
        <div className="text-xs mt-1" style={{ color: "#6b7280" }}>
          {(contentSize / 1000).toFixed(1)} KB di contenuto
        </div>
      </div>

      {/* Steps list */}
      <div
        className="w-full rounded-lg p-3 flex flex-col gap-1.5"
        style={{ maxWidth: 400, background: "#0d0d18", border: "1px solid #1f2937" }}
      >
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-2.5">
            {/* Status icon */}
            <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
              {step.status === "pending" && (
                <div className="w-2 h-2 rounded-full" style={{ background: "#374151" }} />
              )}
              {step.status === "running" && (
                <Loader2 size={12} className="animate-spin" style={{ color: "#a855f7" }} />
              )}
              {step.status === "done" && (
                <CheckCircle2 size={12} style={{ color: "#22c55e" }} />
              )}
              {step.status === "skipped" && (
                <div className="w-2 h-2 rounded-full" style={{ background: "#4b5563" }} />
              )}
              {step.status === "error" && (
                <AlertTriangle size={12} style={{ color: "#ef4444" }} />
              )}
            </div>
            {/* Label */}
            <span
              className="flex-1 text-xs"
              style={{
                color:
                  step.status === "running" ? "#e2e8f0" :
                  step.status === "done" ? "#86efac" :
                  step.status === "error" ? "#fca5a5" :
                  "#6b7280",
              }}
            >
              {step.label}
            </span>
            {/* Duration */}
            {step.durationMs !== undefined && (
              <span className="text-xs" style={{ color: "#4b5563", fontFamily: "monospace" }}>
                {step.durationMs}ms
              </span>
            )}
            {/* Detail */}
            {step.detail && (
              <span className="text-xs" style={{ color: "#818cf8" }}>
                {step.detail}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Timer & safety */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#6b7280" }}>
          <Clock size={10} />
          {(elapsedMs / 1000).toFixed(1)}s / {PROCESSING_TIMEOUT_MS / 1000}s
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "#4b5563" }}>
          <Shield size={10} />
          Timeout automatico
        </div>
      </div>

      {/* Cancel button */}
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs transition-colors"
        style={{ background: "#1e1e2e", border: "1px solid #2d2d44", color: "#d1d5db" }}
      >
        <X size={12} />
        Annulla
      </button>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────

interface FlowDocReaderProps {
  screens: Screen[];
  connections: Connection[];
  onImport: (result: FlowDocResult) => void;
  onClose: () => void;
}

type Status = "idle" | "processing" | "parsed" | "error";

/** Detect if a parsed JSON object is a FlowMapper export with valid screens */
function isFlowMapperJson(data: any): data is { version: number; screens: any[]; connections: any[] } {
  return (
    data &&
    typeof data === "object" &&
    typeof data.version === "number" &&
    Array.isArray(data.screens) &&
    data.screens.length > 0 &&
    Array.isArray(data.connections) &&
    data.screens[0].figmaFrameId !== undefined
  );
}

/** Try to directly import a FlowMapper JSON export, preserving all Screen fields */
function tryDirectFlowMapperImport(text: string): FlowDocResult | null {
  try {
    const data = JSON.parse(text);
    if (!isFlowMapperJson(data)) return null;

    let screens: Screen[] = data.screens.map((s: any) => ({
      id: s.id || `s-${Math.random().toString(36).slice(2, 8)}`,
      name: s.name || "Unnamed",
      x: typeof s.x === "number" ? s.x : 0,
      y: typeof s.y === "number" ? s.y : 0,
      width: s.width || NODE_WIDTH,
      height: s.height || NODE_HEIGHT,
      figmaFrameId: s.figmaFrameId || s.id,
      pageUrl: s.pageUrl,
      thumbnailUrl: s.thumbnailUrl,
      nodeKind: s.nodeKind,
      question: s.question,
    }));

    const screenIds = new Set(screens.map(s => s.id));
    const connections: Connection[] = data.connections
      .filter((c: any) => c.sourceId && c.destinationId && screenIds.has(c.sourceId) && screenIds.has(c.destinationId))
      .map((c: any) => ({
        id: c.id || `c-${Math.random().toString(36).slice(2, 8)}`,
        sourceId: c.sourceId,
        destinationId: c.destinationId,
        trigger: c.trigger || "Navigate",
        flowType: c.flowType || "happy",
        condition: c.condition,
        reason: c.reason,
        labelT: c.labelT,
      }));

    // Re-layout if positions are all zero
    const allZero = screens.every(s => s.x === 0 && s.y === 0);
    if (allZero) {
      screens = autoLayout(screens, connections);
    }

    return { screens, connections };
  } catch {
    return null;
  }
}

export function FlowDocReader({ screens: _currentScreens, connections: _currentConns, onImport, onClose }: FlowDocReaderProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [parsedDoc, setParsedDoc] = useState<ParsedFlowDoc | null>(null);
  const [pasteContent, setPasteContent] = useState("");
  const [showRaw, setShowRaw] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("lanes");
  const pasteRef = useRef<HTMLTextAreaElement>(null);
  /** When a FlowMapper JSON export is detected, store it for direct import */
  const [directImportData, setDirectImportData] = useState<FlowDocResult | null>(null);
  /** Site URL for generating pageUrl on screens */
  const [siteUrl, setSiteUrl] = useState("");

  // Processing state
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>(INITIAL_STEPS);
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [processingContentSize, setProcessingContentSize] = useState(0);
  const cancelledRef = useRef(false);

  /** Update a step's status in-place */
  const updateStep = useCallback((id: string, updates: Partial<ProcessingStep>) => {
    setProcessingSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }, []);

  /**
   * Async processing pipeline with visual progress.
   * Each step yields to the UI to allow repaint.
   */
  const runProcessingPipeline = useCallback(
    async (text: string) => {
      cancelledRef.current = false;
      const steps = INITIAL_STEPS();
      setProcessingSteps(steps);
      setProcessingContentSize(text.length);
      setProcessingElapsed(0);
      setStatus("processing");

      const t0 = performance.now();
      const timerInterval = setInterval(() => {
        setProcessingElapsed(performance.now() - t0);
      }, 100);

      // Timeout guard
      const timeoutId = setTimeout(() => {
        cancelledRef.current = true;
      }, PROCESSING_TIMEOUT_MS);

      try {
        // ─── Step 1: Validate ─────────────────
        updateStep("validate", { status: "running" });
        await yieldToUI();

        const s1 = performance.now();
        if (text.length > MAX_CONTENT_SIZE) {
          text = text.slice(0, MAX_CONTENT_SIZE);
          updateStep("validate", {
            status: "done",
            detail: `Troncato a ${(MAX_CONTENT_SIZE / 1000).toFixed(0)}KB`,
            durationMs: Math.round(performance.now() - s1),
          });
        } else {
          updateStep("validate", {
            status: "done",
            detail: `${(text.length / 1000).toFixed(1)}KB OK`,
            durationMs: Math.round(performance.now() - s1),
          });
        }

        if (cancelledRef.current) throw new Error("TIMEOUT");

        // ─── Step 2: Extract JSON blocks ──────
        updateStep("extract", { status: "running" });
        await yieldToUI();

        const s2 = performance.now();
        const jsonBlocks = extractJsonBlocks(text);
        updateStep("extract", {
          status: "done",
          detail: `${jsonBlocks.length} blocc${jsonBlocks.length === 1 ? "o" : "hi"}`,
          durationMs: Math.round(performance.now() - s2),
        });

        if (cancelledRef.current) throw new Error("TIMEOUT");

        // ─── Step 3: Parse JSON ───────────────
        updateStep("parse", { status: "running" });
        await yieldToUI();

        const s3 = performance.now();
        const doc: ParsedFlowDoc = {
          rawText: text,
          screens: [],
          connections: [],
          decisions: [],
          flows: [],
          notes: [],
        };

        let jsonParsed = 0;
        for (const block of jsonBlocks) {
          try {
            const parsed = JSON.parse(block);
            if (parsed && typeof parsed === "object") {
              mergeJsonData(doc, parsed);
              jsonParsed++;
            }
          } catch {
            // skip
          }
        }

        updateStep("parse", {
          status: jsonParsed > 0 ? "done" : "skipped",
          detail: jsonParsed > 0
            ? `${doc.screens.length}S ${doc.connections.length}C ${doc.decisions.length}D`
            : "Nessun JSON valido",
          durationMs: Math.round(performance.now() - s3),
        });

        if (cancelledRef.current) throw new Error("TIMEOUT");

        // ─── Step 4: Text analysis ────────────
        updateStep("text", { status: "running" });
        await yieldToUI();

        const s4 = performance.now();
        const beforeScreens = doc.screens.length;
        const beforeConns = doc.connections.length;

        parseStructuredText(doc, text);
        parseArrowNotation(doc, text);
        parseMarkdownFlows(doc, text);

        const addedScreens = doc.screens.length - beforeScreens;
        const addedConns = doc.connections.length - beforeConns;

        updateStep("text", {
          status: addedScreens > 0 || addedConns > 0 ? "done" : "skipped",
          detail: addedScreens > 0 || addedConns > 0
            ? `+${addedScreens}S +${addedConns}C`
            : "Nessun dato aggiuntivo",
          durationMs: Math.round(performance.now() - s4),
        });

        if (cancelledRef.current) throw new Error("TIMEOUT");

        // ─── Step 5: Deduplication ────────────
        updateStep("dedup", { status: "running" });
        await yieldToUI();

        const s5 = performance.now();
        const beforeDedup = doc.screens.length + doc.connections.length;
        deduplicateDoc(doc);
        // Clamp
        doc.screens = doc.screens.slice(0, MAX_ITEMS);
        doc.connections = doc.connections.slice(0, MAX_ITEMS);
        doc.decisions = doc.decisions.slice(0, MAX_ITEMS);
        doc.flows = doc.flows.slice(0, MAX_ITEMS);
        const afterDedup = doc.screens.length + doc.connections.length;
        const removed = beforeDedup - afterDedup;

        updateStep("dedup", {
          status: "done",
          detail: removed > 0 ? `${removed} duplicati rimossi` : "Nessun duplicato",
          durationMs: Math.round(performance.now() - s5),
        });

        if (cancelledRef.current) throw new Error("TIMEOUT");

        // ─── Step 6: Convert ──────────────────
        updateStep("convert", { status: "running" });
        await yieldToUI();

        // (we don't convert now, just mark as done since we'll convert on demand)
        updateStep("convert", {
          status: "done",
          detail: `${doc.screens.length + doc.decisions.length} nodi pronti`,
          durationMs: 0,
        });

        // ─── Step 7: Layout ───────────────────
        updateStep("layout", { status: "running" });
        await yieldToUI();

        const s7 = performance.now();
        try {
          const testResult = convertToDiagramData(doc);
          updateStep("layout", {
            status: "done",
            detail: `${testResult.screens.length} nodi, ${testResult.connections.length} archi`,
            durationMs: Math.round(performance.now() - s7),
          });
        } catch (layoutErr: any) {
          updateStep("layout", {
            status: "error",
            detail: layoutErr?.message?.slice(0, 50) || "Errore layout",
            durationMs: Math.round(performance.now() - s7),
          });
          // Layout failed but parsed data is still valid — continue
        }

        // Done!
        clearTimeout(timeoutId);
        clearInterval(timerInterval);
        setProcessingElapsed(performance.now() - t0);

        setRawContent(text);
        setParsedDoc(doc);

        // Auto-fill siteUrl from JSON if user hasn't typed one yet
        if (doc.siteUrl && !siteUrl) {
          setSiteUrl(doc.siteUrl);
        }

        // Check if the input is a FlowMapper JSON export — offer direct import
        const directResult = tryDirectFlowMapperImport(text);
        setDirectImportData(directResult);

        // Short delay so user can see the completed steps
        await new Promise((r) => setTimeout(r, 400));

        setStatus("parsed");
      } catch (err: any) {
        clearTimeout(timeoutId);
        clearInterval(timerInterval);

        if (err?.message === "TIMEOUT" || cancelledRef.current) {
          setProcessingSteps((prev) =>
            prev.map((s) =>
              s.status === "running"
                ? { ...s, status: "error", detail: "Timeout raggiunto" }
                : s
            )
          );
          setErrorMsg(
            cancelledRef.current && err?.message !== "TIMEOUT"
              ? "Elaborazione annullata dall'utente."
              : `Timeout: l'elaborazione ha superato ${PROCESSING_TIMEOUT_MS / 1000}s. Il contenuto potrebbe essere troppo grande o malformato.`
          );
          setStatus("error");
        } else {
          setErrorMsg(err?.message || "Errore durante il parsing");
          setStatus("error");
        }
      }
    },
    [updateStep, siteUrl]
  );

  const handleManualParse = useCallback(async () => {
    const trimmed = pasteContent.trim();
    if (!trimmed) return;
    await runProcessingPipeline(trimmed);
  }, [pasteContent, runProcessingPipeline]);

  const handleCancelProcessing = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const effectiveSiteUrl = siteUrl.trim().replace(/\/+$/, "") || undefined;

  const handleApply = useCallback(() => {
    if (!parsedDoc) return;
    const result = layoutMode === "lanes"
      ? convertToDiagramDataLanes(parsedDoc, effectiveSiteUrl)
      : convertToDiagramData(parsedDoc, effectiveSiteUrl);
    onImport(result);
  }, [parsedDoc, onImport, layoutMode, effectiveSiteUrl]);

  /** Direct import: bypass conversion pipeline, use original FlowMapper Screen objects */
  const handleDirectImport = useCallback(() => {
    if (!directImportData) return;
    onImport(directImportData);
  }, [directImportData, onImport]);

  const totalItems = parsedDoc
    ? parsedDoc.screens.length + parsedDoc.connections.length + parsedDoc.decisions.length + parsedDoc.flows.length
    : 0;

  const preview = parsedDoc
    ? (layoutMode === "lanes" ? convertToDiagramDataLanes(parsedDoc, effectiveSiteUrl) : convertToDiagramData(parsedDoc, effectiveSiteUrl))
    : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="flex flex-col rounded-xl overflow-hidden"
        style={{
          background: "#13131f",
          border: "1px solid #2d2d44",
          boxShadow: "0 25px 80px rgba(0,0,0,0.8)",
          width: "min(900px, 95vw)",
          height: "min(700px, 92vh)",
        }}
      >
        {/* ═══ Header ═══ */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid #1f2937" }}
        >
          <div className="flex items-center gap-2.5">
            <BookOpen size={18} style={{ color: "#a855f7" }} />
            <span style={{ color: "white", fontSize: 15 }}>
              Flow Documentation Reader
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-xs"
              style={{ background: "#a855f720", color: "#a855f7", border: "1px solid #a855f730" }}
            >
              AI Study
            </span>
            {status === "processing" && (
              <span
                className="px-2 py-0.5 rounded-full text-xs flex items-center gap-1"
                style={{ background: "#a855f720", color: "#c4b5fd", border: "1px solid #a855f740" }}
              >
                <Loader2 size={10} className="animate-spin" />
                Elaborazione...
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowHelp(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors"
              style={{ background: "#a855f715", color: "#a855f7", border: "1px solid #a855f725" }}
              title="Guida al formato della documentazione"
            >
              <HelpCircle size={13} />
              Guida
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: "#6b7280" }}
            >
              <X size={16} />
            </button>
          </div>
        </div>



        {/* ═══ Body ═══ */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ minHeight: 0 }}>
          {/* ═══ PROCESSING STATE — step-by-step loader ═══ */}
          {status === "processing" && (
            <ProcessingOverlay
              steps={processingSteps}
              elapsedMs={processingElapsed}
              contentSize={processingContentSize}
              onCancel={handleCancelProcessing}
            />
          )}



          {/* Paste input — primary state */}
          {(status === "idle" || status === "error") && (
            <div className="flex flex-col gap-3 h-full">
              <div
                className="p-3 rounded-lg flex flex-col gap-2"
                style={{ background: "#0d0d18", border: "1px solid #1f2937" }}
              >
                <div className="flex items-center gap-2">
                  <ClipboardPaste size={14} style={{ color: "#a855f7" }} />
                  <span className="text-sm" style={{ color: "#d1d5db" }}>
                    Incolla il JSON dalla sezione AI Readable
                  </span>
                </div>
                <span className="text-xs" style={{ color: "#6b7280" }}>
                  Apri la pagina <strong>/flow-documentation</strong> del tuo sito Figma Make,
                  copia il blocco JSON dalla sezione <strong>AI Readable</strong> e incollalo qui sotto.
                  Il parser supporta JSON, testo strutturato e notazione con frecce.
                </span>
              </div>

              {/* Site URL input */}
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
                style={{ background: "#0d0d18", border: "1px solid #1f2937" }}
              >
                <Globe size={13} style={{ color: "#818cf8", flexShrink: 0 }} />
                <input
                  type="url"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  placeholder="URL del sito (auto-rilevato — modifica se necessario)"
                  className="flex-1 bg-transparent text-xs outline-none"
                  style={{ color: "#e5e7eb" }}
                />
                {siteUrl.trim() && (
                  <button
                    onClick={() => setSiteUrl("")}
                    className="p-0.5 rounded transition-colors"
                    style={{ color: "#6b7280" }}
                    title="Cancella URL"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* Error banner */}
              {status === "error" && errorMsg && (
                <div
                  className="p-2.5 rounded-lg flex items-center gap-2"
                  style={{ background: "#2d1500", border: "1px solid #713f12" }}
                >
                  <AlertTriangle size={14} style={{ color: "#f59e0b" }} />
                  <span className="text-xs" style={{ color: "#fde68a" }}>{errorMsg}</span>
                </div>
              )}

              {/* Size warning */}
              {pasteContent.length > MAX_CONTENT_SIZE && (
                <div
                  className="p-2.5 rounded-lg flex items-center gap-2"
                  style={{ background: "#2d1500", border: "1px solid #713f12" }}
                >
                  <FileWarning size={14} style={{ color: "#f59e0b" }} />
                  <span className="text-xs" style={{ color: "#fde68a" }}>
                    Il contenuto supera {(MAX_CONTENT_SIZE / 1000).toFixed(0)}KB e verra troncato automaticamente.
                  </span>
                </div>
              )}

              <textarea
                ref={pasteRef}
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder={`Incolla qui il JSON dalla sezione AI Readable...\n\nFormati supportati:\n- JSON: {"screens": [...], "connections": [...]}\n- Frecce: Home → Login → Dashboard\n- Liste: /home - Homepage, /login - Login\n- Flussi: Happy Path: Home → Login → Dashboard`}
                className="w-full flex-1 px-4 py-3 rounded-lg text-xs outline-none resize-none"
                style={{
                  background: "#1e1e2e",
                  border: "1px solid #2d2d44",
                  color: "white",
                  minHeight: 240,
                  fontFamily: "monospace",
                  lineHeight: 1.6,
                }}
                autoFocus
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs" style={{ color: "#4b5563" }}>
                    {pasteContent.length > 0 && `${(pasteContent.length / 1000).toFixed(1)} KB`}
                  </span>
                  {pasteContent.length > 5000 && (
                    <span className="flex items-center gap-1 text-xs" style={{ color: "#818cf8" }}>
                      <Zap size={10} />
                      Contenuto elaborato — il loader mostrera lo stato
                    </span>
                  )}
                </div>
                <button
                  onClick={handleManualParse}
                  disabled={!pasteContent.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs disabled:opacity-30"
                  style={{ background: "#a855f7", color: "white" }}
                >
                  <Sparkles size={12} />
                  Analizza contenuto
                </button>
              </div>
            </div>
          )}

          {/* Parsed results */}
          {status === "parsed" && parsedDoc && (
            <div className="flex flex-col gap-4">
              {/* Success banner */}
              <div
                className="p-3 rounded-lg flex items-start gap-3"
                style={{ background: "#1b2d1b", border: "1px solid #14521a" }}
              >
                <CheckCircle2 size={16} style={{ color: "#22c55e", marginTop: 2 }} />
                <div className="flex-1">
                  <div className="text-sm" style={{ color: "#86efac" }}>
                    Documentazione analizzata con successo
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "#6b9a6b" }}>
                    {parsedDoc.screens.length} schermate, {parsedDoc.connections.length} connessioni,{" "}
                    {parsedDoc.decisions.length} decisioni, {parsedDoc.flows.length} flussi trovati
                    {processingElapsed > 0 && (
                      <span style={{ color: "#4b5563" }}>
                        {" "}— elaborato in {(processingElapsed / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Site URL input (parsed state) */}
              <div
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg"
                style={{ background: "#0d0d18", border: `1px solid ${effectiveSiteUrl ? "#818cf830" : "#1f2937"}` }}
              >
                <Globe size={14} style={{ color: effectiveSiteUrl ? "#818cf8" : "#4b5563", flexShrink: 0 }} />
                <div className="flex-1 flex flex-col gap-0.5">
                  <input
                    type="url"
                    value={siteUrl}
                    onChange={(e) => setSiteUrl(e.target.value)}
                    placeholder="URL del sito (auto-rilevato)"
                    className="w-full bg-transparent text-xs outline-none"
                    style={{ color: "#e5e7eb" }}
                  />
                  <span className="text-xs" style={{ color: "#4b5563", fontSize: 9 }}>
                    {effectiveSiteUrl
                      ? `Le schermate con route riceveranno URL: ${effectiveSiteUrl}/...`
                      : "L'URL del sito verrà rilevato automaticamente dal dominio corrente"}
                  </span>
                </div>
                {effectiveSiteUrl && (
                  <span
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs flex-shrink-0"
                    style={{ background: "#818cf815", color: "#818cf8", border: "1px solid #818cf825", fontSize: 9 }}
                  >
                    <Link size={9} />
                    {parsedDoc.screens.filter((s) => s.route).length} URL
                  </span>
                )}
                {siteUrl.trim() && (
                  <button
                    onClick={() => setSiteUrl("")}
                    className="p-0.5 rounded transition-colors flex-shrink-0"
                    style={{ color: "#6b7280" }}
                    title="Cancella URL"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              {/* FlowMapper JSON detected notice */}
              {directImportData && (
                <div
                  className="p-3 rounded-lg flex items-start gap-3"
                  style={{ background: "#1b1b3d", border: "1px solid #4338ca" }}
                >
                  <FileWarning size={16} style={{ color: "#818cf8", marginTop: 2, flexShrink: 0 }} />
                  <div className="flex-1">
                    <div className="text-sm" style={{ color: "#c7d2fe" }}>
                      Rilevato export FlowMapper
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "#6366f1" }}>
                      Questo JSON contiene {directImportData.screens.length} schermate con URL e metadati originali.
                      Usa <strong style={{ color: "#a5b4fc" }}>"Import diretto"</strong> per preservare tutte le URL delle pagine e le thumbnail.
                      Oppure usa "Corsie"/"Grafo" per ri-elaborare la struttura.
                    </div>
                  </div>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-2">
                {([
                  { label: "Schermate", count: parsedDoc.screens.length, color: "#3b82f6" },
                  { label: "Connessioni", count: parsedDoc.connections.length, color: "#22c55e" },
                  { label: "Decisioni", count: parsedDoc.decisions.length, color: "#a855f7" },
                  { label: "Flussi", count: parsedDoc.flows.length, color: "#f59e0b" },
                ] as const).map((stat) => (
                  <div
                    key={stat.label}
                    className="p-2.5 rounded-lg text-center"
                    style={{ background: `${stat.color}10`, border: `1px solid ${stat.color}25` }}
                  >
                    <div className="text-lg" style={{ color: stat.color }}>
                      {stat.count}
                    </div>
                    <div className="text-xs" style={{ color: "#9ca3af" }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Layout mode selector ── */}
              <div
                className="rounded-lg p-3"
                style={{ background: "#0d0d18", border: "1px solid #1f2937" }}
              >
                <div className="text-xs mb-2.5" style={{ color: "#9ca3af" }}>
                  Modalità layout
                </div>
                <div className="flex gap-2">
                  {/* Lanes mode (default) */}
                  <button
                    onClick={() => setLayoutMode("lanes")}
                    className="flex-1 flex items-start gap-2.5 p-3 rounded-lg text-left transition-all cursor-pointer"
                    style={{
                      background: layoutMode === "lanes" ? "#a855f712" : "#13131f",
                      border: layoutMode === "lanes" ? "1px solid #a855f7" : "1px solid #2d2d44",
                    }}
                  >
                    <Rows3
                      size={16}
                      style={{ color: layoutMode === "lanes" ? "#c084fc" : "#4b5563", marginTop: 1, flexShrink: 0 }}
                    />
                    <div>
                      <div className="text-xs" style={{ color: layoutMode === "lanes" ? "#e9d5ff" : "#9ca3af" }}>
                        Flussi a corsie
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: layoutMode === "lanes" ? "#a855f7" : "#4b5563" }}>
                        Le schermate si ripetono per ogni flusso. Ogni corsia è una riga orizzontale, facile da leggere.
                      </div>
                    </div>
                  </button>
                  {/* Graph mode */}
                  <button
                    onClick={() => setLayoutMode("graph")}
                    className="flex-1 flex items-start gap-2.5 p-3 rounded-lg text-left transition-all cursor-pointer"
                    style={{
                      background: layoutMode === "graph" ? "#4f46e512" : "#13131f",
                      border: layoutMode === "graph" ? "1px solid #6366f1" : "1px solid #2d2d44",
                    }}
                  >
                    <GitBranch
                      size={16}
                      style={{ color: layoutMode === "graph" ? "#818cf8" : "#4b5563", marginTop: 1, flexShrink: 0 }}
                    />
                    <div>
                      <div className="text-xs" style={{ color: layoutMode === "graph" ? "#c7d2fe" : "#9ca3af" }}>
                        Grafo unico
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: layoutMode === "graph" ? "#6366f1" : "#4b5563" }}>
                        Ogni schermata appare una sola volta. Massima precisione, meno leggibile su grafi complessi.
                      </div>
                    </div>
                  </button>
                </div>
                {layoutMode === "lanes" && parsedDoc.flows.length === 0 && parsedDoc.connections.length > 0 && (
                  <div
                    className="flex items-center gap-2 mt-2 px-2.5 py-1.5 rounded-md text-xs"
                    style={{ background: "#2d2517", border: "1px solid #4d380020", color: "#fbbf24" }}
                  >
                    <AlertTriangle size={11} />
                    Le corsie verranno generate dalle connessioni raggruppate per tipo — per risultati migliori definisci flussi espliciti nel JSON.
                  </div>
                )}
                {layoutMode === "lanes" && preview && (
                  <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: "#6b7280" }}>
                    <span>
                      {(() => {
                        // Count unique lanes
                        const laneSet = new Set(preview.screens.map((s) => s.id.split("-")[1]));
                        return `${laneSet.size} cors${laneSet.size === 1 ? "ia" : "ie"}`;
                      })()}
                    </span>
                    <span>•</span>
                    <span>{preview.screens.length} nodi (con ripetizioni)</span>
                    <span>•</span>
                    <span>{preview.connections.length} archi</span>
                  </div>
                )}
              </div>

              {/* Detail sections */}
              {parsedDoc.screens.length > 0 && (
                <DetailSection title="Schermate trovate" color="#3b82f6">
                  {parsedDoc.screens.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 py-1">
                      <span
                        className="w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0"
                        style={{ background: "#3b82f620", color: "#3b82f6" }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-xs" style={{ color: "#e5e7eb" }}>
                        {s.name}
                      </span>
                      {s.route && (
                        <span className="text-xs" style={{ color: "#6b7280", fontFamily: "monospace" }}>
                          {s.route}
                        </span>
                      )}
                    </div>
                  ))}
                </DetailSection>
              )}

              {parsedDoc.connections.length > 0 && (
                <DetailSection title="Connessioni trovate" color="#22c55e">
                  {parsedDoc.connections.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 py-1">
                      <span
                        className="px-1.5 py-0.5 rounded text-xs flex-shrink-0"
                        style={{
                          background: `${FLOW_COLORS[c.flowType]}22`,
                          color: FLOW_COLORS[c.flowType],
                          fontSize: 9,
                        }}
                      >
                        {FLOW_LABELS[c.flowType]}
                      </span>
                      <span className="text-xs" style={{ color: "#e5e7eb" }}>
                        {c.from}
                      </span>
                      <span style={{ color: "#6b7280", fontSize: 11 }}>→</span>
                      <span className="text-xs" style={{ color: "#e5e7eb" }}>
                        {c.to}
                      </span>
                      {c.condition && (
                        <span
                          className="px-1 py-0.5 rounded text-xs"
                          style={{
                            background: c.condition === "yes" ? "#14521a" : "#520a0a",
                            color: c.condition === "yes" ? "#86efac" : "#fca5a5",
                            fontSize: 9,
                          }}
                        >
                          {c.condition === "yes" ? "SÌ" : "NO"}
                        </span>
                      )}
                    </div>
                  ))}
                </DetailSection>
              )}

              {parsedDoc.decisions.length > 0 && (
                <DetailSection title="Nodi decisione" color="#a855f7">
                  {parsedDoc.decisions.map((d, i) => (
                    <div key={i} className="py-1.5">
                      <div className="flex items-center gap-2">
                        <span style={{ color: "#c4b5fd", fontSize: 12 }}>◆</span>
                        <span className="text-xs" style={{ color: "#e5e7eb" }}>
                          {d.question}
                        </span>
                      </div>
                      <div className="ml-5 mt-0.5 flex gap-3">
                        <span className="text-xs" style={{ color: "#86efac" }}>
                          SÌ → {d.yesTarget}
                        </span>
                        <span className="text-xs" style={{ color: "#fca5a5" }}>
                          NO → {d.noTarget}
                        </span>
                      </div>
                    </div>
                  ))}
                </DetailSection>
              )}

              {parsedDoc.flows.length > 0 && (
                <DetailSection title="Flussi definiti" color="#f59e0b">
                  {parsedDoc.flows.map((f, i) => (
                    <div key={i} className="py-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="px-1.5 py-0.5 rounded text-xs"
                          style={{
                            background: `${FLOW_COLORS[f.flowType]}22`,
                            color: FLOW_COLORS[f.flowType],
                            fontSize: 9,
                          }}
                        >
                          {FLOW_LABELS[f.flowType]}
                        </span>
                        <span className="text-xs" style={{ color: "#e5e7eb" }}>
                          {f.name}
                        </span>
                      </div>
                      <div className="ml-5 mt-0.5 flex items-center gap-1 flex-wrap">
                        {f.steps.map((step, si) => (
                          <span key={si} className="contents">
                            <span className="text-xs" style={{ color: "#9ca3af" }}>
                              {step}
                            </span>
                            {si < f.steps.length - 1 && (
                              <span style={{ color: FLOW_COLORS[f.flowType], fontSize: 10 }}>→</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </DetailSection>
              )}

              {/* Preview */}
              {preview && preview.screens.length > 0 && (
                <div className="mt-1">
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center gap-2 mb-2 text-xs transition-colors cursor-pointer"
                    style={{ color: "#9ca3af" }}
                  >
                    {showPreview ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <Eye size={12} />
                    Anteprima {layoutMode === "lanes" ? "corsie" : "diagramma"} ({preview.screens.length} nodi, {preview.connections.length} archi)
                  </button>
                  {showPreview && (
                    <div
                      className="rounded-lg overflow-hidden"
                      style={{ background: "#0a0a14", border: "1px solid #1f2937", height: 140 }}
                    >
                      <svg width="100%" height="140" viewBox={computeViewBox(preview.screens)} preserveAspectRatio="xMidYMid meet">
                        {preview.connections.map((c) => {
                          const src = preview.screens.find((s) => s.id === c.sourceId);
                          const dst = preview.screens.find((s) => s.id === c.destinationId);
                          if (!src || !dst) return null;
                          return (
                            <line
                              key={c.id}
                              x1={src.x + NODE_WIDTH / 2}
                              y1={src.y + NODE_HEIGHT / 2}
                              x2={dst.x + NODE_WIDTH / 2}
                              y2={dst.y + NODE_HEIGHT / 2}
                              stroke={FLOW_COLORS[c.flowType]}
                              strokeWidth={1.5}
                              opacity={0.5}
                            />
                          );
                        })}
                        {preview.screens.map((s) => (
                          <g key={s.id}>
                            {s.nodeKind === "decision" ? (
                              <polygon
                                points={`${s.x + NODE_WIDTH / 2},${s.y} ${s.x + NODE_WIDTH},${s.y + 36} ${s.x + NODE_WIDTH / 2},${s.y + 72} ${s.x},${s.y + 36}`}
                                fill="#2d1b69"
                                stroke="#7c3aed"
                                strokeWidth={1}
                              />
                            ) : (
                              <rect
                                x={s.x}
                                y={s.y}
                                width={NODE_WIDTH}
                                height={NODE_HEIGHT * 0.6}
                                rx={4}
                                fill="#1e1e2e"
                                stroke="#3b82f6"
                                strokeWidth={1}
                              />
                            )}
                            <text
                              x={s.x + NODE_WIDTH / 2}
                              y={s.y + (s.nodeKind === "decision" ? 38 : NODE_HEIGHT * 0.35)}
                              textAnchor="middle"
                              fill="#d1d5db"
                              fontSize={8}
                            >
                              {s.name.length > 12 ? s.name.slice(0, 11) + "…" : s.name}
                            </text>
                          </g>
                        ))}
                      </svg>
                    </div>
                  )}
                </div>
              )}

              {/* Raw content toggle */}
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="flex items-center gap-2 text-xs transition-colors cursor-pointer"
                style={{ color: "#6b7280" }}
              >
                {showRaw ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Contenuto grezzo ({(rawContent.length / 1000).toFixed(1)} KB)
              </button>
              {showRaw && (
                <pre
                  className="p-3 rounded-lg text-xs overflow-auto"
                  style={{
                    background: "#0a0a14",
                    border: "1px solid #1f2937",
                    color: "#9ca3af",
                    maxHeight: 200,
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                  }}
                >
                  {rawContent.slice(0, 10000)}
                  {rawContent.length > 10000 && "\n\n... (troncato)"}
                </pre>
              )}

              {/* Re-paste option */}
              {totalItems === 0 && (
                <div
                  className="p-3 rounded-lg"
                  style={{ background: "#2d2517", border: "1px solid #4d3800" }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={14} style={{ color: "#f59e0b" }} />
                    <span className="text-sm" style={{ color: "#fbbf24" }}>
                      Nessun dato strutturato trovato
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: "#a3860a" }}>
                    Il parser non ha trovato schermate o connessioni nel contenuto.
                    Prova a incollare direttamente il JSON dalla sezione AI Readable.
                  </span>
                  <button
                    onClick={() => {
                      setPasteContent(rawContent);
                      setStatus("idle");
                    }}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs"
                    style={{ background: "#a855f7", color: "white" }}
                  >
                    <ClipboardPaste size={12} />
                    Modifica e rielabora
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ Footer ═══ */}
        <div
          className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderTop: "1px solid #1f2937", background: "#0d0d18" }}
        >
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "#6b7280" }}>
              Fonte: <strong>copia/incolla manuale</strong>
            </span>
            {parsedDoc && totalItems > 0 && (
              <span className="text-xs" style={{ color: "#22c55e" }}>
                {totalItems} elementi trovati
              </span>
            )}
            {parsedDoc && totalItems > 0 && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                style={{
                  background: layoutMode === "lanes" ? "#a855f715" : "#4f46e515",
                  color: layoutMode === "lanes" ? "#c084fc" : "#818cf8",
                  border: layoutMode === "lanes" ? "1px solid #a855f730" : "1px solid #4f46e530",
                }}
              >
                {layoutMode === "lanes" ? <Rows3 size={10} /> : <GitBranch size={10} />}
                {layoutMode === "lanes" ? "Corsie" : "Grafo"}
              </span>
            )}
            {effectiveSiteUrl && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                style={{ background: "#818cf810", color: "#818cf8", border: "1px solid #818cf825" }}
              >
                <Globe size={10} />
                URL
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs"
              style={{ background: "#1e1e2e", border: "1px solid #2d2d44", color: "#d1d5db" }}
            >
              Chiudi
            </button>
            {directImportData && status === "parsed" ? (
              <>
                <button
                  onClick={handleApply}
                  disabled={!parsedDoc || totalItems === 0}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs disabled:opacity-30"
                  style={{ background: "#1e1e2e", border: "1px solid #2d2d44", color: "#d1d5db" }}
                  title="Re-interpreta il JSON come documentazione e costruisci il diagramma"
                >
                  <Play size={12} />
                  {layoutMode === "lanes" ? "Corsie" : "Grafo"}
                </button>
                <button
                  onClick={handleDirectImport}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs"
                  style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white" }}
                  title="Importa il JSON FlowMapper conservando tutte le URL e i metadati originali"
                >
                  <CheckCircle2 size={12} />
                  Import diretto (con URL)
                </button>
              </>
            ) : (
              <button
                onClick={handleApply}
                disabled={!parsedDoc || totalItems === 0 || status === "processing"}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs disabled:opacity-30"
                style={{ background: "#a855f7", color: "white" }}
              >
                <Play size={12} />
                {layoutMode === "lanes" ? "Costruisci corsie" : "Costruisci diagramma"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Help modal overlay */}
      {showHelp && <FlowDocHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
}

// ─── Detail Section sub-component ─────────────────────

function DetailSection({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div
      className="rounded-lg"
      style={{ border: `1px solid ${color}20`, background: `${color}05` }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left cursor-pointer"
        style={{ color, borderBottom: open ? `1px solid ${color}15` : "none" }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {open && <div className="px-3 py-1.5 max-h-48 overflow-y-auto">{children}</div>}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────

function computeViewBox(screens: Screen[]): string {
  if (screens.length === 0) return "0 0 800 200";
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of screens) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + NODE_WIDTH);
    maxY = Math.max(maxY, s.y + NODE_HEIGHT);
  }
  const pad = 30;
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
}