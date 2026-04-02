import React, { useState } from "react";
import {
  X,
  LogIn,
  ShoppingCart,
  UserPlus,
  CreditCard,
  Search,
  Layers,
  ArrowRight,
  CheckCircle,
  Diamond,
} from "lucide-react";
import type { Screen, Connection, FlowType, NodeKind } from "./types";
import {
  FLOW_COLORS,
  NODE_WIDTH,
  NODE_HEIGHT,
  DECISION_H,
  H_SPACING,
  V_SPACING,
} from "./types";

/* ─── Template definition ────────────────────────────── */

interface TemplateNode {
  id: string;
  name: string;
  kind: NodeKind;
  question?: string;
}

interface TemplateEdge {
  sourceId: string;
  targetId: string;
  trigger: string;
  flowType: FlowType;
  condition?: "yes" | "no";
  reason?: string;
}

interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

/* ─── Template library ───────────────────────────────── */

const TEMPLATES: FlowTemplate[] = [
  {
    id: "login",
    name: "Login Flow",
    description:
      "Flusso classico di autenticazione con decisione credenziali valide, recupero password e dashboard.",
    icon: <LogIn size={18} />,
    category: "Autenticazione",
    nodes: [
      { id: "t-login", name: "Login", kind: "screen" },
      { id: "t-check-cred", name: "Credenziali valide?", kind: "decision", question: "Credenziali valide?" },
      { id: "t-dashboard", name: "Dashboard", kind: "screen" },
      { id: "t-error", name: "Errore Login", kind: "screen" },
      { id: "t-forgot", name: "Recupera Password", kind: "screen" },
      { id: "t-reset-sent", name: "Email Inviata", kind: "screen" },
    ],
    edges: [
      { sourceId: "t-login", targetId: "t-check-cred", trigger: "Submit", flowType: "happy", reason: "L'utente inserisce le credenziali e invia il form" },
      { sourceId: "t-check-cred", targetId: "t-dashboard", trigger: "Accesso OK", flowType: "happy", condition: "yes", reason: "Credenziali corrette, redirect alla dashboard" },
      { sourceId: "t-check-cred", targetId: "t-error", trigger: "Credenziali errate", flowType: "error", condition: "no", reason: "Mostra messaggio di errore e consenti retry" },
      { sourceId: "t-error", targetId: "t-login", trigger: "Riprova", flowType: "error", reason: "L'utente puo ritentare il login" },
      { sourceId: "t-login", targetId: "t-forgot", trigger: "Password dimenticata?", flowType: "secondary", reason: "Flusso alternativo per il recupero password" },
      { sourceId: "t-forgot", targetId: "t-reset-sent", trigger: "Invia email", flowType: "secondary", reason: "Invia il link di reset all'email dell'utente" },
    ],
  },
  {
    id: "onboarding",
    name: "Onboarding Utente",
    description:
      "Flusso di onboarding con step progressivi, decisione profilo completo e skip opzionale.",
    icon: <UserPlus size={18} />,
    category: "Onboarding",
    nodes: [
      { id: "t-welcome", name: "Welcome", kind: "screen" },
      { id: "t-step1", name: "Dati Personali", kind: "screen" },
      { id: "t-step2", name: "Preferenze", kind: "screen" },
      { id: "t-check-profile", name: "Profilo completo?", kind: "decision", question: "Profilo completo?" },
      { id: "t-home", name: "Home", kind: "screen" },
      { id: "t-incomplete", name: "Completa Dopo", kind: "screen" },
    ],
    edges: [
      { sourceId: "t-welcome", targetId: "t-step1", trigger: "Inizia", flowType: "happy", reason: "L'utente inizia la procedura di registrazione" },
      { sourceId: "t-step1", targetId: "t-step2", trigger: "Avanti", flowType: "happy", reason: "Step progressivo per non sovraccaricare l'utente" },
      { sourceId: "t-step2", targetId: "t-check-profile", trigger: "Salva", flowType: "happy", reason: "Verifica se tutti i campi obbligatori sono compilati" },
      { sourceId: "t-check-profile", targetId: "t-home", trigger: "Tutto OK", flowType: "happy", condition: "yes", reason: "Profilo completo, accesso alla home" },
      { sourceId: "t-check-profile", targetId: "t-incomplete", trigger: "Campi mancanti", flowType: "variant", condition: "no", reason: "Consenti di completare il profilo in seguito" },
      { sourceId: "t-welcome", targetId: "t-home", trigger: "Skip", flowType: "skip", reason: "Permetti agli utenti esperti di saltare l'onboarding" },
      { sourceId: "t-incomplete", targetId: "t-home", trigger: "Prosegui", flowType: "variant", reason: "L'utente puo usare l'app con profilo parziale" },
    ],
  },
  {
    id: "checkout",
    name: "Checkout E-commerce",
    description:
      "Flusso di acquisto completo: carrello, spedizione, pagamento, decisione pagamento riuscito, conferma ordine.",
    icon: <ShoppingCart size={18} />,
    category: "E-commerce",
    nodes: [
      { id: "t-cart", name: "Carrello", kind: "screen" },
      { id: "t-shipping", name: "Spedizione", kind: "screen" },
      { id: "t-payment", name: "Pagamento", kind: "screen" },
      { id: "t-check-pay", name: "Pagamento OK?", kind: "decision", question: "Pagamento riuscito?" },
      { id: "t-confirm", name: "Conferma Ordine", kind: "screen" },
      { id: "t-pay-error", name: "Errore Pagamento", kind: "screen" },
      { id: "t-empty", name: "Carrello Vuoto", kind: "screen" },
    ],
    edges: [
      { sourceId: "t-cart", targetId: "t-shipping", trigger: "Procedi", flowType: "happy", reason: "L'utente ha articoli nel carrello e vuole procedere" },
      { sourceId: "t-shipping", targetId: "t-payment", trigger: "Conferma indirizzo", flowType: "happy", reason: "Indirizzo validato, passa al pagamento" },
      { sourceId: "t-payment", targetId: "t-check-pay", trigger: "Paga ora", flowType: "happy", reason: "Invia richiesta di pagamento al gateway" },
      { sourceId: "t-check-pay", targetId: "t-confirm", trigger: "Transazione OK", flowType: "happy", condition: "yes", reason: "Pagamento confermato, mostra riepilogo ordine" },
      { sourceId: "t-check-pay", targetId: "t-pay-error", trigger: "Transazione fallita", flowType: "error", condition: "no", reason: "Mostra errore e consenti cambio metodo pagamento" },
      { sourceId: "t-pay-error", targetId: "t-payment", trigger: "Riprova", flowType: "error", reason: "L'utente puo inserire un altro metodo di pagamento" },
      { sourceId: "t-cart", targetId: "t-empty", trigger: "Nessun articolo", flowType: "variant", reason: "Se il carrello e vuoto mostra stato empty con CTA" },
    ],
  },
  {
    id: "search",
    name: "Ricerca e Filtri",
    description:
      "Flusso di ricerca con decisione risultati trovati, pagina vuota, filtri e dettaglio risultato.",
    icon: <Search size={18} />,
    category: "Navigazione",
    nodes: [
      { id: "t-search", name: "Ricerca", kind: "screen" },
      { id: "t-check-results", name: "Risultati trovati?", kind: "decision", question: "Ci sono risultati?" },
      { id: "t-results", name: "Lista Risultati", kind: "screen" },
      { id: "t-no-results", name: "Nessun Risultato", kind: "screen" },
      { id: "t-detail", name: "Dettaglio", kind: "screen" },
      { id: "t-filters", name: "Filtri Avanzati", kind: "screen" },
    ],
    edges: [
      { sourceId: "t-search", targetId: "t-check-results", trigger: "Cerca", flowType: "happy", reason: "Query inviata al backend" },
      { sourceId: "t-check-results", targetId: "t-results", trigger: "Risultati", flowType: "happy", condition: "yes", reason: "Mostra la lista dei risultati paginati" },
      { sourceId: "t-check-results", targetId: "t-no-results", trigger: "Zero risultati", flowType: "variant", condition: "no", reason: "Mostra empty state con suggerimenti" },
      { sourceId: "t-results", targetId: "t-detail", trigger: "Tap risultato", flowType: "happy", reason: "L'utente vuole vedere il dettaglio di un risultato" },
      { sourceId: "t-results", targetId: "t-filters", trigger: "Filtri", flowType: "secondary", reason: "Permetti raffinamento della ricerca" },
      { sourceId: "t-filters", targetId: "t-check-results", trigger: "Applica filtri", flowType: "secondary", reason: "Riesegui la query con i nuovi parametri" },
      { sourceId: "t-no-results", targetId: "t-search", trigger: "Nuova ricerca", flowType: "variant", reason: "L'utente puo modificare i termini di ricerca" },
    ],
  },
];

const CATEGORIES = [...new Set(TEMPLATES.map((t) => t.category))];

/* ─── BFS layout for template preview ────────────────── */
function templateLayout(nodes: TemplateNode[], edges: TemplateEdge[]): Screen[] {
  const adj = new Map<string, string[]>();
  const inDeg = new Map<string, number>();
  for (const n of nodes) { adj.set(n.id, []); inDeg.set(n.id, 0); }
  for (const e of edges) {
    adj.get(e.sourceId)?.push(e.targetId);
    inDeg.set(e.targetId, (inDeg.get(e.targetId) || 0) + 1);
  }
  const roots = nodes.filter((n) => (inDeg.get(n.id) || 0) === 0);
  if (roots.length === 0 && nodes.length > 0) roots.push(nodes[0]);

  // Standard BFS – each node is processed at most once to avoid
  // infinite loops on cyclic graphs (back-edges are simply ignored).
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const r of roots) { levels.set(r.id, 0); queue.push(r.id); visited.add(r.id); }

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

  const result: Screen[] = [];
  const maxLv = groups.size > 0 ? Math.max(...groups.keys()) : 0;
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
        name: node.name,
        question: node.question,
        nodeKind: node.kind,
        x: startX + i * H_SPACING,
        y: lv * V_SPACING,
        width: NODE_WIDTH,
        height: isDecision ? DECISION_H : NODE_HEIGHT,
        figmaFrameId: node.id,
      });
    });
  }
  return result;
}

/* ─── Mini preview SVG ───────────────────────────────── */
function TemplateMiniPreview({ template }: { template: FlowTemplate }) {
  const screens = templateLayout(template.nodes, template.edges);
  if (screens.length === 0) return null;

  const xs = screens.map((s) => s.x);
  const ys = screens.map((s) => s.y);
  const minX = Math.min(...xs) - 15;
  const minY = Math.min(...ys) - 10;
  const maxX = Math.max(...xs) + NODE_WIDTH + 15;
  const maxY = Math.max(...ys) + NODE_HEIGHT + 15;

  return (
    <svg
      width="100%"
      height={80}
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      style={{ display: "block" }}
    >
      {/* Edges */}
      {template.edges.map((e, i) => {
        const src = screens.find((s) => s.id === e.sourceId);
        const dst = screens.find((s) => s.id === e.targetId);
        if (!src || !dst) return null;
        const sx = src.x + NODE_WIDTH / 2;
        const sy = src.y + (src.nodeKind === "decision" ? DECISION_H : 30);
        const dx = dst.x + NODE_WIDTH / 2;
        const dy = dst.y;
        const off = Math.max(30, Math.abs(dy - sy) * 0.3);
        return (
          <path
            key={i}
            d={`M ${sx} ${sy} C ${sx} ${sy + off} ${dx} ${dy - off} ${dx} ${dy}`}
            fill="none"
            stroke={FLOW_COLORS[e.flowType]}
            strokeWidth={1}
            opacity={0.6}
          />
        );
      })}
      {/* Nodes */}
      {screens.map((s) => {
        if (s.nodeKind === "decision") {
          const cx = s.x + NODE_WIDTH / 2;
          const cy = s.y + DECISION_H / 2;
          return (
            <polygon
              key={s.id}
              points={`${cx},${s.y} ${s.x + NODE_WIDTH},${cy} ${cx},${s.y + DECISION_H} ${s.x},${cy}`}
              fill="#2d1b69"
              stroke="#7c3aed"
              strokeWidth={1}
            />
          );
        }
        return (
          <rect
            key={s.id}
            x={s.x}
            y={s.y}
            width={NODE_WIDTH}
            height={30}
            rx={5}
            fill="#1e1e2e"
            stroke="#4f46e5"
            strokeWidth={0.8}
          />
        );
      })}
    </svg>
  );
}

/* ─── Template card ──────────────────────────────────── */
function TemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: FlowTemplate;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const decisionCount = template.nodes.filter((n) => n.kind === "decision").length;
  const screenCount = template.nodes.length - decisionCount;

  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-xl p-3 transition-all"
      style={{
        background: isSelected ? "#1a1040" : "#0f0f1f",
        border: isSelected ? "2px solid #6366f1" : "1px solid #1f2937",
        outline: "none",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span style={{ color: isSelected ? "#818cf8" : "#6b7280" }}>
          {template.icon}
        </span>
        <span
          style={{
            color: isSelected ? "#e2e8f0" : "#d1d5db",
            fontSize: 13,
            fontFamily: "system-ui",
          }}
        >
          {template.name}
        </span>
        <span
          className="ml-auto px-1.5 py-0.5 rounded text-xs"
          style={{
            background: "#1e1e2e",
            color: "#6b7280",
            fontSize: 9,
          }}
        >
          {template.category}
        </span>
      </div>
      <div
        className="rounded-lg overflow-hidden mb-2"
        style={{ background: "#080815", padding: 4 }}
      >
        <TemplateMiniPreview template={template} />
      </div>
      <div style={{ color: "#9ca3af", fontSize: 11, lineHeight: "1.4" }}>
        {template.description}
      </div>
      <div className="flex items-center gap-3 mt-2">
        <span
          className="flex items-center gap-1 text-xs"
          style={{ color: "#6b7280", fontSize: 10 }}
        >
          <Layers size={10} /> {screenCount} schermate
        </span>
        {decisionCount > 0 && (
          <span
            className="flex items-center gap-1 text-xs"
            style={{ color: "#7c3aed", fontSize: 10 }}
          >
            <Diamond size={10} /> {decisionCount} decisioni
          </span>
        )}
        <span
          className="flex items-center gap-1 text-xs"
          style={{ color: "#6b7280", fontSize: 10 }}
        >
          <ArrowRight size={10} /> {template.edges.length} connessioni
        </span>
      </div>
    </button>
  );
}

/* ─── Main Component ─────────────────────────────────── */

export interface TemplateResult {
  screens: Screen[];
  connections: Connection[];
}

interface FlowTemplatesProps {
  onConfirm: (result: TemplateResult) => void;
  onClose: () => void;
}

export function FlowTemplates({ onConfirm, onClose }: FlowTemplatesProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<string | null>(null);

  const filtered = filterCat
    ? TEMPLATES.filter((t) => t.category === filterCat)
    : TEMPLATES;

  const selectedTemplate = TEMPLATES.find((t) => t.id === selectedId);

  const handleApply = () => {
    if (!selectedTemplate) return;

    const screens = templateLayout(
      selectedTemplate.nodes,
      selectedTemplate.edges
    );

    const connections: Connection[] = selectedTemplate.edges.map((e, i) => ({
      id: `tpl-conn-${i}`,
      sourceId: e.sourceId,
      destinationId: e.targetId,
      trigger: e.trigger,
      flowType: e.flowType,
      condition: e.condition,
      reason: e.reason,
    }));

    onConfirm({ screens, connections });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }}
    >
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: "min(94vw, 680px)",
          maxHeight: "min(90vh, 720px)",
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
            <Layers size={18} style={{ color: "#818cf8" }} />
            <div>
              <div
                style={{
                  color: "#e2e8f0",
                  fontSize: 15,
                  fontFamily: "system-ui",
                }}
              >
                Template Flussi
              </div>
              <div style={{ color: "#6b7280", fontSize: 10 }}>
                Seleziona un template per iniziare rapidamente
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

        {/* Category filter */}
        <div
          className="px-5 py-2.5 flex items-center gap-2"
          style={{ borderBottom: "1px solid #1f2937" }}
        >
          <button
            onClick={() => setFilterCat(null)}
            className="px-2.5 py-1 rounded-md text-xs transition-colors"
            style={{
              background: filterCat === null ? "#4f46e5" : "#1e1e2e",
              color: filterCat === null ? "white" : "#6b7280",
              border: "1px solid transparent",
            }}
          >
            Tutti
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(filterCat === cat ? null : cat)}
              className="px-2.5 py-1 rounded-md text-xs transition-colors"
              style={{
                background: filterCat === cat ? "#4f46e5" : "#1e1e2e",
                color: filterCat === cat ? "white" : "#6b7280",
                border: "1px solid transparent",
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Templates grid */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3">
          {filtered.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              isSelected={selectedId === tpl.id}
              onSelect={() => setSelectedId(tpl.id)}
            />
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 flex items-center justify-between"
          style={{ borderTop: "1px solid #1f2937" }}
        >
          <div style={{ color: "#4b5563", fontSize: 10 }}>
            {selectedTemplate
              ? `${selectedTemplate.name} — ${selectedTemplate.nodes.length} nodi, ${selectedTemplate.edges.length} connessioni`
              : "Seleziona un template"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80"
              style={{
                background: "#1e1e2e",
                color: "#9ca3af",
                border: "1px solid #2d2d44",
              }}
            >
              Annulla
            </button>
            <button
              onClick={handleApply}
              disabled={!selectedTemplate}
              className="px-4 py-1.5 rounded-lg text-xs transition-all hover:opacity-90 disabled:opacity-30"
              style={{
                background: selectedTemplate
                  ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
                  : "#2d2d44",
                color: "white",
              }}
            >
              Applica Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}