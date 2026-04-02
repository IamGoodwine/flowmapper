import React, { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  RefreshCw,
  X,
  Unplug,
  CircleDot,
  CornerDownRight,
  Ban,
} from "lucide-react";
import type { Screen, Connection } from "./types";

/* ─── Issue types ─────────────────────────────────────── */

export type IssueSeverity = "error" | "warning" | "info";

export interface FlowIssue {
  id: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  nodeIds?: string[];
  edgeIds?: string[];
}

/* ─── Validation engine ──────────────────────────────── */

export function validateFlow(
  screens: Screen[],
  connections: Connection[]
): FlowIssue[] {
  const issues: FlowIssue[] = [];
  let seq = 0;
  const uid = () => `issue-${++seq}`;

  if (screens.length === 0) return issues;

  const screenIds = new Set(screens.map((s) => s.id));

  // 1. Orphan nodes — no incoming AND no outgoing connections
  const hasIncoming = new Set(connections.map((c) => c.destinationId));
  const hasOutgoing = new Set(connections.map((c) => c.sourceId));

  for (const s of screens) {
    const isOrphan = !hasIncoming.has(s.id) && !hasOutgoing.has(s.id);
    if (isOrphan) {
      issues.push({
        id: uid(),
        severity: "warning",
        title: "Nodo orfano",
        description: `"${s.name}" non ha connessioni in ingresso ne in uscita.`,
        nodeIds: [s.id],
      });
    }
  }

  // 2. Dead-end nodes — have incoming but no outgoing (except leaf screens, which may be intentional)
  for (const s of screens) {
    if (s.nodeKind === "decision") continue; // decisions must have outgoing
    if (hasIncoming.has(s.id) && !hasOutgoing.has(s.id)) {
      issues.push({
        id: uid(),
        severity: "info",
        title: "Nodo terminale",
        description: `"${s.name}" non ha connessioni in uscita (dead-end).`,
        nodeIds: [s.id],
      });
    }
  }

  // 3. Decision nodes without both YES and NO exits
  const decisionNodes = screens.filter((s) => s.nodeKind === "decision");
  for (const d of decisionNodes) {
    const outEdges = connections.filter((c) => c.sourceId === d.id);
    const hasYes = outEdges.some((e) => e.condition === "yes");
    const hasNo = outEdges.some((e) => e.condition === "no");
    if (!hasYes || !hasNo) {
      const missing = !hasYes && !hasNo ? "SÌ e NO" : !hasYes ? "SÌ" : "NO";
      issues.push({
        id: uid(),
        severity: "error",
        title: "Decisione incompleta",
        description: `"${d.question || d.name}" manca il ramo ${missing}.`,
        nodeIds: [d.id],
      });
    }
    if (outEdges.length === 0) {
      issues.push({
        id: uid(),
        severity: "error",
        title: "Decisione senza uscite",
        description: `"${d.question || d.name}" non ha connessioni in uscita.`,
        nodeIds: [d.id],
      });
    }
  }

  // 4. Dangling edges — reference missing nodes
  for (const c of connections) {
    if (!screenIds.has(c.sourceId)) {
      issues.push({
        id: uid(),
        severity: "error",
        title: "Arco pendente",
        description: `La connessione "${c.trigger}" ha un nodo sorgente mancante (${c.sourceId}).`,
        edgeIds: [c.id],
      });
    }
    if (!screenIds.has(c.destinationId)) {
      issues.push({
        id: uid(),
        severity: "error",
        title: "Arco pendente",
        description: `La connessione "${c.trigger}" ha un nodo destinazione mancante (${c.destinationId}).`,
        edgeIds: [c.id],
      });
    }
  }

  // 5. Self-loops
  for (const c of connections) {
    if (c.sourceId === c.destinationId) {
      const src = screens.find((s) => s.id === c.sourceId);
      issues.push({
        id: uid(),
        severity: "warning",
        title: "Auto-loop",
        description: `"${src?.name || c.sourceId}" ha una connessione verso se stesso ("${c.trigger}").`,
        nodeIds: [c.sourceId],
        edgeIds: [c.id],
      });
    }
  }

  // 6. Duplicate connections (same source → dest with same trigger)
  const edgeSigs = new Map<string, Connection[]>();
  for (const c of connections) {
    const sig = `${c.sourceId}→${c.destinationId}`;
    if (!edgeSigs.has(sig)) edgeSigs.set(sig, []);
    edgeSigs.get(sig)!.push(c);
  }
  for (const [sig, group] of edgeSigs) {
    if (group.length > 1) {
      issues.push({
        id: uid(),
        severity: "warning",
        title: "Connessioni duplicate",
        description: `${group.length} connessioni identiche trovate (${sig.replace("→", " → ")}).`,
        edgeIds: group.map((c) => c.id),
      });
    }
  }

  // 7. No root node (all nodes have incoming connections → possible cycle)
  const rootNodes = screens.filter((s) => !hasIncoming.has(s.id));
  if (rootNodes.length === 0 && screens.length > 1) {
    issues.push({
      id: uid(),
      severity: "warning",
      title: "Nessun nodo radice",
      description:
        "Tutti i nodi hanno connessioni in ingresso. Potrebbe esserci un ciclo senza punto di ingresso.",
    });
  }

  // 8. Cycle detection (DFS)
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const s of screens) adj.set(s.id, []);
  for (const c of connections) adj.get(c.sourceId)?.push(c.destinationId);

  let hasCycle = false;
  function dfs(node: string) {
    if (hasCycle) return;
    visited.add(node);
    inStack.add(node);
    for (const neighbor of adj.get(node) || []) {
      if (inStack.has(neighbor)) {
        hasCycle = true;
        return;
      }
      if (!visited.has(neighbor)) dfs(neighbor);
    }
    inStack.delete(node);
  }
  for (const s of screens) {
    if (!visited.has(s.id)) dfs(s.id);
  }
  if (hasCycle) {
    issues.push({
      id: uid(),
      severity: "info",
      title: "Ciclo rilevato",
      description:
        "Il diagramma contiene almeno un ciclo. Puo essere intenzionale (es. retry, loop), ma verifica che non sia un errore.",
    });
  }

  // 9. Missing reasons on edges (info-level)
  const edgesWithoutReason = connections.filter((c) => !c.reason);
  if (edgesWithoutReason.length > 0 && connections.length > 0) {
    const pct = Math.round(
      (edgesWithoutReason.length / connections.length) * 100
    );
    if (pct > 50) {
      issues.push({
        id: uid(),
        severity: "info",
        title: "Motivazioni mancanti",
        description: `${edgesWithoutReason.length}/${connections.length} connessioni (${pct}%) senza motivazione UX.`,
        edgeIds: edgesWithoutReason.map((c) => c.id),
      });
    }
  }

  return issues;
}

/* ─── Severity helpers ───────────────────────────────── */

const SEVERITY_CONFIG: Record<
  IssueSeverity,
  { icon: React.ReactNode; color: string; bg: string; border: string }
> = {
  error: {
    icon: <XCircle size={13} />,
    color: "#f87171",
    bg: "#2d1212",
    border: "#7f1d1d",
  },
  warning: {
    icon: <AlertTriangle size={13} />,
    color: "#fbbf24",
    bg: "#2d2000",
    border: "#713f12",
  },
  info: {
    icon: <Info size={13} />,
    color: "#60a5fa",
    bg: "#0d1b30",
    border: "#1e3a5f",
  },
};

/* ─── Component ──────────────────────────────────────── */

interface FlowValidatorProps {
  screens: Screen[];
  connections: Connection[];
  onClose: () => void;
  onSelectNode?: (id: string) => void;
  onSelectEdge?: (id: string) => void;
}

export function FlowValidator({
  screens,
  connections,
  onClose,
  onSelectNode,
  onSelectEdge,
}: FlowValidatorProps) {
  const issues = useMemo(
    () => validateFlow(screens, connections),
    [screens, connections]
  );

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  const infos = issues.filter((i) => i.severity === "info");
  const isHealthy = errors.length === 0 && warnings.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }}
    >
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: "min(90vw, 520px)",
          maxHeight: "min(85vh, 640px)",
          background: "#0d0d1a",
          border: "1px solid #1f2937",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid #1f2937" }}
        >
          <div className="flex items-center gap-2.5">
            {isHealthy ? (
              <CheckCircle size={18} style={{ color: "#22c55e" }} />
            ) : (
              <AlertTriangle size={18} style={{ color: "#fbbf24" }} />
            )}
            <div>
              <div
                style={{
                  color: "#e2e8f0",
                  fontSize: 15,
                  fontFamily: "system-ui",
                }}
              >
                Validazione Flusso
              </div>
              <div style={{ color: "#6b7280", fontSize: 10 }}>
                {issues.length === 0
                  ? "Nessun problema rilevato"
                  : `${errors.length} errori · ${warnings.length} avvisi · ${infos.length} info`}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:opacity-70"
            style={{ color: "#6b7280" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Score bar */}
        <div
          className="px-5 py-3 flex items-center gap-3"
          style={{ borderBottom: "1px solid #1f2937" }}
        >
          <div className="flex-1">
            <div
              className="w-full h-2 rounded-full overflow-hidden"
              style={{ background: "#1e1e2e" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(5, 100 - errors.length * 20 - warnings.length * 8 - infos.length * 2)}%`,
                  background:
                    errors.length > 0
                      ? "linear-gradient(90deg, #ef4444, #f87171)"
                      : warnings.length > 0
                        ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                        : "linear-gradient(90deg, #22c55e, #86efac)",
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="px-2 py-0.5 rounded text-xs"
              style={{ background: "#2d1212", color: "#f87171", fontSize: 10 }}
            >
              {errors.length} err
            </span>
            <span
              className="px-2 py-0.5 rounded text-xs"
              style={{ background: "#2d2000", color: "#fbbf24", fontSize: 10 }}
            >
              {warnings.length} warn
            </span>
            <span
              className="px-2 py-0.5 rounded text-xs"
              style={{ background: "#0d1b30", color: "#60a5fa", fontSize: 10 }}
            >
              {infos.length} info
            </span>
          </div>
        </div>

        {/* Issues list */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {isHealthy && issues.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <CheckCircle size={40} style={{ color: "#22c55e" }} />
              <div style={{ color: "#86efac", fontSize: 14 }}>
                Flusso valido!
              </div>
              <div
                style={{
                  color: "#6b7280",
                  fontSize: 12,
                  textAlign: "center",
                  maxWidth: 280,
                }}
              >
                Non sono stati rilevati problemi strutturali nel diagramma.
              </div>
            </div>
          )}

          {issues.map((issue) => {
            const cfg = SEVERITY_CONFIG[issue.severity];
            return (
              <div
                key={issue.id}
                className="rounded-lg p-3 flex flex-col gap-1.5"
                style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: cfg.color }}>{cfg.icon}</span>
                  <span
                    style={{
                      color: cfg.color,
                      fontSize: 12,
                      fontFamily: "system-ui",
                    }}
                  >
                    {issue.title}
                  </span>
                </div>
                <div style={{ color: "#d1d5db", fontSize: 11 }}>
                  {issue.description}
                </div>
                {/* Quick-nav buttons */}
                {(issue.nodeIds?.length || issue.edgeIds?.length) && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {issue.nodeIds?.map((nid) => (
                      <button
                        key={nid}
                        onClick={() => {
                          onSelectNode?.(nid);
                          onClose();
                        }}
                        className="px-2 py-0.5 rounded text-xs transition-opacity hover:opacity-80"
                        style={{
                          background: "#1e1e2e",
                          color: "#818cf8",
                          border: "1px solid #3730a3",
                          fontSize: 10,
                        }}
                      >
                        Vai al nodo
                      </button>
                    ))}
                    {issue.edgeIds?.slice(0, 2).map((eid) => (
                      <button
                        key={eid}
                        onClick={() => {
                          onSelectEdge?.(eid);
                          onClose();
                        }}
                        className="px-2 py-0.5 rounded text-xs transition-opacity hover:opacity-80"
                        style={{
                          background: "#1e1e2e",
                          color: "#818cf8",
                          border: "1px solid #3730a3",
                          fontSize: 10,
                        }}
                      >
                        Vai all'arco
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Stats footer */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderTop: "1px solid #1f2937" }}
        >
          <div style={{ color: "#4b5563", fontSize: 10 }}>
            {screens.length} nodi · {connections.length} connessioni ·{" "}
            {screens.filter((s) => s.nodeKind === "decision").length} decisioni
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80"
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "white",
            }}
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
