"use client";

import React, { useMemo } from "react";
import type { ProtocolResponse, ProtocolStatus } from "@/types/api";
import {
  formatDate,
  formatTime,
  formatRelativeTime,
  protocolStatusLabel,
} from "@/lib/formatters";
import { useTranslation } from "@/lib/i18n";

export interface DailyProtocolProps {
  protocol?: ProtocolResponse | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isFallback?: boolean;
  validFor?: string;
  sources?: string[] | string;
  className?: string;
}

const STATUS_BADGES: Record<
  ProtocolStatus,
  { bg: string; text: string; border: string; indicator: string }
> = {
  all_clear: {
    bg: "#f0fdf4",
    text: "#15803d",
    border: "rgba(34, 197, 94, 0.25)",
    indicator: "#22c55e",
  },
  caution: {
    bg: "#fefce8",
    text: "#a16207",
    border: "rgba(234, 179, 8, 0.25)",
    indicator: "#eab308",
  },
  restricted: {
    bg: "#fff1f2",
    text: "#9f1239",
    border: "rgba(244, 63, 94, 0.25)",
    indicator: "#f43f5e",
  },
  emergency: {
    bg: "#fff1f2",
    text: "#881337",
    border: "rgba(225, 29, 72, 0.35)",
    indicator: "#e11d48",
  },
};

export function DailyProtocol({
  protocol,
  isLoading,
  error,
  onRetry,
  isFallback: isFallbackProp,
  validFor: validForProp,
  sources: sourcesProp,
  className = "",
}: DailyProtocolProps) {
  const { t, language } = useTranslation();

  // Normalize fallback flag
  const isFallback = useMemo(() => {
    if (typeof isFallbackProp === "boolean") return isFallbackProp;
    if (!protocol) return false;
    return Boolean(
      protocol.is_fallback ||
        protocol.isFallback ||
        protocol.fallback ||
        protocol.overall_message?.toLowerCase().includes("fallback")
    );
  }, [isFallbackProp, protocol]);

  // Normalize validFor date
  const validForDate = useMemo(() => {
    return (
      validForProp ||
      protocol?.validFor ||
      protocol?.valid_for ||
      protocol?.date ||
      ""
    );
  }, [validForProp, protocol]);

  // Normalize generatedAt timestamp
  const generatedAtTimestamp = useMemo(() => {
    return protocol?.generatedAt || protocol?.generated_at || "";
  }, [protocol]);

  // Normalize sources list
  const sourceList = useMemo<string[]>(() => {
    const rawSources = sourcesProp ?? protocol?.sources;
    if (Array.isArray(rawSources)) {
      return rawSources;
    }
    if (typeof rawSources === "string") {
      return [rawSources];
    }
    return [
      "CPCB Delhi - Anand Vihar Station",
      "IMD Air Quality Forecast",
      "Automated Safety Protocol Engine",
    ];
  }, [sourcesProp, protocol]);

  if (error) {
    return (
      <div
        className={`clay-card p-6 w-full text-center ${className}`}
        data-testid="daily-protocol-error"
      >
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600 mb-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-slate-800 mb-1">
          {t("common.error")}: {t("protocol.title")}
        </p>
        <p className="text-xs text-slate-500 mb-4 max-w-sm mx-auto">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="clay-button px-4 py-1.5 text-xs font-semibold text-slate-700"
          >
            {t("common.retry") || "Retry"}
          </button>
        )}
      </div>
    );
  }

  if (isLoading || !protocol) {
    return (
      <div
        className={`clay-card p-6 sm:p-7 w-full animate-pulse flex flex-col justify-between min-h-[280px] ${className}`}
        data-testid="daily-protocol-loading"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-6 w-36 bg-slate-200 rounded-lg"></div>
            <div className="h-5 w-16 bg-amber-100 rounded-full"></div>
          </div>
          <div className="h-5 w-44 bg-slate-200 rounded-full"></div>
          <div className="h-20 w-full bg-slate-100 rounded-xl"></div>
        </div>
        <div className="pt-4 mt-4 border-t border-slate-100 flex justify-between">
          <div className="h-3.5 w-48 bg-slate-200 rounded"></div>
          <div className="h-3.5 w-32 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  const { overall_status, overall_message, activities } = protocol;
  const badge = STATUS_BADGES[overall_status] || STATUS_BADGES.caution;

  return (
    <div
      className={`clay-card p-6 sm:p-7 w-full flex flex-col justify-between relative overflow-hidden ${className}`}
      data-testid="daily-protocol"
      aria-label="Daily Safety Protocol"
    >
      <div>
        {/* Header row: Icon badge + Title + Subtitle + SAMPLE badge */}
        <div className="w-full flex items-center justify-between mb-8 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-700 shadow-xs shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                {language === "hi" ? "आज की योजना" : "Today's plan"}
              </h2>
              <p className="text-sm text-slate-400 font-medium mt-0.5">
                {language === "hi" ? "कार्यकारी स्कूल सुरक्षा निर्णय" : "Executive school safety decision"}
              </p>
            </div>
          </div>
          <span className="sample-badge text-xs px-3 py-1">
            SAMPLE
          </span>
        </div>

        {/* Fallback Warning Notice Banner */}
        {isFallback && (
          <div
            data-testid="daily-protocol-fallback-notice"
            role="alert"
            className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5 shadow-xs"
          >
            <div className="shrink-0 mt-0.5 text-amber-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-0.5 flex-1">
              <div className="font-bold text-amber-800">
                {t("protocol.fallbackNotice") || "Notice: Generated using standard fallback protocol"}
              </div>
              <p className="text-amber-700/90 text-[11px] leading-relaxed">
                {t("protocol.fallbackDescription") || "Live agent pipeline unavailable or offline. Default conservative safety policies are active."}
              </p>
            </div>
          </div>
        )}

        {/* Overall Executive Guidance Message (Exact visual appearance from screenshot) */}
        <div className="my-4 text-slate-700 text-base sm:text-lg leading-loose font-medium">
          {overall_message || "Keep students indoors from 10 AM to 2 PM. Outdoor activity is fine before 9 AM and after 3 PM."}
        </div>

        {/* Secondary Badges: Protocol status and validFor date */}
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-100">
          <span
            data-testid="daily-protocol-status"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
            style={{
              backgroundColor: badge.bg,
              color: badge.text === "#4ade80" ? "#15803d" : badge.text === "#facc15" ? "#a16207" : "#b91c1c",
              border: `1px solid ${badge.border}`,
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: badge.indicator }}
            />
            {protocolStatusLabel(overall_status, language)}
          </span>

          {validForDate && (
            <div
              data-testid="daily-protocol-valid-for"
              className="clay-pill inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 px-3 py-1"
            >
              <span>{t("protocol.validFor") || "Valid for"}:</span>
              <span className="text-slate-900">{validForDate}</span>
            </div>
          )}

          <span className="text-xs text-slate-500 font-medium ml-auto">
            {activities?.length || 0} {language === "hi" ? "नीतियां सक्रिय" : "activity policies"}
          </span>
        </div>
      </div>

      {/* Protocol metadata footer: generatedAt & sources */}
      <div className="pt-4 mt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
        {generatedAtTimestamp ? (
          <div
            data-testid="daily-protocol-generated-at"
            className="flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {t("protocol.generatedAt") || "Plan generated"}:{" "}
              <span className="text-slate-700 font-semibold">
                {formatDate(generatedAtTimestamp)} {formatTime(generatedAtTimestamp)}
              </span>{" "}
              <span className="text-slate-400">
                ({formatRelativeTime(generatedAtTimestamp, language)})
              </span>
            </span>
          </div>
        ) : (
          <span />
        )}

        {/* Data Sources Badges */}
        <div
          data-testid="daily-protocol-sources"
          className="flex items-center gap-1.5 flex-wrap"
        >
          <span className="text-slate-400">
            {t("protocol.sources") || "Sources"}:
          </span>
          {sourceList.map((source, idx) => (
            <span
              key={idx}
              className="clay-pill px-2 py-0.5 text-[10px] text-slate-600 font-semibold"
            >
              {source}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DailyProtocol;
