"use client";

import React, { useEffect, useState } from "react";
import type { School } from "@/types/api";
import { getSchools } from "@/lib/api-client";
import { useTranslation } from "@/lib/i18n";

export interface SchoolSelectorProps {
  schools?: School[];
  selectedSchoolId?: string;
  onSelectSchool?: (school: School) => void;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  planDate?: string;
  planTime?: string;
}

export function SchoolSelector({
  schools: initialSchools,
  selectedSchoolId,
  onSelectSchool,
  isLoading: externalLoading,
  error: externalError,
  onRetry,
  planDate,
  planTime,
}: SchoolSelectorProps) {
  const { t } = useTranslation();
  const [internalSchools, setInternalSchools] = useState<School[]>([]);
  const [internalLoading, setInternalLoading] = useState<boolean>(
    !initialSchools
  );
  const [internalError, setInternalError] = useState<string | null>(null);

  const fetchSchools = async () => {
    try {
      setInternalLoading(true);
      setInternalError(null);
      const res = await getSchools();
      setInternalSchools(res.schools);
      if (res.schools.length > 0 && !selectedSchoolId && onSelectSchool) {
        onSelectSchool(res.schools[0]);
      }
    } catch (err: unknown) {
      setInternalError(
        err instanceof Error ? err.message : "Failed to load schools"
      );
    } finally {
      setInternalLoading(false);
    }
  };

  useEffect(() => {
    if (!initialSchools) {
      fetchSchools();
    } else {
      setInternalSchools(initialSchools);
      setInternalLoading(false);
    }
  }, [initialSchools]);

  const loading = externalLoading ?? internalLoading;
  const error = externalError ?? internalError;
  const schools = initialSchools ?? internalSchools;

  const currentSchool =
    schools.find((s) => s.id === selectedSchoolId) ?? schools[0];

  // Error state
  if (error) {
    return (
      <div
        className="clay-card p-4 text-red-700 bg-red-50/80 border border-red-200 flex items-center justify-between"
        data-testid="school-selector-error"
      >
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-red-500 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <p className="text-sm font-bold text-red-800">{t("schoolSelector.errorTitle")}</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        </div>
        <button
          onClick={onRetry ?? fetchSchools}
          className="clay-button px-3.5 py-1.5 text-xs font-bold text-red-700 bg-white"
        >
          {t("schoolSelector.retry")}
        </button>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="w-full pt-2 pb-1 animate-pulse space-y-2" data-testid="school-selector-loading">
        <div className="h-8 w-64 bg-slate-200 rounded-lg"></div>
        <div className="h-5 w-48 bg-slate-200 rounded"></div>
        <div className="h-4 w-56 bg-slate-200 rounded"></div>
      </div>
    );
  }

  return (
    <div
      className="w-full pt-2 pb-1"
      data-testid="school-selector"
    >
      {/* Page intro: compact title + subtitle */}
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-tight">
          {t("app.title") || "Bad Air Day Protocol"}
        </h1>
        <p className="text-sm text-slate-500 font-medium mt-1 leading-relaxed">
          {t("app.description") || "Real-time school air quality monitoring & activity safety protocol"}
        </p>
      </div>

      {/* Clay Pill Controls Row: School Selector + Plan Timestamp + SAMPLE badge */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Interactive School Selector Pill */}
        <div className="clay-pill px-3.5 py-1.5 flex items-center gap-2.5 bg-white border border-slate-200/90 shadow-[0_3px_8px_rgba(15,23,42,0.04),inset_0_1px_2px_rgba(255,255,255,0.95)] hover:border-slate-300 transition-all cursor-pointer">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <div className="relative inline-flex items-center">
            <label htmlFor="school-select" className="sr-only">
              {t("schoolSelector.selectLabel")}
            </label>
            <select
              id="school-select"
              value={currentSchool?.id || ""}
              onChange={(e) => {
                const chosen = schools.find((s) => s.id === e.target.value);
                if (chosen && onSelectSchool) {
                  onSelectSchool(chosen);
                }
              }}
              className="appearance-none bg-transparent pr-6 text-xs sm:text-sm font-bold text-slate-800 transition-colors cursor-pointer border-none focus:outline-none focus:ring-0"
            >
              {schools.map((school) => (
                <option
                  key={school.id}
                  value={school.id}
                  className="bg-white text-slate-800 py-1"
                >
                  {school.name}{school.district ? `, ${school.district}` : ""}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-0 flex items-center text-slate-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Date and Plan Generation Pill */}
        <div className="clay-pill px-3.5 py-1.5 flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 bg-white border border-slate-200/90 shadow-[0_3px_8px_rgba(15,23,42,0.04),inset_0_1px_2px_rgba(255,255,255,0.95)]">
          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {planDate || "Sunday, 11 October"}, plan made {planTime || "6:00 am"} IST
          </span>
        </div>

        {/* Glossy Sample Badge */}
        <span className="sample-badge text-xs px-3.5 py-1.5 shadow-xs">
          SAMPLE
        </span>
      </div>
    </div>

  );
}
export default SchoolSelector;
