"use client";

import React, { useEffect, useState, useId } from "react";
import type { ForecastPoint, AqiCategory } from "@/types/api";
import { getAirQuality } from "@/lib/api-client";
import {
  formatHour,
  formatTime,
  formatDate,
  formatPM25,
  formatAQI,
  aqiCategoryLabel,
} from "@/lib/formatters";
import { useTranslation } from "@/lib/i18n";

export interface ForecastTimelineProps {
  forecast?: ForecastPoint[];
  schoolId?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const CATEGORY_COLORS: Record<AqiCategory, { color: string; bg: string; text: string }> = {
  good: { color: "#22c55e", bg: "rgba(34, 197, 94, 0.12)", text: "#15803d" },
  moderate: { color: "#eab308", bg: "rgba(234, 179, 8, 0.12)", text: "#a16207" },
  unhealthy_sensitive: { color: "#f97316", bg: "rgba(249, 115, 22, 0.12)", text: "#c2410c" },
  unhealthy: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)", text: "#b91c1c" },
  very_unhealthy: { color: "#a855f7", bg: "rgba(168, 85, 247, 0.12)", text: "#7e22ce" },
  hazardous: { color: "#7f1d1d", bg: "rgba(127, 29, 29, 0.18)", text: "#991b1b" },
};

export function ForecastTimeline({
  forecast: initialForecast,
  schoolId,
  isLoading: externalLoading,
  error: externalError,
  onRetry,
}: ForecastTimelineProps) {
  const { t, language } = useTranslation();
  const chartId = useId();
  const effectiveSchoolId = schoolId || "sch_anand_vihar_01";
  const [internalForecast, setInternalForecast] = useState<ForecastPoint[]>(
    initialForecast ?? []
  );
  const [internalLoading, setInternalLoading] = useState<boolean>(
    initialForecast === undefined
  );
  const [internalError, setInternalError] = useState<string | null>(null);
  const [activeHourIndex, setActiveHourIndex] = useState<number>(0);
  const [showDetailedGraph, setShowDetailedGraph] = useState<boolean>(false);

  const fetchForecast = async (id: string) => {
    try {
      setInternalLoading(true);
      setInternalError(null);
      const res = await getAirQuality(id);
      setInternalForecast(res.forecast);
    } catch (err: unknown) {
      setInternalError(
        err instanceof Error ? err.message : "Failed to load forecast data"
      );
    } finally {
      setInternalLoading(false);
    }
  };

  useEffect(() => {
    if (initialForecast !== undefined) {
      setInternalForecast(initialForecast);
      setInternalLoading(false);
    } else {
      fetchForecast(effectiveSchoolId);
    }
  }, [initialForecast, effectiveSchoolId]);

  const loading = externalLoading ?? internalLoading;
  const error = externalError ?? internalError;
  const forecast = initialForecast !== undefined ? initialForecast : internalForecast;

  // Explicit error state
  if (error) {
    return (
      <div
        className="clay-card p-6 sm:p-7 w-full text-center"
        data-testid="forecast-timeline-error"
        role="alert"
        aria-live="polite"
      >
        <div className="p-3 bg-red-100 text-red-600 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
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
          {language === "hi" ? "पूर्वानुमान डेटा अनुपलब्ध" : "Forecast Data Unavailable"}
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">{error}</p>
        <button
          onClick={() => {
            if (onRetry) onRetry();
            else fetchForecast(effectiveSchoolId);
          }}
          className="clay-button px-4 py-2 text-xs font-semibold text-slate-700"
        >
          {t("common.retry") || "Try Again"}
        </button>
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div
        className="clay-card p-6 sm:p-7 w-full animate-pulse"
        data-testid="forecast-timeline-loading"
        aria-busy="true"
        aria-label="Loading forecast timeline"
      >
        <div className="flex justify-between items-center mb-6">
          <div className="h-6 w-48 bg-slate-200 rounded-lg"></div>
          <div className="h-5 w-16 bg-amber-100 rounded-full"></div>
        </div>
        <div className="clay-inset h-20 w-full mb-6"></div>
        <div className="h-4 w-60 bg-slate-200 rounded mb-4"></div>
      </div>
    );
  }

  // Missing data state
  if (!forecast || forecast.length === 0) {
    return (
      <div
        className="clay-card p-6 w-full text-center text-slate-500"
        data-testid="forecast-timeline-error"
        role="alert"
      >
        <p className="text-sm">
          {language === "hi" ? "इस स्थान के लिए कोई पूर्वानुमान बिंदु नहीं मिला।" : "No forecast points found for this location."}
        </p>
      </div>
    );
  }

  const activePoint = forecast[activeHourIndex] ?? forecast[0];
  const maxAqi = Math.max(...forecast.map((f) => f.aqi), 200);
  const minAqi = 0;
  const chartHeight = 160;
  const chartWidth = 720;
  const paddingX = 24;
  const paddingY = 24;
  const effectiveW = chartWidth - paddingX * 2;
  const effectiveH = chartHeight - paddingY * 2;

  // Convert points to SVG coordinates
  const points = forecast.map((pt, idx) => {
    const x = paddingX + (idx / (forecast.length - 1)) * effectiveW;
    const y =
      paddingY + effectiveH - ((pt.aqi - minAqi) / (maxAqi - minAqi)) * effectiveH;
    return { x, y, pt };
  });

  const thresholdY =
    paddingY + effectiveH - ((100 - minAqi) / (maxAqi - minAqi)) * effectiveH;

  const linePath = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, "");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${
    chartHeight - paddingY
  } L ${points[0].x} ${chartHeight - paddingY} Z`;

  // Scrubber percentage position (0% to 100%)
  const scrubberPercentage = (activeHourIndex / Math.max(forecast.length - 1, 1)) * 100;

  // Category ring dot styling for summary line
  const getPointRing = (point: ForecastPoint) => {
    if (point.pm25 <= 60 || point.aqi <= 75) {
      return {
        ringClass: "border-emerald-500 text-emerald-800",
        label: language === "hi" ? "अच्छा समय।" : "Good window.",
      };
    } else if (point.pm25 <= 120 || point.aqi <= 150) {
      return {
        ringClass: "border-amber-500 text-amber-800",
        label: language === "hi" ? "सावधानी बरतें।" : "Caution window.",
      };
    } else {
      return {
        ringClass: "border-rose-500 text-rose-800",
        label: language === "hi" ? "प्रतिबंधित गतिविधि।" : "Restricted window.",
      };
    }
  };

  const currentSummary = getPointRing(activePoint);

  return (
    <section
      className="clay-card p-6 sm:p-7 w-full relative overflow-hidden"
      data-testid="forecast-timeline"
      aria-label="24-Hour Air Quality Forecast"
    >
      {/* Header: Icon badge + Title + Subtitle + SAMPLE badge */}
      <div className="w-full flex items-center justify-between mb-8 pb-5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-700 shadow-xs shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
              {language === "hi" ? "अगले 24 घंटे (IST)" : "Next 24 hours (IST)"}
            </h2>
            <p className="text-sm text-slate-400 font-medium mt-0.5">
              {language === "hi" ? "प्रति घंटा वायु गुणवत्ता पूर्वानुमान" : "Hourly forecasted air quality levels"}
            </p>
          </div>
        </div>
        <span className="sample-badge text-xs px-3 py-1">
          SAMPLE
        </span>
      </div>

      {/* Recessed Clay Inset Scrubber Well */}
      <div
        className="clay-inset p-3 sm:p-4 my-3 relative flex items-center h-20 select-none cursor-pointer overflow-hidden"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, clickX / rect.width));
          const targetIndex = Math.round(ratio * (forecast.length - 1));
          setActiveHourIndex(targetIndex);
        }}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={forecast.length - 1}
        aria-valuenow={activeHourIndex}
        aria-valuetext={`${formatHour(activePoint.hour)}: PM2.5 ${Math.round(activePoint.pm25)}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            setActiveHourIndex((prev) => Math.min(prev + 1, forecast.length - 1));
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            setActiveHourIndex((prev) => Math.max(prev - 1, 0));
          }
        }}
      >
        {/* Track dots / indicators for all 24 hours */}
        <div className="absolute inset-x-6 sm:inset-x-8 flex items-center justify-between pointer-events-none">
          {forecast.map((pt, idx) => {
            const isSelected = idx === activeHourIndex;
            let dotColor = "bg-emerald-400";
            if (pt.pm25 > 120 || pt.aqi > 150) {
              dotColor = "bg-rose-400";
            } else if (pt.pm25 > 60 || pt.aqi > 75) {
              dotColor = "bg-amber-400";
            }

            return (
              <div
                key={pt.hour}
                className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full transition-all ${dotColor} ${
                  isSelected ? "scale-125 opacity-100 ring-2 ring-slate-800" : "opacity-60"
                }`}
              />
            );
          })}
        </div>

        {/* Tactile Scrubber Handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-8 sm:w-9 h-14 rounded-xl bg-white border-2 border-slate-700 shadow-md flex items-center justify-center transition-all duration-150 pointer-events-none"
          style={{
            left: `calc(1.5rem + (100% - 3rem - 2rem) * ${scrubberPercentage / 100})`,
          }}
        >
          {/* Handle center grip line */}
          <div className="w-1 h-5 rounded-full bg-slate-300"></div>
        </div>
      </div>

      {/* Time axis markers below the well (e.g. 7 am, 1 pm, 7 pm, 1 am) */}
      <div className="flex items-center justify-between text-xs font-medium text-slate-400 px-4 sm:px-6 mb-4 select-none">
        {forecast.length >= 4 ? (
          <>
            <span>{formatHour(forecast[0].hour)}</span>
            <span>{formatHour(forecast[Math.floor(forecast.length / 4)].hour)}</span>
            <span>{formatHour(forecast[Math.floor((forecast.length * 2) / 4)].hour)}</span>
            <span>{formatHour(forecast[Math.floor((forecast.length * 3) / 4)].hour)}</span>
          </>
        ) : (
          forecast.map((f) => <span key={f.hour}>{formatHour(f.hour)}</span>)
        )}
      </div>

      {/* Selected window summary line: ○ 11 pm: PM2.5 58. Good window. */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span
          className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${currentSummary.ringClass.split(" ")[0]}`}
        />
        <span className={`text-sm sm:text-base font-bold text-emerald-800`}>
          {formatHour(activePoint.hour)}: PM2.5 {Math.round(activePoint.pm25)}. {currentSummary.label}
        </span>
      </div>

      {/* Legend items line */}
      <div
        className="flex flex-wrap items-center gap-6 sm:gap-9 text-xs sm:text-sm font-medium text-slate-500 px-1 pt-1"
        role="region"
        aria-label="Forecast Band Legend"
      >
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500 shrink-0" />
          <span>{language === "hi" ? "60 या उससे कम" : "60 or below"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-500 shrink-0" />
          <span>{language === "hi" ? "61 से 120" : "61 to 120"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-rose-500 shrink-0" />
          <span>{language === "hi" ? "120 से अधिक" : "Above 120"}</span>
        </div>

        {/* Toggle button for detailed interactive graph */}
        <button
          type="button"
          onClick={() => setShowDetailedGraph((prev) => !prev)}
          className="clay-pill ml-auto px-2.5 py-0.5 text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition-colors"
        >
          {showDetailedGraph ? (language === "hi" ? "ग्राफ़ छिपाएं" : "Hide Graph") : (language === "hi" ? "विस्तृत ग्राफ़" : "Trend Graph")}
        </button>
      </div>

      {/* Detailed SVG Chart (Expands on demand for deep inspection) */}
      {showDetailedGraph && (
        <div className="mt-5 pt-4 border-t border-slate-100 transition-all duration-300">
          <div className="relative w-full overflow-hidden bg-slate-50 rounded-2xl border border-slate-200 p-3">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-40 sm:h-48 overflow-visible"
              role="img"
              aria-label="AQI 24-hour forecast trend line chart"
            >
              <defs>
                <linearGradient id={`${chartId}-area-grad`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
                  <stop offset="50%" stopColor="#eab308" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id={`${chartId}-line-grad`} x1="0" y1="0" x2="1" y2="0">
                  {points.map((p, i) => (
                    <stop
                      key={i}
                      offset={`${(i / (points.length - 1)) * 100}%`}
                      stopColor={CATEGORY_COLORS[p.pt.category]?.color || "#3b82f6"}
                    />
                  ))}
                </linearGradient>
              </defs>

              {/* Threshold Line at AQI 100 */}
              <line
                x1={paddingX}
                y1={thresholdY}
                x2={chartWidth - paddingX}
                y2={thresholdY}
                stroke="#eab308"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.85"
              />
              <text
                x={chartWidth - paddingX}
                y={thresholdY - 4}
                textAnchor="end"
                fill="#b45309"
                fontSize="10"
                fontWeight="bold"
                className="select-none"
              >
                Safe Threshold (AQI 100)
              </text>

              {/* Filled Area */}
              <path d={areaPath} fill={`url(#${chartId}-area-grad)`} />

              {/* Smooth Trend Line */}
              <path
                d={linePath}
                fill="none"
                stroke={`url(#${chartId}-line-grad)`}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data Points */}
              {points.map((p, i) => {
                const isActive = i === activeHourIndex;
                const categoryCol = CATEGORY_COLORS[p.pt.category]?.color || "#3b82f6";
                return (
                  <g
                    key={i}
                    className="cursor-pointer transition-transform"
                    onClick={() => setActiveHourIndex(i)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${formatHour(p.pt.hour)}: AQI ${p.pt.aqi}`}
                  >
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isActive ? 6 : 3.5}
                      fill={categoryCol}
                      stroke="#ffffff"
                      strokeWidth={isActive ? 3 : 1.5}
                      className="transition-all"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
    </section>
  );
}

export default ForecastTimeline;
