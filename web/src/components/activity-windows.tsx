"use client";

import React from "react";
import type { ActivityDecision, ActivityDecisionType } from "@/types/api";

export interface ActivityWindowsProps {
  activities?: ActivityDecision[];
  isLoading?: boolean;
  error?: string | null;
}

const DECISION_STYLES: Record<
  ActivityDecisionType,
  { label: string; bg: string; text: string; border: string; icon: string }
> = {
  outdoors: {
    label: "Outdoors Approved",
    bg: "rgba(34, 197, 94, 0.12)",
    text: "#4ade80",
    border: "rgba(34, 197, 94, 0.3)",
    icon: "✓",
  },
  indoors: {
    label: "Moved Indoors",
    bg: "rgba(234, 179, 8, 0.12)",
    text: "#facc15",
    border: "rgba(234, 179, 8, 0.3)",
    icon: "⌂",
  },
  restricted: {
    label: "Fully Restricted",
    bg: "rgba(239, 68, 68, 0.12)",
    text: "#f87171",
    border: "rgba(239, 68, 68, 0.3)",
    icon: "✕",
  },
};

export function ActivityWindows({
  activities,
  isLoading,
  error,
}: ActivityWindowsProps) {
  if (error) {
    return (
      <div
        className="glass rounded-2xl p-6 w-full text-center border border-red-500/30 bg-red-950/10"
        data-testid="activity-windows-error"
      >
        <p className="text-sm font-semibold text-red-300">
          Activity Windows Unavailable
        </p>
        <p className="text-xs text-red-200/70 mt-1">{error}</p>
      </div>
    );
  }

  if (isLoading || !activities) {
    return (
      <div
        className="glass rounded-2xl p-6 w-full animate-pulse"
        data-testid="activity-windows-loading"
      >
        <div className="h-6 w-48 bg-slate-700/60 rounded mb-4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 bg-slate-800/50 rounded-xl"
            ></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section
      className="glass rounded-2xl p-6 w-full"
      data-testid="activity-windows"
      aria-label="Activity Decision Windows"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>Activity Schedule Decisions</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
              {activities.length} Activities Evaluated
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Protocol recommendations based on real-time air quality forecasts
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Outdoors
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            Indoors
          </span>
          <span className="flex items-center gap-1 text-rose-400">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            Restricted
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activities.map((item, index) => {
          const style = DECISION_STYLES[item.decision] || DECISION_STYLES.indoors;
          return (
            <div
              key={index}
              className="rounded-xl p-4 flex flex-col justify-between border transition-all hover:border-slate-600/60 bg-slate-900/60"
              style={{
                borderColor: `${style.border}`,
              }}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-slate-100">
                    {item.activity}
                  </h3>
                  {item.scheduled_time && (
                    <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded shrink-0">
                      {item.scheduled_time}
                    </span>
                  )}
                </div>

                {/* Decision badge */}
                <div className="mb-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: style.bg,
                      color: style.text,
                      border: `1px solid ${style.border}`,
                    }}
                  >
                    <span>{style.icon}</span>
                    <span>{style.label}</span>
                  </span>
                </div>

                {/* Reason */}
                <p className="text-xs text-slate-300 leading-relaxed mb-2">
                  {item.reason}
                </p>
              </div>

              {/* Alternative recommendation if any */}
              {item.alternative && (
                <div className="mt-2 pt-2 border-t border-white/5 text-[11px] text-slate-400 flex items-start gap-1.5">
                  <span className="text-blue-400 font-medium">Alternative:</span>
                  <span>{item.alternative}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default ActivityWindows;
