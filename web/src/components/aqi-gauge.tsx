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
          Air Quality Data Unavailable
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
          Try Again
        </button>
      </div>
    );
  }

  // Loading skeleton
  if (loading) {
    return (
      <div
        className="glass rounded-2xl p-6 w-full flex flex-col items-center justify-center min-h-[300px] animate-pulse"
        data-testid="aqi-gauge-loading"
      >
        <div className="w-48 h-28 bg-slate-700/50 rounded-t-full mb-4"></div>
        <div className="h-8 w-24 bg-slate-700/60 rounded mb-2"></div>
        <div className="h-5 w-36 bg-slate-700/40 rounded mb-4"></div>
        <div className="flex gap-4 w-full justify-center">
          <div className="h-12 w-28 bg-slate-700/40 rounded-lg"></div>
          <div className="h-12 w-28 bg-slate-700/40 rounded-lg"></div>
        </div>
      </div>
    );
  }

  // Missing data state
  if (!reading) {
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
          Air Quality Data Unavailable
        </h3>
        <p className="text-xs text-slate-400 max-w-sm mb-4">
          No air quality reading found for this location.
        </p>
        <button
          onClick={() => {
            if (onRetry) onRetry();
            else if (schoolId) fetchReading(schoolId);
          }}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { aqi, pm25, pm10, category, source, recorded_at } = reading;
  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS.unhealthy;

  // Arc calculations for SVG semi-circle gauge (radius 90, center 120, 110)
  // Max AQI considered is 500
  const normalizedAqi = Math.min(Math.max(aqi, 0), 500);
  const percentage = normalizedAqi / 500;
  // Arc angle from 180 deg (pi) to 0 deg (0) -> total length = pi * radius
  const radius = 80;
  const circumference = Math.PI * radius;
  const strokeDashoffset = circumference * (1 - percentage);

  return (
    <div
      className="glass rounded-2xl p-6 w-full flex flex-col items-center relative overflow-hidden"
      data-testid="aqi-gauge"
    >
      {/* Background radial highlight */}
      <div
        className="absolute top-0 inset-x-0 h-40 opacity-20 pointer-events-none blur-3xl"
        style={{ background: colors.stroke }}
      />

      <div className="w-full flex items-center justify-between text-xs text-slate-400 mb-2">
        <span className="font-semibold tracking-wider uppercase text-slate-400">
          Air Quality Index
        </span>
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
          style={{
            backgroundColor: colors.bg,
            color: colors.text,
            border: `1px solid ${colors.border}`,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: colors.stroke }}
          />
          {aqiCategoryLabel(category)}
        </div>
      </div>

      {/* SVG Semi-Circle Gauge */}
      <div className="relative w-64 h-36 flex items-end justify-center my-2">
        <svg
          viewBox="0 0 200 120"
          className="w-full h-full overflow-visible"
        >
          <defs>
            <linearGradient id="aqi-arc-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="20%" stopColor="#eab308" />
              <stop offset="40%" stopColor="#f97316" />
              <stop offset="60%" stopColor="#ef4444" />
              <stop offset="80%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#7f1d1d" />
            </linearGradient>
          </defs>

          {/* Background Track */}
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="16"
            strokeLinecap="round"
          />

          {/* Value Arc */}
          <path
            d="M 20 110 A 80 80 0 0 1 180 110"
            fill="none"
            stroke={colors.stroke}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: "stroke-dashoffset 0.8s ease-out, stroke 0.4s ease",
            }}
          />
        </svg>

        {/* Center AQI value */}
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center justify-center">
          <span
            className="text-5xl font-extrabold tracking-tight leading-none"
            style={{ color: colors.text }}
          >
            {aqi}
          </span>
          <span className="text-xs uppercase tracking-widest text-slate-400 mt-1">
            AQI Value
          </span>
        </div>
      </div>

      {/* Pollutant metrics sub-cards */}
      <div className="grid grid-cols-2 gap-3 w-full my-4">
        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-3 text-center">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">
            PM2.5 Concentration
          </span>
          <span className="text-base font-semibold text-slate-100">
            {formatPM25(pm25)}
          </span>
        </div>

        <div className="bg-slate-900/60 border border-white/5 rounded-xl p-3 text-center">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 block mb-0.5">
            PM10 Concentration
          </span>
          <span className="text-base font-semibold text-slate-100">
            {pm10 !== undefined ? formatPM10(pm10) : "N/A"}
          </span>
        </div>
      </div>

      {/* Visible Source & Timestamp */}
      <div className="w-full pt-3 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-1.5">
        <div className="flex items-center gap-1.5 truncate max-w-full">
          <svg
            className="w-3.5 h-3.5 text-blue-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
            />
          </svg>
          <span className="truncate">
            Source: <strong className="text-slate-300 font-medium">{source}</strong>
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <svg
            className="w-3.5 h-3.5 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            {formatDate(recorded_at)}, {formatTime(recorded_at)} (
            {formatRelativeTime(recorded_at)})
          </span>
        </div>
      </div>
    </div>
  );
}
export default AqiGauge;
