"use client";

import React, { useState, useMemo } from "react";
import type { ActivityDecision, ActivityDecisionType, ProtocolResponse } from "@/types/api";
import { useTranslation } from "@/lib/i18n";
import { activityDecisionStyle, activityDecisionLabel } from "@/lib/formatters";

export interface ActivityWindowsProps {
  activities?: ActivityDecision[];
  protocol?: ProtocolResponse | null;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

type FilterType = "all" | ActivityDecisionType;

export function ActivityWindows({
  activities: activitiesProp,
  protocol,
  isLoading,
  error,
  className = "",
}: ActivityWindowsProps) {
  const { t, language } = useTranslation();
  const [filter, setFilter] = useState<FilterType>("all");

  // Support either `activities` prop or `protocol` prop directly
  const activities = useMemo(() => {
    return activitiesProp ?? protocol?.activities ?? [];
  }, [activitiesProp, protocol]);

  // Decision counts for summary and filter tabs
  const counts = useMemo(() => {
    const summary = { all: activities.length, outdoors: 0, indoors: 0, restricted: 0 };
    for (const act of activities) {
      if (act.decision in summary) {
        summary[act.decision]++;
      }
    }
    return summary;
  }, [activities]);

  // Filtered activity items
  const filteredActivities = useMemo(() => {
    if (filter === "all") return activities;
    return activities.filter((act) => act.decision === filter);
  }, [activities, filter]);

  if (error) {
    return (
      <div
        className={`glass rounded-2xl p-6 w-full text-center border border-red-500/30 bg-red-950/20 backdrop-blur-md ${className}`}
        data-testid="activity-windows-error"
      >
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-500/20 text-red-400 mb-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-red-300">
          {t("activityWindows.unavailable") || "Activity Windows Unavailable"}
        </p>
        <p className="text-xs text-red-200/70 mt-1 max-w-md mx-auto">{error}</p>
      </div>
    );
  }

  if (isLoading || (!activitiesProp && !protocol)) {
    return (
      <div
        className={`glass rounded-2xl p-6 w-full animate-pulse border border-white/5 ${className}`}
        data-testid="activity-windows-loading"
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="h-6 w-56 bg-slate-700/60 rounded mb-2"></div>
            <div className="h-3.5 w-80 bg-slate-800/80 rounded"></div>
          </div>
          <div className="h-8 w-44 bg-slate-800/60 rounded-lg"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-44 bg-slate-800/40 rounded-xl border border-slate-700/20 p-4 space-y-3"
            >
              <div className="flex justify-between items-center">
                <div className="h-4 w-32 bg-slate-700/50 rounded"></div>
                <div className="h-3.5 w-16 bg-slate-700/40 rounded"></div>
              </div>
              <div className="h-6 w-28 bg-slate-700/50 rounded-full"></div>
              <div className="h-10 w-full bg-slate-800/60 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <section
      className={`glass rounded-2xl p-6 w-full border border-white/10 shadow-xl ${className}`}
      data-testid="activity-windows"
      aria-label="Activity Decision Windows"
    >
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                <span>{t("activityWindows.title") || "Activity Schedule Decisions"}</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t("activityWindows.subtitle") || "Protocol recommendations based on real-time air quality forecasts"}
              </p>
            </div>
          </div>
        </div>

        {/* Filter / Category Selector Tabs */}
        <div
          role="tablist"
          aria-label="Filter activities by decision type"
          className="flex items-center gap-1 p-1 bg-slate-900/80 border border-slate-700/50 rounded-xl text-xs overflow-x-auto self-start md:self-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            data-testid="activity-filter-all"
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              filter === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <span>{t("activityWindows.filterAll") || "All"}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === "all" ? "bg-blue-800 text-blue-100" : "bg-slate-800 text-slate-400"
              }`}
            >
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filter === "outdoors"}
            data-testid="activity-filter-outdoors"
            onClick={() => setFilter("outdoors")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              filter === "outdoors"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-emerald-400/80 hover:text-emerald-300 hover:bg-emerald-950/30"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span>{t("activityWindows.filterOutdoors") || "Outdoors"}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === "outdoors" ? "bg-emerald-800 text-emerald-100" : "bg-slate-800 text-emerald-400"
              }`}
            >
              {counts.outdoors}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filter === "indoors"}
            data-testid="activity-filter-indoors"
            onClick={() => setFilter("indoors")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              filter === "indoors"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-amber-400/80 hover:text-amber-300 hover:bg-amber-950/30"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span>{t("activityWindows.filterIndoors") || "Indoors"}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === "indoors" ? "bg-amber-800 text-amber-100" : "bg-slate-800 text-amber-400"
              }`}
            >
              {counts.indoors}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filter === "restricted"}
            data-testid="activity-filter-restricted"
            onClick={() => setFilter("restricted")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0 ${
              filter === "restricted"
                ? "bg-rose-600 text-white shadow-sm"
                : "text-rose-400/80 hover:text-rose-300 hover:bg-rose-950/30"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
            <span>{t("activityWindows.filterRestricted") || "Restricted"}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === "restricted" ? "bg-rose-800 text-rose-100" : "bg-slate-800 text-rose-400"
              }`}
            >
              {counts.restricted}
            </span>
          </button>
        </div>
      </div>

      {/* Activities Grid */}
      {filteredActivities.length === 0 ? (
        <div
          className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-700/60 bg-slate-900/30"
          data-testid="activity-windows-empty"
        >
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-300">
            {t("activityWindows.noActivities") || "No activity decisions found matching the selected filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
          {filteredActivities.map((item, index) => {
            const style = activityDecisionStyle(item.decision);
            const decisionLocalized = activityDecisionLabel(item.decision, language);

            return (
              <div
                key={`${item.activity}-${index}`}
                data-testid={`activity-card-${index}`}
                className="group relative rounded-xl p-4.5 flex flex-col justify-between border transition-all duration-200 bg-slate-900/70 hover:bg-slate-900/90"
                style={{
                  borderColor: style.border,
                  boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.4)",
                }}
              >
                {/* Top accent glow stripe */}
                <div
                  className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl transition-opacity duration-200"
                  style={{
                    backgroundColor: style.text,
                    boxShadow: style.glow,
                  }}
                />

                <div className="space-y-3">
                  {/* Activity Name & Scheduled Time */}
                  <div className="flex items-start justify-between gap-2 pt-1">
                    <h3 className="text-sm font-bold text-slate-100 group-hover:text-white transition-colors">
                      {item.activity}
                    </h3>
                    {item.scheduled_time && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-300 bg-slate-800/90 border border-slate-700/60 px-2 py-0.5 rounded-md shrink-0 shadow-xs">
                        <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{item.scheduled_time}</span>
                      </span>
                    )}
                  </div>

                  {/* Decision Status Badge */}
                  <div>
                    <span
                      data-testid={`activity-decision-${item.decision}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide"
                      style={{
                        backgroundColor: style.badgeBg,
                        color: style.badgeText,
                        border: `1px solid ${style.badgeBorder}`,
                      }}
                    >
                      <span className="font-bold text-[13px] leading-none">{style.icon}</span>
                      <span>{decisionLocalized}</span>
                    </span>
                  </div>

                  {/* Reason explanation from protocol contract */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {t("activityWindows.reasonLabel") || "Reason"}
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-white/5">
                      {item.reason}
                    </p>
                  </div>
                </div>

                {/* Alternative suggestion if present */}
                {item.alternative && (
                  <div className="mt-3 pt-2.5 border-t border-white/10">
                    <div className="flex items-start gap-2 bg-blue-950/30 border border-blue-500/20 rounded-lg p-2.5 text-xs">
                      <span className="text-blue-400 font-semibold shrink-0 mt-0.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      </span>
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-300 block">
                          {t("activityWindows.alternativeLabel") || "Suggested Alternative"}
                        </span>
                        <span className="text-slate-200 leading-normal block">
                          {item.alternative}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ActivityWindows;
