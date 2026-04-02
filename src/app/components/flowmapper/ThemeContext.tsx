import React, { createContext, useContext, useState, useCallback } from "react";

/* ================================================================== */
/*  FlowMapper Theme Tokens                                            */
/* ================================================================== */

export interface ThemeTokens {
  mode: "light" | "dark";

  // Canvas
  canvasBg: string;
  dotGrid: string;
  snapGridLine: string;
  snapGridDot: string;

  // Panels (sidebar, toolbar containers)
  panelBg: string;
  panelBorder: string;

  // Surfaces (cards, inputs, popover menus)
  surface: string;
  surfaceHover: string;
  surfaceBorder: string;

  // Text
  text: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;

  // Accent (indigo)
  accent: string;
  accentLight: string;
  accentText: string;
  accentBg: string;
  accentBorder: string;

  // Nodes — screen
  nodeFill: string;
  nodeFillSelected: string;
  nodeStroke: string;
  nodeStrokeSelected: string;
  nodeThumbBg: string;
  nodeThumbBgAlt: string;
  nodeSkeletonFill: string;
  nodeNameColor: string;
  nodeShadow: string;

  // Nodes — decision
  decisionFill: string;
  decisionStroke: string;
  decisionFillSelected: string;
  decisionStrokeSelected: string;
  decisionText: string;
  decisionShadowColor: string;

  // Ports
  portFill: string;
  portStroke: string;
  portDot: string;
  inputPortFill: string;
  inputPortStroke: string;

  // Edge labels
  edgeLabelBg: string;
  edgeLabelText: string;

  // Reason/UX
  reasonBg: string;
  reasonBorder: string;
  reasonText: string;
  reasonHeaderText: string;

  // Danger
  dangerBg: string;
  dangerBorder: string;
  dangerText: string;

  // Badges & overlays
  shadow: string;
  shadowStrong: string;
  overlayBg: string;
  marqueeFill: string;
  marqueeStroke: string;

  // Bottom palette
  paletteBg: string;
  paletteBorder: string;
  paletteInactive: string;

  // Dropdown menu
  menuBg: string;
  menuBorder: string;
  menuShadow: string;
  menuHover: string;
  menuSeparator: string;
  menuLabelColor: string;
  toggleTrackOff: string;
  toggleThumbOff: string;
}

/* ── Dark Theme ───────────────────────────────────────── */

export const darkTheme: ThemeTokens = {
  mode: "dark",

  canvasBg: "#0f0f1a",
  dotGrid: "#1f2937",
  snapGridLine: "#1a2a3a",
  snapGridDot: "#22d3ee",

  panelBg: "#13131f",
  panelBorder: "#1f2937",

  surface: "#1e1e2e",
  surfaceHover: "#1e1e34",
  surfaceBorder: "#2d2d44",

  text: "#ffffff",
  textPrimary: "#d1d5db",
  textSecondary: "#9ca3af",
  textMuted: "#6b7280",
  textDim: "#4b5563",

  accent: "#6366f1",
  accentLight: "#818cf8",
  accentText: "#a5b4fc",
  accentBg: "#4f46e520",
  accentBorder: "#4f46e530",

  nodeFill: "#1e1e2e",
  nodeFillSelected: "#4f46e5",
  nodeStroke: "#2d2d44",
  nodeStrokeSelected: "#6366f1",
  nodeThumbBg: "#13131f",
  nodeThumbBgAlt: "#0f0f2a",
  nodeSkeletonFill: "#374151",
  nodeNameColor: "white",
  nodeShadow: "rgba(0,0,0,0.6)",

  decisionFill: "#2d1b69",
  decisionStroke: "#6d28d9",
  decisionFillSelected: "#7c3aed",
  decisionStrokeSelected: "#a78bfa",
  decisionText: "#e9d5ff",
  decisionShadowColor: "#6d28d9",

  portFill: "#1e1e2e",
  portStroke: "#6366f1",
  portDot: "#6366f1",
  inputPortFill: "#0f2a1a",
  inputPortStroke: "#22c55e",

  edgeLabelBg: "#1a1a2e",
  edgeLabelText: "white",

  reasonBg: "rgba(26,21,0,0.92)",
  reasonBorder: "rgba(245,158,11,0.45)",
  reasonText: "#fbbf24",
  reasonHeaderText: "#f59e0b",

  dangerBg: "rgba(239,68,68,0.15)",
  dangerBorder: "rgba(239,68,68,0.3)",
  dangerText: "#f87171",

  shadow: "rgba(0,0,0,0.5)",
  shadowStrong: "rgba(0,0,0,0.65)",
  overlayBg: "rgba(15,15,26,0.85)",
  marqueeFill: "rgba(99,102,241,0.12)",
  marqueeStroke: "#6366f1",

  paletteBg: "#181825",
  paletteBorder: "#2d2d44",
  paletteInactive: "#71717a",

  menuBg: "#14141f",
  menuBorder: "#2d2d44",
  menuShadow: "0 12px 40px rgba(0,0,0,0.65)",
  menuHover: "#1e1e34",
  menuSeparator: "#2d2d44",
  menuLabelColor: "#4b5563",
  toggleTrackOff: "#2d2d44",
  toggleThumbOff: "#4b5563",
};

/* ── Light Theme ──────────────────────────────────────── */

export const lightTheme: ThemeTokens = {
  mode: "light",

  canvasBg: "#f0f1f5",
  dotGrid: "#c8c8d4",
  snapGridLine: "#bfd0e0",
  snapGridDot: "#0891b2",

  panelBg: "#ffffff",
  panelBorder: "#e0e0e6",

  surface: "#f5f5f8",
  surfaceHover: "#eeeef4",
  surfaceBorder: "#d4d4dc",

  text: "#1a1a2e",
  textPrimary: "#374151",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  textDim: "#c4c4cc",

  accent: "#6366f1",
  accentLight: "#4f46e5",
  accentText: "#6366f1",
  accentBg: "#6366f112",
  accentBorder: "#6366f125",

  nodeFill: "#ffffff",
  nodeFillSelected: "#eef2ff",
  nodeStroke: "#d4d4dc",
  nodeStrokeSelected: "#6366f1",
  nodeThumbBg: "#f0f0f5",
  nodeThumbBgAlt: "#e8e8f0",
  nodeSkeletonFill: "#d1d5db",
  nodeNameColor: "#1e293b",
  nodeShadow: "rgba(0,0,0,0.08)",

  decisionFill: "#f5f0ff",
  decisionStroke: "#8b5cf6",
  decisionFillSelected: "#7c3aed",
  decisionStrokeSelected: "#a78bfa",
  decisionText: "#5b21b6",
  decisionShadowColor: "#8b5cf6",

  portFill: "#ffffff",
  portStroke: "#6366f1",
  portDot: "#6366f1",
  inputPortFill: "#ecfdf5",
  inputPortStroke: "#22c55e",

  edgeLabelBg: "#ffffff",
  edgeLabelText: "#1e293b",

  reasonBg: "rgba(255,251,235,0.95)",
  reasonBorder: "rgba(217,119,6,0.35)",
  reasonText: "#92400e",
  reasonHeaderText: "#b45309",

  dangerBg: "rgba(239,68,68,0.08)",
  dangerBorder: "rgba(239,68,68,0.2)",
  dangerText: "#dc2626",

  shadow: "rgba(0,0,0,0.08)",
  shadowStrong: "rgba(0,0,0,0.12)",
  overlayBg: "rgba(255,255,255,0.85)",
  marqueeFill: "rgba(99,102,241,0.1)",
  marqueeStroke: "#6366f1",

  paletteBg: "#ffffff",
  paletteBorder: "#d4d4dc",
  paletteInactive: "#9ca3af",

  menuBg: "#ffffff",
  menuBorder: "#e0e0e6",
  menuShadow: "0 12px 40px rgba(0,0,0,0.12)",
  menuHover: "#f5f5f8",
  menuSeparator: "#e5e5ea",
  menuLabelColor: "#9ca3af",
  toggleTrackOff: "#d4d4dc",
  toggleThumbOff: "#9ca3af",
};

/* ── Context ──────────────────────────────────────────── */

interface ThemeContextValue {
  theme: ThemeTokens;
  setMode: (mode: "light" | "dark") => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  setMode: () => {},
});

export function FlowMapperThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeRaw] = useState<"light" | "dark">("dark");

  const setMode = useCallback((m: "light" | "dark") => {
    setModeRaw(m);
  }, []);

  const theme = mode === "dark" ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Hook to access current FlowMapper theme tokens */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
