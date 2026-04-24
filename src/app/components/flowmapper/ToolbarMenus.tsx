import React, { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  GitBranch,
  Layers,
  BookOpen,
  ShieldCheck,
  FileJson,
  FileDown,
  FileImage,
  Sparkles,
  Grid3X3,
  Lightbulb,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Plus,
  Eye,
  FolderOpen,
  Layout,
  ArrowDown,
  ArrowRight,
  Sun,
  Moon,
  FolderArchive,
  Mic,
  MapIcon,
} from "lucide-react";
import { useTheme } from "./ThemeContext";

/* ------------------------------------------------------------------ */
/*  Tiny dropdown primitive (no extra deps, just a portal-less popover) */
/* ------------------------------------------------------------------ */

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
}

function Dropdown({ trigger, children, align = "left" }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme: t } = useTheme();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          className="absolute z-[100] mt-1.5"
          style={{
            [align === "right" ? "right" : "left"]: 0,
            minWidth: 220,
            background: t.menuBg,
            border: `1px solid ${t.menuBorder}`,
            borderRadius: 10,
            boxShadow: t.menuShadow,
            padding: "6px 0",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) return child;
            // Inject close callback into MenuItem children
            if ((child.type as any).__isMenuItem) {
              return React.cloneElement(child as React.ReactElement<any>, {
                _close: () => setOpen(false),
              });
            }
            return child;
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Menu Item                                                          */
/* ------------------------------------------------------------------ */

interface MenuItemProps {
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick?: () => void;
  disabled?: boolean;
  accent?: string; // color accent for icon
  badge?: React.ReactNode;
  _close?: () => void; // injected by Dropdown
}

const MenuItem = Object.assign(
  function MenuItem({ icon, label, sublabel, onClick, disabled, accent, badge, _close }: MenuItemProps) {
    const { theme: t } = useTheme();
    return (
      <button
        onClick={() => {
          if (disabled) return;
          onClick?.();
          _close?.();
        }}
        disabled={disabled}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
        style={{
          background: "transparent",
          border: "none",
          color: disabled ? t.textDim : t.textPrimary,
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: 12,
          opacity: disabled ? 0.45 : 1,
        }}
        onMouseEnter={(e) => {
          if (!disabled) (e.currentTarget.style.background = t.menuHover);
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {icon && (
          <span style={{ color: accent || t.textMuted, flexShrink: 0, display: "flex", alignItems: "center" }}>
            {icon}
          </span>
        )}
        <span className="flex-1 flex flex-col">
          <span>{label}</span>
          {sublabel && (
            <span style={{ fontSize: 10, color: t.textDim, marginTop: 1 }}>{sublabel}</span>
          )}
        </span>
        {badge}
      </button>
    );
  },
  { __isMenuItem: true as const },
);

/* ------------------------------------------------------------------ */
/*  Menu toggle item (for settings like snap-to-grid)                 */
/* ------------------------------------------------------------------ */

interface MenuToggleItemProps {
  icon?: React.ReactNode;
  label: string;
  active: boolean;
  onToggle: () => void;
  accent?: string;
  badge?: React.ReactNode;
  _close?: () => void;
}

const MenuToggleItem = Object.assign(
  function MenuToggleItem({ icon, label, active, onToggle, accent, badge, _close }: MenuToggleItemProps) {
    const { theme: t } = useTheme();
    return (
      <button
        onClick={() => {
          onToggle();
          // Don't close on toggle
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
        style={{
          background: "transparent",
          border: "none",
          color: active ? (accent || t.accentLight) : t.textPrimary,
          cursor: "pointer",
          fontSize: 12,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = t.menuHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {icon && (
          <span style={{ color: active ? (accent || t.accentLight) : t.textMuted, flexShrink: 0, display: "flex", alignItems: "center" }}>
            {icon}
          </span>
        )}
        <span className="flex-1">{label}</span>
        {badge}
        {/* Toggle indicator */}
        <span
          style={{
            width: 30,
            height: 16,
            borderRadius: 8,
            background: active ? (accent || t.accent) : t.toggleTrackOff,
            display: "flex",
            alignItems: "center",
            padding: 2,
            transition: "background 0.15s",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: active ? "#fff" : t.toggleThumbOff,
              transform: active ? "translateX(14px)" : "translateX(0)",
              transition: "transform 0.15s",
            }}
          />
        </span>
      </button>
    );
  },
  { __isMenuItem: true as const },
);

/* ── Mode selector (segmented control for light/dark) ── */

const MenuModeSelector = Object.assign(
  function MenuModeSelector({ _close }: { _close?: () => void }) {
    const { theme: t, setMode } = useTheme();
    const isLight = t.mode === "light";
    return (
      <div className="px-3 py-2">
        <div
          className="flex rounded-lg overflow-hidden"
          style={{ background: t.surface, border: `1px solid ${t.surfaceBorder}` }}
        >
          <button
            onClick={() => setMode("light")}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs transition-colors"
            style={{
              background: isLight ? t.accent : "transparent",
              color: isLight ? "#fff" : t.textMuted,
              border: "none",
              cursor: "pointer",
            }}
          >
            <Sun size={12} />
            Light
          </button>
          <button
            onClick={() => setMode("dark")}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs transition-colors"
            style={{
              background: !isLight ? t.accent : "transparent",
              color: !isLight ? "#fff" : t.textMuted,
              border: "none",
              cursor: "pointer",
            }}
          >
            <Moon size={12} />
            Dark
          </button>
        </div>
      </div>
    );
  },
  { __isMenuItem: true as const },
);

function MenuSeparator() {
  const { theme: t } = useTheme();
  return <div style={{ height: 1, background: t.menuSeparator, margin: "4px 8px" }} />;
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  const { theme: t } = useTheme();
  return (
    <div
      style={{
        padding: "6px 14px 4px",
        fontSize: 9,
        color: t.menuLabelColor,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar button (for inline buttons like zoom)                      */
/* ------------------------------------------------------------------ */

interface ToolbarBtnProps {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  accent?: string;
  badge?: React.ReactNode;
}

function ToolbarBtn({ icon, onClick, title, active, accent, badge }: ToolbarBtnProps) {
  const { theme: t } = useTheme();
  return (
    <button
      onClick={onClick}
      className="p-1.5 rounded-md transition-colors relative"
      style={{
        background: active ? (accent ? accent + "18" : "#1a2740") : "transparent",
        border: "none",
        color: active ? (accent || "#22d3ee") : t.textSecondary,
        cursor: "pointer",
      }}
      title={title}
    >
      {icon}
      {badge}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Dropdown trigger button                                            */
/* ------------------------------------------------------------------ */

interface TriggerBtnProps {
  icon: React.ReactNode;
  label: string;
  accent?: string;
  bgAccent?: string;
  borderAccent?: string;
  /** Optional small colored status tags rendered after the label */
  tags?: { label: string; color: string }[];
}

function TriggerBtn({ icon, label, accent, bgAccent, borderAccent, tags }: TriggerBtnProps) {
  const { theme: tt } = useTheme();
  return (
    <button
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors"
      style={{
        background: bgAccent || tt.surface,
        border: `1px solid ${borderAccent || tt.surfaceBorder}`,
        color: accent || tt.textPrimary,
        cursor: "pointer",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {icon}
      <span>{label}</span>
      {tags && tags.length > 0 && tags.map((tg) => (
        <span
          key={tg.label}
          className="flex items-center gap-0.5 rounded px-1 py-px"
          style={{
            fontSize: 9,
            lineHeight: 1,
            color: tg.color,
            background: `${tg.color}18`,
            border: `1px solid ${tg.color}40`,
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: tg.color, flexShrink: 0 }} />
          {tg.label}
        </span>
      ))}
      <ChevronDown size={11} style={{ opacity: 0.5 }} />
    </button>
  );
}

/* ================================================================== */
/*  MAIN EXPORT: Toolbar                                               */
/* ================================================================== */

export interface ToolbarProps {
  // Callbacks for creating flows
  onOpenLogicBuilder: () => void;
  onOpenFlowBuilder: () => void;
  onOpenTemplates: () => void;
  onOpenFlowDoc: () => void;
  onOpenVoiceToFlow: () => void;
  // Validate
  onOpenValidator: () => void;
  // Import/Export
  onOpenJsonModal: () => void;
  onExportPDF: () => void;
  onExportSVG: () => void;
  onExportZip: () => void;
  // Tour
  onOpenTour: () => void;
  // Layout
  onSmartLayout: () => void;
  onSmartLayoutHorizontal: () => void;
  // View
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onZoomToFit: () => void;
  // Toggles
  snapToGrid: boolean;
  onToggleSnapToGrid: () => void;
  showReasons: boolean;
  onToggleReasons: () => void;
  reasonCount: number;
  // State
  hasScreens: boolean;
  zoom: number;
}

export function Toolbar({
  onOpenLogicBuilder,
  onOpenFlowBuilder,
  onOpenTemplates,
  onOpenFlowDoc,
  onOpenVoiceToFlow,
  onOpenValidator,
  onOpenJsonModal,
  onExportPDF,
  onExportSVG,
  onExportZip,
  onOpenTour,
  onSmartLayout,
  onSmartLayoutHorizontal,
  onZoomIn,
  onZoomOut,
  onResetView,
  onZoomToFit,
  snapToGrid,
  onToggleSnapToGrid,
  showReasons,
  onToggleReasons,
  reasonCount,
  hasScreens,
  zoom,
}: ToolbarProps) {
  const { theme: t } = useTheme();
  return (
    <div className="absolute top-3 right-3 flex items-center gap-1.5 z-30">
      {/* ── Group 1: Create Flow ─────────────────────── */}
      <Dropdown
        trigger={
          <TriggerBtn
            icon={<Plus size={13} />}
            label="Nuovo"
            accent={t.accentLight}
            borderAccent={t.accent}
          />
        }
      >
        <MenuLabel>Crea un flusso</MenuLabel>
        <MenuItem
          icon={<Mic size={15} />}
          label="Voice to Flow"
          sublabel="Descrivi il flusso a voce, l'AI lo genera"
          onClick={onOpenVoiceToFlow}
          accent="#22c55e"
        />
        <MenuItem
          icon={<BookOpen size={15} />}
          label="Study Docs (FlowDoc)"
          sublabel="Importa da documentazione flow-doc"
          onClick={onOpenFlowDoc}
          accent="#c084fc"
        />
        <MenuItem
          icon={<Layers size={15} />}
          label="Template predefiniti"
          sublabel="Scegli da modelli pronti all'uso"
          onClick={onOpenTemplates}
          accent="#60a5fa"
        />
      </Dropdown>

      {/* ── Smart Layout (dropdown with orientation) ──── */}
      <Dropdown
        trigger={
          <button
            disabled={!hasScreens}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors disabled:opacity-30"
            style={{
              background: t.surface,
              border: "1px solid #f59e0b",
              color: "#fbbf24",
              cursor: hasScreens ? "pointer" : "not-allowed",
              fontFamily: "system-ui, sans-serif",
            }}
            title="Smart Layout — redistribuisce i nodi con algoritmo Sugiyama"
          >
            <Sparkles size={13} />
            Layout
            <ChevronDown size={11} style={{ opacity: 0.5 }} />
          </button>
        }
      >
        <MenuLabel>Orientamento layout</MenuLabel>
        <MenuItem
          icon={<ArrowDown size={15} />}
          label="Verticale (top → bottom)"
          sublabel="Il flusso principale scorre dall'alto al basso"
          onClick={onSmartLayout}
          disabled={!hasScreens}
          accent="#f59e0b"
        />
        <MenuItem
          icon={<ArrowRight size={15} />}
          label="Orizzontale (left → right)"
          sublabel="Il flusso principale scorre da sinistra a destra"
          onClick={onSmartLayoutHorizontal}
          disabled={!hasScreens}
          accent="#f59e0b"
        />
      </Dropdown>

      {/* ── Divider ──────────────────────────────────── */}
      <div className="w-px h-5" style={{ background: t.surfaceBorder }} />

      {/* ── Group 2: Zoom controls (inline compact) ─── */}
      <div
        className="flex items-center rounded-md overflow-hidden"
        style={{ background: t.surface, border: `1px solid ${t.surfaceBorder}` }}
      >
        <ToolbarBtn icon={<ZoomOut size={14} />} onClick={onZoomOut} title="Zoom Out" />
        <span
          className="px-1 text-center select-none"
          style={{ color: t.textMuted, fontSize: 10, minWidth: 36, fontFamily: "system-ui" }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <ToolbarBtn icon={<ZoomIn size={14} />} onClick={onZoomIn} title="Zoom In" />
        <div className="w-px h-4" style={{ background: t.surfaceBorder }} />
        <ToolbarBtn icon={<Maximize2 size={13} />} onClick={onZoomToFit} title="Zoom to Fit" />
        <ToolbarBtn icon={<RotateCcw size={13} />} onClick={onResetView} title="Reset View" />
      </div>

      {/* ── Group 3: View Options dropdown ───────────── */}
      <Dropdown
        trigger={
          <TriggerBtn
            icon={<Eye size={13} />}
            label="Vista"
            tags={[
              ...(snapToGrid ? [{ label: "SNAP", color: "#22d3ee" }] : []),
              ...(showReasons ? [{ label: "UX", color: "#f59e0b" }] : []),
            ]}
          />
        }
      >
        <MenuLabel>Opzioni di visualizzazione</MenuLabel>
        <MenuToggleItem
          icon={<Grid3X3 size={15} />}
          label="Snap to Grid"
          active={snapToGrid}
          onToggle={onToggleSnapToGrid}
          accent="#22d3ee"
        />
        <MenuToggleItem
          icon={<Lightbulb size={15} />}
          label="Razionali UX"
          active={showReasons}
          onToggle={onToggleReasons}
          accent="#f59e0b"
          badge={
            reasonCount > 0 ? (
              <span
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 16,
                  height: 16,
                  fontSize: 9,
                  background: "#f59e0b",
                  color: "#000",
                  fontFamily: "system-ui",
                }}
              >
                {reasonCount}
              </span>
            ) : undefined
          }
        />
        <MenuSeparator />
        <MenuLabel>Tema</MenuLabel>
        <MenuModeSelector />
      </Dropdown>

      {/* ── Divider ──────────────────────────────────── */}
      <div className="w-px h-5" style={{ background: t.surfaceBorder }} />

      {/* ── Group 4: File / Import-Export dropdown ───── */}
      <Dropdown
        trigger={
          <TriggerBtn
            icon={<FolderOpen size={13} />}
            label="File"
          />
        }
        align="right"
      >
        <MenuLabel>Importa / Esporta</MenuLabel>
        <MenuItem
          icon={<FileJson size={15} />}
          label="JSON Import / Export"
          sublabel="Salva o carica il diagramma in JSON"
          onClick={onOpenJsonModal}
          accent="#60a5fa"
        />
        <MenuSeparator />
        <MenuItem
          icon={<FileDown size={15} />}
          label="Esporta PDF"
          onClick={onExportPDF}
          accent={t.accentLight}
        />
        <MenuItem
          icon={<FileImage size={15} />}
          label="Esporta SVG"
          onClick={onExportSVG}
          accent={t.accentLight}
        />
        <MenuItem
          icon={<FolderArchive size={15} />}
          label="Scarica sorgente (ZIP)"
          sublabel="Tutto il codice pronto per GitHub"
          onClick={onExportZip}
          accent="#34d399"
        />
        <MenuSeparator />
        <MenuItem
          icon={<MapIcon size={15} />}
          label="Tour guidato"
          sublabel="Rivedi le funzioni principali di FlowMapper"
          onClick={onOpenTour}
          accent="#6366f1"
        />
        <MenuSeparator />
        <MenuLabel>Analisi</MenuLabel>
        <MenuItem
          icon={<ShieldCheck size={15} />}
          label="Valida flusso"
          sublabel="Controlla errori e problemi strutturali"
          onClick={onOpenValidator}
          disabled={!hasScreens}
          accent="#10b981"
        />
      </Dropdown>
    </div>
  );
}