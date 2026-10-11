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
    bg: "rgba(34, 197, 94, 0.15)",
    text: "#4ade80",
    border: "rgba(34, 197, 94, 0.35)",
    indicator: "#22c55e",
  },
  caution: {
    bg: "rgba(234, 179, 8, 0.15)",
    text: "#facc15",
    border: "rgba(234, 179, 8, 0.35)",
    indicator: "#eab308",
  },
  restricted: {
    bg: "rgba(239, 68, 68, 0.15)",
    text: "#f87171",
    border: "rgba(239, 68, 68, 0.35)",
    indicator: "#ef4444",
  },
  emergency: {
    bg: "rgba(127, 29, 29, 0.3)",
    text: "#fca5a5",
    border: "rgba(127, 29, 29, 0.6)",
    indicator: "#ef4444",
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
        className={`glass rounded-2xl p-6 w-full border border-red-500/30 bg-red-950/20 text-center backdrop-blur-md ${className}`}
        data-testid="daily-protocol-error"
      >
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-500/20 text-red-400 mb-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-red-300 mb-1">
          {t("common.error")}: {t("protocol.title")}
        </p>
        <p className="text-xs text-red-200/70 mb-4 max-w-sm mx-auto">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40 transition-colors"
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
        className={`glass rounded-2xl p-6 w-full animate-pulse border border-white/5 flex flex-col justify-between ${className}`}
        data-testid="daily-protocol-loading"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-4 w-36 bg-slate-700/60 rounded"></div>
            <div className="h-4 w-28 bg-slate-700/50 rounded"></div>
          </div>
          <div className="h-8 w-40 bg-slate-700/50 rounded-full"></div>
          <div className="h-16 w-full bg-slate-800/50 rounded-xl"></div>
        </div>
        <div className="pt-4 mt-4 border-t border-white/5 flex justify-between">
          <div className="h-3.5 w-48 bg-slate-700/40 rounded"></div>
          <div className="h-3.5 w-32 bg-slate-700/40 rounded"></div>
        </div>
      </div>
    );
  }

  const { overall_status, overall_message, activities } = protocol;
  const badge = STATUS_BADGES[overall_status] || STATUS_BADGES.caution;

  return (
    <div
      className={`glass rounded-2xl p-6 w-full flex flex-col justify-between relative overflow-hidden border border-white/10 shadow-xl ${className}`}
      data-testid="daily-protocol"
      aria-label="Daily Safety Protocol"
    >
      <div>
        {/* Header bar: Title & Valid For */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {t("protocol.title") || "Daily Safety Protocol"}
            </span>
          </div>

          {validForDate && (
            <div
              data-testid="daily-protocol-valid-for"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 bg-slate-800/80 border border-slate-700/50 px-2.5 py-0.5 rounded-full"
            >
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{t("protocol.validFor") || "Valid for"}:</span>
              <span className="font-semibold text-slate-100">{validForDate}</span>
            </div>
          )}
        </div>

        {/* Fallback Warning Notice Banner */}
        {isFallback && (
          <div
            data-testid="daily-protocol-fallback-notice"
            role="alert"
            className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5 shadow-sm"
          >
            <div className="shrink-0 mt-0.5 text-amber-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-0.5 flex-1">
              <div className="font-bold text-amber-300">
                {t("protocol.fallbackNotice") || "Notice: Generated using standard fallback protocol"}
              </div>
              <p className="text-amber-200/80 text-[11px] leading-relaxed">
                {t("protocol.fallbackDescription") || "Live agent pipeline unavailable or offline. Default conservative safety policies are active."}
              </p>
            </div>
          </div>
        )}

        {/* Overall Status Badge */}
        <div className="flex flex-wrap items-center gap-2.5 mb-3.5">
          <span
            data-testid="daily-protocol-status"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm"
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
            {protocolStatusLabel(overall_status, language)}
          </span>
          <span className="text-xs text-slate-400 font-medium">
            (
            {t("protocol.activePolicies", { count: activities?.length || 0 }) ||
              `${activities?.length || 0} activity policies active`}
            )
          </span>
        </div>

        {/* Executive message */}
        {overall_message && (
          <div className="bg-slate-900/70 border border-white/5 rounded-xl p-3.5 mb-4 text-xs sm:text-sm text-slate-200 leading-relaxed shadow-inner">
            {overall_message}
          </div>
        )}
      </div>

      {/* Protocol metadata footer: generatedAt & sources */}
      <div className="pt-3 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-slate-400 gap-2">
        {generatedAtTimestamp ? (
          <div
            data-testid="daily-protocol-generated-at"
            className="flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {t("protocol.generatedAt") || "Plan generated"}:{" "}
              <span className="text-slate-300 font-medium">
                {formatDate(generatedAtTimestamp)} {formatTime(generatedAtTimestamp)}
              </span>{" "}
              <span className="text-slate-500">
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
          <span className="text-slate-500">
            {t("protocol.sources") || "Sources"}:
          </span>
          {sourceList.map((source, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/50 text-[10px] text-slate-300 font-medium"
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
