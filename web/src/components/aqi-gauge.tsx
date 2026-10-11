"use client";

import React, { useEffect, useState } from "react";
import type { AirQualityReading, AqiCategory } from "@/types/api";
import { getAirQuality } from "@/lib/api-client";
import {
  formatDate,
  formatTime,
  formatRelativeTime,
  formatPM25,
  formatPM10,
  aqiCategoryLabel,
  aqiCategoryColor,
} from "@/lib/formatters";
import { useTranslation, getLocalizedCategoryLabel } from "@/lib/i18n";

export interface AqiGaugeProps {
  reading?: AirQualityReading | null;
  schoolId?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const CATEGORY_COLORS: Record<AqiCategory, { stroke: string; bg: string; text: string; border: string }> = {
  good: {
    stroke: "#22c55e",
    bg: "rgba(34, 197, 94, 0.15)",
    text: "#4ade80",
    border: "rgba(34, 197, 94, 0.3)",
  },
  moderate: {
    stroke: "#eab308",
    bg: "rgba(234, 179, 8, 0.15)",
    text: "#facc15",
    border: "rgba(234, 179, 8, 0.3)",
  },
  unhealthy_sensitive: {
    stroke: "#f97316",
    bg: "rgba(249, 115, 22, 0.15)",
    text: "#fb923c",
    border: "rgba(249, 115, 22, 0.3)",
  },
  unhealthy: {
    stroke: "#ef4444",
    bg: "rgba(239, 68, 68, 0.15)",
    text: "#f87171",
    border: "rgba(239, 68, 68, 0.3)",
  },
  very_unhealthy: {
    stroke: "#a855f7",
    bg: "rgba(168, 85, 247, 0.15)",
    text: "#c084fc",
    border: "rgba(168, 85, 247, 0.3)",
  },
  hazardous: {
    stroke: "#7f1d1d",
    bg: "rgba(127, 29, 29, 0.25)",
    text: "#fca5a5",
    border: "rgba(127, 29, 29, 0.5)",
  },
};

export function AqiGauge({
  reading: initialReading,
  schoolId,
  isLoading: externalLoading,
  error: externalError,
  onRetry,
}: AqiGaugeProps) {
  const { t, language } = useTranslation();
  const effectiveSchoolId = schoolId || "sch_anand_vihar_01";
  const [internalReading, setInternalReading] = useState<AirQualityReading | null>(
    initialReading ?? null
  );
  const [internalLoading, setInternalLoading] = useState<boolean>(
    initialReading === undefined
  );
  const [internalError, setInternalError] = useState<string | null>(null);

  const fetchReading = async (id: string) => {
    try {
      setInternalLoading(true);
      setInternalError(null);
      const res = await getAirQuality(id);
      setInternalReading(res.current);
    } catch (err: unknown) {
      setInternalError(
        err instanceof Error ? err.message : "Failed to load air quality data"
      );
    } finally {
      setInternalLoading(false);
    }
  };

  useEffect(() => {
    if (initialReading !== undefined) {
      setInternalReading(initialReading);
      setInternalLoading(false);
    } else {
      fetchReading(effectiveSchoolId);
    }
  }, [initialReading, effectiveSchoolId]);

  const loading = externalLoading ?? internalLoading;
  const error = externalError ?? internalError;
  const reading = initialReading !== undefined ? initialReading : internalReading;

  // Explicit error state
  if (error) {
    return (
      <div
        className="glass rounded-2xl p-6 w-full flex flex-col items-center justify-center min-h-[260px] border border-red-500/30 bg-red-950/10 text-center"
        data-testid="aqi-gauge-error"
      >
        <div className="p-3 bg-red-500/20 text-red-400 rounded-full mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-200 mb-1">
          {t("aqi.errorTitle")}
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mb-4">
          {error}
        </p>
        <button
          onClick={() => {
            if (onRetry) onRetry();
            else if (schoolId) fetchReading(schoolId);
          }}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
        >
          {t("aqi.tryAgain")}
        </button>
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div
        className="clay-card p-6 sm:p-7 w-full flex flex-col items-center justify-center min-h-[280px] animate-pulse"
        data-testid="aqi-gauge-loading"
      >
        <div className="w-full flex items-center justify-between mb-6">
          <div className="h-6 w-32 bg-slate-200 rounded-lg"></div>
          <div className="h-5 w-16 bg-amber-100 rounded-full"></div>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-8 w-full justify-around">
          <div className="w-44 h-44 rounded-full bg-slate-200 shrink-0"></div>
          <div className="space-y-3 w-full max-w-xs">
            <div className="h-6 w-36 bg-slate-200 rounded-lg"></div>
            <div className="h-4 w-48 bg-slate-200 rounded"></div>
            <div className="h-3.5 w-40 bg-slate-200 rounded"></div>
            <div className="h-3.5 w-28 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  // Missing data state
  if (!reading) {
    return (
      <div
        className="clay-card p-6 w-full flex flex-col items-center justify-center min-h-[260px] text-center"
        data-testid="aqi-gauge-error"
      >
        <div className="p-3 bg-red-100 text-red-600 rounded-full mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-800 mb-1">
          {t("aqi.errorTitle")}
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mb-4">
          {t("aqi.errorEmpty")}
        </p>
        <button
          onClick={() => {
            if (onRetry) onRetry();
            else if (schoolId) fetchReading(schoolId);
          }}
          className="clay-button px-4 py-2 text-xs font-semibold text-slate-700"
        >
          {t("aqi.tryAgain")}
        </button>
      </div>
    );
  }

  const { aqi, pm25, pm10, category, source, recorded_at } = reading;
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.unhealthy;

  // Guidance helper based on category
  const getGuidanceText = () => {
    switch (category) {
      case "good":
        return language === "hi" ? "बाहरी गतिविधियाँ सुरक्षित हैं" : "Air quality is ideal for outdoor activities";
      case "moderate":
        return language === "hi" ? "संवेदनशील छात्र सावधानी बरतें" : "Sensitive individuals should take precautions";
      case "unhealthy_sensitive":
        return language === "hi" ? "बाहरी समय कम करें" : "Limit strenuous outdoor exercise";
      case "unhealthy":
        return language === "hi" ? "बाहरी समय सीमित करें" : "Limit outdoor time";
      case "very_unhealthy":
        return language === "hi" ? "सभी बाहरी खेल बंद रखें" : "Avoid all outdoor physical exertion";
      case "hazardous":
        return language === "hi" ? "घर के अंदर ही रहें" : "Remain indoors with clean air filtration";
      default:
        return language === "hi" ? "बाहरी समय सीमित करें" : "Limit outdoor time";
    }
  };

  // Ring border color helper
  const getRingColor = () => {
    switch (category) {
      case "good":
        return "border-emerald-500 text-emerald-700";
      case "moderate":
        return "border-amber-500 text-amber-700";
      case "unhealthy_sensitive":
        return "border-orange-500 text-orange-700";
      case "unhealthy":
        return "border-amber-600 text-amber-800";
      case "very_unhealthy":
        return "border-purple-500 text-purple-700";
      case "hazardous":
        return "border-rose-600 text-rose-800";
      default:
        return "border-amber-500 text-amber-700";
    }
  };

  const ringStyles = getRingColor();
  const displayPM25 = pm25 !== undefined ? Math.round(pm25) : Math.round(aqi * 0.55);

  return (
    <div
      className="clay-card p-6 sm:p-7 w-full flex flex-col justify-between relative overflow-hidden"
      data-testid="aqi-gauge"
    >
      {/* Header row: Icon badge + Title + Subtitle + SAMPLE badge */}
      <div className="w-full flex items-center justify-between mb-8 pb-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200/80 flex items-center justify-center text-amber-700 shadow-xs shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              {language === "hi" ? "वर्तमान वायु गुणवत्ता" : "Air right now"}
            </h2>
            <p className="text-sm text-slate-400 font-medium mt-0.5">
              {language === "hi" ? "रीयल-टाइम स्थानीय वायु संवेदक" : "Real-time school monitor measurement"}
            </p>
          </div>
        </div>
        <span className="sample-badge text-xs px-3 py-1">
          SAMPLE
        </span>
      </div>

      {/* Main body: Circular clay disc + Status details column */}
      <div className="flex flex-row items-center gap-8 sm:gap-14 my-auto py-3">
        {/* Left: Tactile Clay Circle Gauge Disc */}
        <div className="relative group shrink-0">
          <div className="clay-circle-gauge w-40 h-40 sm:w-44 sm:h-44 flex flex-col items-center justify-center p-4 text-center transition-transform duration-300 group-hover:scale-[1.02]">
            {/* PM2.5 value matching reference "92" */}
            <span
              className="text-5xl sm:text-6xl font-black tracking-tight leading-none font-sans"
              style={{ color: colors.stroke === "#22c55e" ? "#15803d" : colors.stroke === "#eab308" ? "#b45309" : "#92400e" }}
            >
              {displayPM25}
            </span>
            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400 mt-1 uppercase tracking-wider">
              PM2.5 µg/m³
            </span>
          </div>
        </div>

        {/* Right: Status column */}
        <div className="flex flex-col items-start text-left space-y-1 flex-1">
          {/* Category line with hollow ring dot: ○ Poor, AQI 172 */}
          <div className="flex items-center gap-2">
            <span
              className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${ringStyles.split(" ")[0]}`}
            />
            <span className="text-base sm:text-lg font-bold text-amber-800">
              {getLocalizedCategoryLabel(category, language)}, {t("aqi.index")} {aqi}
            </span>
          </div>

          {/* Action / Guidance text: Limit outdoor time */}
          <p className="text-base font-medium text-slate-600 leading-snug mt-1">
            {getGuidanceText()}
          </p>

          {/* Station / location */}
          <p className="text-sm text-slate-400 pt-1">
            {source || "Rohini (sample station)"}
          </p>

          {/* Updated timestamp */}
          <p className="text-sm text-slate-400">
            {language === "hi" ? "अपडेट किया गया" : "Updated"}{" "}
            {formatTime(recorded_at, language === "hi" ? "hi-IN" : "en-IN")} IST
          </p>
        </div>
      </div>

      {/* Screen-reader sensor details */}
      <div className="sr-only">
        <span>{t("aqi.pm25")}: {formatPM25(pm25)}</span>
        {pm10 !== undefined && <span>{t("aqi.pm10")}: {formatPM10(pm10)}</span>}
        <span>{formatDate(recorded_at)} ({formatRelativeTime(recorded_at, language)})</span>
      </div>
    </div>
  );
}
export default AqiGauge;
