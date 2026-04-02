import React, { useEffect } from "react";
import {
  Loader2,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  X,
  Clock,
} from "lucide-react";
import { useTheme } from "./ThemeContext";

// ─── Alert types ──────────────────────────────────────

export type AlertLevel = "info" | "warning" | "error" | "success";

export interface LoadingAlert {
  id: string;
  level: AlertLevel;
  title: string;
  message: string;
  timestamp: number;
  dismissible?: boolean;
  autoDismissMs?: number;
}

// ─── Progress state ───────────────────────────────────

export interface LoadingProgress {
  phase: string;
  detail?: string;
  percent?: number; // 0-100, undefined = indeterminate
  elapsedMs?: number;
}

// ─── Alert icon helpers ───────────────────────────────

const LEVEL_STYLES: Record<
  AlertLevel,
  { bg: string; border: string; iconColor: string; titleColor: string; textColor: string }
> = {
  info: {
    bg: "#1e1e2e",
    border: "#3b82f6",
    iconColor: "#3b82f6",
    titleColor: "#93c5fd",
    textColor: "#9ca3af",
  },
  warning: {
    bg: "#2d2517",
    border: "#f59e0b",
    iconColor: "#f59e0b",
    titleColor: "#fcd34d",
    textColor: "#d1d5db",
  },
  error: {
    bg: "#2d1b1b",
    border: "#ef4444",
    iconColor: "#ef4444",
    titleColor: "#fca5a5",
    textColor: "#d1d5db",
  },
  success: {
    bg: "#1b2d1b",
    border: "#22c55e",
    iconColor: "#22c55e",
    titleColor: "#86efac",
    textColor: "#9ca3af",
  },
};

function AlertIcon({ level, size = 16 }: { level: AlertLevel; size?: number }) {
  const color = LEVEL_STYLES[level].iconColor;
  switch (level) {
    case "info":
      return <Loader2 size={size} style={{ color }} className="animate-spin" />;
    case "warning":
      return <AlertTriangle size={size} style={{ color }} />;
    case "error":
      return <XCircle size={size} style={{ color }} />;
    case "success":
      return <CheckCircle2 size={size} style={{ color }} />;
  }
}

// ─── Elapsed timer formatter ──────────────────────────

function formatElapsed(ms: number): string {
  if (ms < 1000) return "< 1s";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

// ─── Toast component ──────────────────────────────────

function Toast({
  alert,
  onDismiss,
}: {
  alert: LoadingAlert;
  onDismiss: (id: string) => void;
}) {
  const style = LEVEL_STYLES[alert.level];

  useEffect(() => {
    if (alert.autoDismissMs) {
      const t = setTimeout(() => onDismiss(alert.id), alert.autoDismissMs);
      return () => clearTimeout(t);
    }
  }, [alert.id, alert.autoDismissMs, onDismiss]);

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-lg animate-in slide-in-from-bottom-2"
      style={{
        background: style.bg,
        border: `1px solid ${style.border}40`,
        boxShadow: `0 8px 30px rgba(0,0,0,0.5), 0 0 0 1px ${style.border}20`,
        maxWidth: 440,
        minWidth: 320,
        animation: "slideUp 0.3s ease-out",
      }}
    >
      <div className="flex-shrink-0 mt-0.5">
        <AlertIcon level={alert.level} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm" style={{ color: style.titleColor }}>
          {alert.title}
        </div>
        <div className="text-xs mt-0.5" style={{ color: style.textColor }}>
          {alert.message}
        </div>
      </div>
      {alert.dismissible !== false && (
        <button
          onClick={() => onDismiss(alert.id)}
          className="flex-shrink-0 p-0.5 rounded transition-colors"
          style={{ color: "#6b7280" }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Main overlay component ───────────────────────────

interface LoadingOverlayProps {
  visible: boolean;
  progress: LoadingProgress | null;
  alerts: LoadingAlert[];
  onDismissAlert: (id: string) => void;
}

export function LoadingOverlay({
  visible,
  progress,
  alerts,
  onDismissAlert,
}: LoadingOverlayProps) {
  const { theme: t } = useTheme();
  return (
    <>
      {/* Loading progress bar (top of canvas) */}
      {visible && progress && (
        <div
          className="absolute top-0 left-0 right-0 z-40"
          style={{ height: 3 }}
        >
          {progress.percent !== undefined ? (
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${progress.percent}%`,
                background: "linear-gradient(90deg, #6366f1, #818cf8)",
              }}
            />
          ) : (
            <div
              className="h-full"
              style={{
                background: "linear-gradient(90deg, transparent, #6366f1, transparent)",
                animation: "shimmer 1.5s infinite",
              }}
            />
          )}
        </div>
      )}

      {/* Loading status pill (top center) */}
      {visible && progress && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
          <div
            className="flex items-center gap-2.5 px-4 py-2 rounded-full"
            style={{
              background: t.mode === "dark" ? "#1e1e2eee" : "#ffffffee",
              border: `1px solid ${t.surfaceBorder}`,
              boxShadow: `0 8px 30px ${t.shadow}`,
              backdropFilter: "blur(8px)",
            }}
          >
            <Loader2 size={14} style={{ color: t.accentLight }} className="animate-spin" />
            <div>
              <div className="text-xs" style={{ color: t.textPrimary }}>
                {progress.phase}
              </div>
              {progress.detail && (
                <div className="text-xs" style={{ color: t.textMuted, fontSize: 10 }}>
                  {progress.detail}
                </div>
              )}
            </div>
            {progress.elapsedMs !== undefined && (
              <div
                className="flex items-center gap-1 pl-2"
                style={{ borderLeft: `1px solid ${t.surfaceBorder}` }}
              >
                <Clock size={10} style={{ color: t.textMuted }} />
                <span className="text-xs" style={{ color: t.textMuted, fontSize: 10 }}>
                  {formatElapsed(progress.elapsedMs)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast stack (bottom center) */}
      {alerts.length > 0 && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center"
          style={{ pointerEvents: "auto" }}
        >
          {alerts.map((alert) => (
            <Toast key={alert.id} alert={alert} onDismiss={onDismissAlert} />
          ))}
        </div>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

// ─── Config & thresholds ──────────────────────────────

export const LIMITS = {
  /** Max response body size in bytes before warning (50 MB) */
  RESPONSE_SIZE_WARN: 50 * 1024 * 1024,
  /** Max response body size before aborting (200 MB) */
  RESPONSE_SIZE_ABORT: 200 * 1024 * 1024,
  /** Max number of total frames before warning */
  FRAME_COUNT_WARN: 500,
  /** Max number of total frames before aborting */
  FRAME_COUNT_ABORT: 5000,
  /** Fetch timeout in ms (3 minutes) */
  FETCH_TIMEOUT_MS: 180_000,
  /** Thumbnail fetch timeout per batch in ms (90 seconds) */
  THUMB_TIMEOUT_MS: 90_000,
  /** Max screens to render before warning */
  SCREEN_COUNT_WARN: 250,
  /** Max IDs per Figma images API request */
  THUMB_BATCH_SIZE: 50,
};