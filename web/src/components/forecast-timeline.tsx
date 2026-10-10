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

export interface ForecastTimelineProps {
  forecast?: ForecastPoint[];
  schoolId?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const CATEGORY_COLORS: Record<AqiCategory, { color: string; bg: string; text: string }> = {
  good: { color: "#22c55e", bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80" },
  moderate: { color: "#eab308", bg: "rgba(234, 179, 8, 0.15)", text: "#facc15" },
  unhealthy_sensitive: { color: "#f97316", bg: "rgba(249, 115, 22, 0.15)", text: "#fb923c" },
  unhealthy: { color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)", text: "#f87171" },
  very_unhealthy: { color: "#a855f7", bg: "rgba(168, 85, 247, 0.15)", text: "#c084fc" },
  hazardous: { color: "#7f1d1d", bg: "rgba(127, 29, 29, 0.25)", text: "#fca5a5" },
};

export function ForecastTimeline({
  forecast: initialForecast,
  schoolId,
  isLoading: externalLoading,
  error: externalError,
  onRetry,
}: ForecastTimelineProps) {
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
        className="glass rounded-2xl p-6 w-full border border-red-500/30 bg-red-950/10 text-center"
        data-testid="forecast-timeline-error"
        role="alert"
        aria-live="polite"
      >
        <div className="p-3 bg-red-500/20 text-red-400 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
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
          Forecast Data Unavailable
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">{error}</p>
        <button
          onClick={() => {
            if (onRetry) onRetry();
            else fetchForecast(effectiveSchoolId);
          }}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div
        className="glass rounded-2xl p-6 w-full animate-pulse"
        data-testid="forecast-timeline-loading"
        aria-busy="true"
        aria-label="Loading forecast timeline"
      >
        <div className="flex justify-between items-center mb-6">
          <div className="h-6 w-48 bg-slate-700/60 rounded"></div>
          <div className="h-4 w-32 bg-slate-700/40 rounded"></div>
        </div>
        <div className="h-44 w-full bg-slate-800/40 rounded-xl mb-6"></div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 w-20 bg-slate-800/50 rounded-xl shrink-0"></div>
          ))}
        </div>
      </div>
    );
  }

  // Missing data state
  if (!forecast || forecast.length === 0) {
    return (
      <div
        className="glass rounded-2xl p-6 w-full text-center text-slate-400"
        data-testid="forecast-timeline-error"
        role="alert"
      >
        <p className="text-sm">No forecast points found for this location.</p>
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

  // Safe vs Restricted Threshold Y coordinate (AQI 100)
  const thresholdY =
    paddingY + effectiveH - ((100 - minAqi) / (maxAqi - minAqi)) * effectiveH;

  // SVG Area path for curve
  const linePath = points.reduce((acc, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, "");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${
    chartHeight - paddingY
  } L ${points[0].x} ${chartHeight - paddingY} Z`;

  return (
    <section
      className="glass rounded-2xl p-6 w-full relative overflow-hidden"
      data-testid="forecast-timeline"
      aria-label="24-Hour Air Quality Forecast"
    >
      {/* Header with Title & Band Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>24-Hour Forecast</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
              Hourly Protocol Bands
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Safe vs Restricted window forecast for scheduled outdoor activities
          </p>
        </div>

        {/* Legend */}
        <div
          className="flex items-center gap-3 text-xs"
          role="region"
          aria-label="Forecast Band Legend"
        >
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
            <span>Safe (AQI ≤ 100)</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50"></span>
            <span>Restricted (&gt; 100)</span>
          </div>
        </div>
      </div>

      {/* Selected Hour Insight Card */}
      <div
        className="bg-slate-900/70 border border-white/5 rounded-xl p-3.5 mb-5 flex flex-wrap items-center justify-between gap-3"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm"
            style={{
              backgroundColor: CATEGORY_COLORS[activePoint.category]?.bg,
              color: CATEGORY_COLORS[activePoint.category]?.text,
              border: `1px solid ${CATEGORY_COLORS[activePoint.category]?.color}40`,
            }}
          >
            {activePoint.aqi}
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200">
              {formatDate(activePoint.hour)}, {formatTime(activePoint.hour)}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
              <span>
                Category:{" "}
                <strong style={{ color: CATEGORY_COLORS[activePoint.category]?.text }}>
                  {aqiCategoryLabel(activePoint.category)}
                </strong>
              </span>
              <span>•</span>
              <span>
                PM2.5:{" "}
                <strong className="text-slate-200 font-mono">
                  {formatPM25(activePoint.pm25)}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <div>
          {activePoint.aqi <= 100 ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Safe Outdoor Band
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Restricted Activity Band
            </span>
          )}
        </div>
      </div>

      {/* SVG Timeline Chart with Safe & Restricted Bands */}
      <div className="relative w-full overflow-hidden bg-slate-950/40 rounded-xl border border-white/5 p-2 mb-5">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-40 sm:h-48 overflow-visible"
          role="img"
          aria-label="AQI 24-hour forecast trend line chart"
        >
          <defs>
            <linearGradient id={`${chartId}-area-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.45" />
              <stop offset="50%" stopColor="#eab308" stopOpacity="0.25" />
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

          {/* Restricted Band Zone (Above threshold AQI 100) */}
          <rect
            x={paddingX}
            y={paddingY}
            width={effectiveW}
            height={Math.max(thresholdY - paddingY, 0)}
            fill="rgba(239, 68, 68, 0.05)"
          />

          {/* Safe Band Zone (Below threshold AQI 100) */}
          <rect
            x={paddingX}
            y={thresholdY}
            width={effectiveW}
            height={Math.max(chartHeight - paddingY - thresholdY, 0)}
            fill="rgba(34, 197, 94, 0.04)"
          />

          {/* Threshold Line at AQI 100 */}
          <line
            x1={paddingX}
            y1={thresholdY}
            x2={chartWidth - paddingX}
            y2={thresholdY}
            stroke="#eab308"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity="0.75"
          />
          <text
            x={chartWidth - paddingX}
            y={thresholdY - 4}
            textAnchor="end"
            fill="#eab308"
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setActiveHourIndex(i);
                  }
                }}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isActive ? 6 : 3.5}
                  fill={categoryCol}
                  stroke="#0f172a"
                  strokeWidth={isActive ? 3 : 1.5}
                  className="transition-all"
                />
                {isActive && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={10}
                    fill="none"
                    stroke={categoryCol}
                    strokeWidth="1.5"
                    opacity="0.6"
                    className="animate-ping"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Horizontal Hourly Timeline Cards Strip (Mobile touch-scroll & Desktop responsive) */}
      <div className="w-full">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
          <span className="font-medium uppercase tracking-wider text-[11px]">
            Hourly Forecast Breakdown
          </span>
          <span className="text-[11px] text-slate-500 sm:hidden">
            ← Scroll horizontally →
          </span>
        </div>

        <div
          className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent snap-x"
          role="list"
          aria-label="24 hourly forecasts"
        >
          {forecast.map((pt, idx) => {
            const isActive = idx === activeHourIndex;
            const cat = CATEGORY_COLORS[pt.category] || CATEGORY_COLORS.moderate;
            const isSafe = pt.aqi <= 100;

            return (
              <button
                key={pt.hour}
                type="button"
                onClick={() => setActiveHourIndex(idx)}
                role="listitem"
                aria-selected={isActive}
                aria-label={`${formatHour(pt.hour)} forecast: AQI ${pt.aqi}, ${aqiCategoryLabel(
                  pt.category
                )}, ${isSafe ? "Safe band" : "Restricted band"}`}
                className={`snap-start shrink-0 min-w-[76px] rounded-xl p-2.5 flex flex-col items-center justify-between text-center transition-all border outline-none ${
                  isActive
                    ? "bg-slate-800/95 border-blue-500/80 shadow-md shadow-blue-500/20 scale-[1.03]"
                    : "bg-slate-900/60 border-white/5 hover:border-slate-700 hover:bg-slate-800/60"
                }`}
              >
                {/* Hour */}
                <span className="text-[11px] font-semibold text-slate-300">
                  {formatHour(pt.hour)}
                </span>

                {/* AQI Badge */}
                <div
                  className="w-10 h-7 rounded-md my-1.5 flex items-center justify-center text-xs font-bold font-mono"
                  style={{
                    backgroundColor: cat.bg,
                    color: cat.text,
                    border: `1px solid ${cat.color}40`,
                  }}
                >
                  {pt.aqi}
                </div>

                {/* Safe vs Restricted Indicator */}
                <span
                  className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                    isSafe
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-rose-500/20 text-rose-300"
                  }`}
                >
                  {isSafe ? "Safe" : "Restricted"}
                </span>

                {/* PM2.5 */}
                <span className="text-[10px] text-slate-400 mt-1 font-mono">
                  {pt.pm25.toFixed(0)} <span className="text-[8px] text-slate-500">µg</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default ForecastTimeline;
