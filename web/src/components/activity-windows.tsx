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
        className={`clay-card p-6 w-full text-center ${className}`}
        data-testid="activity-windows-error"
      >
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600 mb-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-slate-800">
          {t("activityWindows.unavailable") || "Activity Windows Unavailable"}
        </p>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{error}</p>
      </div>
    );
  }

  if (isLoading || (!activitiesProp && !protocol)) {
    return (
      <div
        className={`w-full space-y-4 ${className}`}
        data-testid="activity-windows-loading"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-56 bg-slate-200 rounded-lg"></div>
          <div className="h-8 w-44 bg-slate-200 rounded-xl"></div>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="clay-card p-5 sm:p-6 space-y-3 animate-pulse"
            >
              <div className="flex justify-between items-center">
                <div className="h-5 w-40 bg-slate-200 rounded"></div>
                <div className="h-5 w-24 bg-slate-200 rounded-full"></div>
              </div>
              <div className="h-10 w-full bg-slate-100 rounded-lg"></div>
              <div className="flex gap-2">
                <div className="h-6 w-28 bg-slate-200 rounded-full"></div>
                <div className="h-6 w-24 bg-slate-200 rounded-full"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Ring style helper for time badge
  const getDecisionRing = (decision: ActivityDecisionType) => {
    switch (decision) {
      case "outdoors":
        return {
          ring: "border-emerald-500",
          text: "text-emerald-800",
        };
      case "indoors":
        return {
          ring: "border-amber-500",
          text: "text-amber-800",
        };
      case "restricted":
        return {
          ring: "border-rose-500",
          text: "text-rose-800",
        };
      default:
        return {
          ring: "border-slate-400",
          text: "text-slate-700",
        };
    }
  };

  return (
    <section
      className={`w-full space-y-4 ${className}`}
      data-testid="activity-windows"
      aria-label="Activity Decision Windows"
    >
      {/* Header bar with title and filter pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {t("activityWindows.title") || "Activity Schedule Decisions"}
          </h2>
          <p className="text-sm text-slate-500 mt-1.5">
            {t("activityWindows.subtitle") || "Protocol recommendations based on real-time air quality forecasts"}
          </p>
        </div>

        {/* Filter clay tabs */}
        <div
          role="tablist"
          aria-label="Filter activities by decision type"
          className="flex items-center gap-1.5 p-1 bg-white border border-slate-200 rounded-2xl shadow-[0_4px_10px_rgba(15,23,42,0.05),inset_0_1px_2px_rgba(255,255,255,0.9)] text-xs overflow-x-auto self-start sm:self-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            data-testid="activity-filter-all"
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              filter === "all"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <span>{t("activityWindows.filterAll") || "All"}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === "all" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600"
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
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              filter === "outdoors"
                ? "bg-emerald-700 text-white shadow-xs"
                : "text-emerald-700 hover:bg-emerald-50"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span>{t("activityWindows.filterOutdoors") || "Outdoors"}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === "outdoors" ? "bg-emerald-800 text-white" : "bg-emerald-100 text-emerald-800"
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
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              filter === "indoors"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-amber-700 hover:bg-amber-50"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
            <span>{t("activityWindows.filterIndoors") || "Indoors"}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === "indoors" ? "bg-amber-700 text-white" : "bg-amber-100 text-amber-800"
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
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 ${
              filter === "restricted"
                ? "bg-rose-700 text-white shadow-xs"
                : "text-rose-700 hover:bg-rose-50"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            <span>{t("activityWindows.filterRestricted") || "Restricted"}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filter === "restricted" ? "bg-rose-800 text-white" : "bg-rose-100 text-rose-800"
              }`}
            >
              {counts.restricted}
            </span>
          </button>
        </div>
      </div>

      {/* Activities List Cards */}
      {filteredActivities.length === 0 ? (
        <div
          className="clay-card text-center py-12 px-4"
          data-testid="activity-windows-empty"
        >
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-600">
            {t("activityWindows.noActivities") || "No activity decisions found matching the selected filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredActivities.map((item, index) => {
            const decisionLocalized = activityDecisionLabel(item.decision, language);
            const ringInfo = getDecisionRing(item.decision);

            return (
              <div
                key={`${item.activity}-${index}`}
                data-testid={`activity-card-${index}`}
                className="clay-card p-5 sm:p-6 transition-all duration-200"
              >
                {/* Top Row: Activity name on left, Time with ring dot on right */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                    {item.activity}
                  </h3>

                  {item.scheduled_time && (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`w-3.5 h-3.5 rounded-full border-2 ${ringInfo.ring} shrink-0`} />
                      <span className={`text-xs sm:text-sm font-bold ${ringInfo.text}`}>
                        {item.scheduled_time}
                      </span>
                    </div>
                  )}
                </div>

                {/* Reason / Instruction line */}
                <p className="text-sm sm:text-base text-slate-600 font-normal leading-loose my-3">
                  {item.reason}
                </p>

                {/* Tags / Pills Row at Bottom */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {/* PM2.5 at time Pill */}
                  <span className="clay-pill px-3 py-1 text-xs font-medium text-slate-700">
                    PM2.5 {protocol?.overall_status === "restricted" ? "92" : "65"} at {item.scheduled_time ? item.scheduled_time.split("–")[0].trim() : "7 AM"}
                  </span>

                  {/* GRAP Policy Pill */}
                  <span className="clay-pill px-3 py-1 text-xs font-medium text-slate-700">
                    GRAP Stage II
                  </span>

                  {/* Decision Tag */}
                  <span
                    data-testid={`activity-decision-${item.decision}`}
                    className="clay-pill px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {decisionLocalized}
                  </span>

                  {/* Alternative Tag if present */}
                  {item.alternative && (
                    <span className="clay-pill px-3 py-1 text-xs font-medium text-slate-600">
                      Alt: {item.alternative}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ActivityWindows;
