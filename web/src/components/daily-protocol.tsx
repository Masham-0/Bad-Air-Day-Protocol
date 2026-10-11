"use client";

import React from "react";
import type { ProtocolResponse, ProtocolStatus } from "@/types/api";
import {
  formatDate,
  formatTime,
  formatRelativeTime,
  protocolStatusLabel,
  protocolStatusColor,
} from "@/lib/formatters";

export interface DailyProtocolProps {
  protocol?: ProtocolResponse | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const STATUS_BADGES: Record<
  ProtocolStatus,
  { bg: string; text: string; border: string; indicator: string }
> = {
  all_clear: {
    bg: "rgba(34, 197, 94, 0.15)",
    text: "#4ade80",
    border: "rgba(34, 197, 94, 0.3)",
    indicator: "#22c55e",
  },
  caution: {
    bg: "rgba(234, 179, 8, 0.15)",
    text: "#facc15",
    border: "rgba(234, 179, 8, 0.3)",
    indicator: "#eab308",
  },
  restricted: {
    bg: "rgba(239, 68, 68, 0.15)",
    text: "#f87171",
    border: "rgba(239, 68, 68, 0.3)",
    indicator: "#ef4444",
  },
  emergency: {
    bg: "rgba(127, 29, 29, 0.3)",
    text: "#fca5a5",
    border: "rgba(127, 29, 29, 0.6)",
    indicator: "#7f1d1d",
  },
};

export function DailyProtocol({
  protocol,
  isLoading,
  error,
  onRetry,
}: DailyProtocolProps) {
  if (error) {
    return (
      <div
        className="glass rounded-2xl p-6 w-full border border-red-500/30 bg-red-950/10 text-center"
        data-testid="daily-protocol-error"
      >
        <p className="text-sm font-semibold text-red-300 mb-1">
          Unable to load daily protocol
        </p>
        <p className="text-xs text-red-200/70 mb-3">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (isLoading || !protocol) {
    return (
      <div
        className="glass rounded-2xl p-6 w-full animate-pulse"
        data-testid="daily-protocol-loading"
      >
        <div className="h-5 w-40 bg-slate-700/60 rounded mb-4"></div>
        <div className="h-8 w-28 bg-slate-700/50 rounded-full mb-3"></div>
        <div className="h-14 w-full bg-slate-800/50 rounded-xl mb-4"></div>
        <div className="h-4 w-48 bg-slate-700/40 rounded"></div>
      </div>
    );
  }

  const { overall_status, overall_message, date, generated_at, activities } =
    protocol;
  const badge = STATUS_BADGES[overall_status] || STATUS_BADGES.caution;

  return (
    <div
      className="glass rounded-2xl p-6 w-full flex flex-col justify-between relative overflow-hidden"
      data-testid="daily-protocol"
    >
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Daily Safety Protocol
          </span>
          <span className="text-xs font-medium text-slate-400">
            Date: {date}
          </span>
        </div>

        {/* Overall Status Badge */}
        <div className="flex items-center gap-2 mb-4">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
            style={{
              backgroundColor: badge.bg,
              color: badge.text,
              border: `1px solid ${badge.border}`,
            }}
          >
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: badge.indicator }}
            />
            {protocolStatusLabel(overall_status)}
          </span>
          <span className="text-xs text-slate-400">
            ({activities.length} activity policies active)
          </span>
        </div>

        {/* Executive message */}
        {overall_message && (
          <div className="bg-slate-900/60 border border-white/5 rounded-xl p-3.5 mb-4 text-sm text-slate-200 leading-relaxed">
            {overall_message}
          </div>
        )}
      </div>

      {/* Protocol metadata */}
      <div className="pt-3 border-t border-white/5 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
        <span>
          Plan generated: {formatDate(generated_at)} at {formatTime(generated_at)}
        </span>
        <span className="text-slate-500">
          Source: Automated Health Agent
        </span>
      </div>
    </div>
  );
}

export default DailyProtocol;
