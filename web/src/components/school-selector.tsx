"use client";

import React, { useEffect, useState } from "react";
import type { School } from "@/types/api";
import { getSchools } from "@/lib/api-client";

export interface SchoolSelectorProps {
  schools?: School[];
  selectedSchoolId?: string;
  onSelectSchool?: (school: School) => void;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function SchoolSelector({
  schools: initialSchools,
  selectedSchoolId,
  onSelectSchool,
  isLoading: externalLoading,
  error: externalError,
  onRetry,
}: SchoolSelectorProps) {
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
        className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-red-200 flex items-center justify-between"
        data-testid="school-selector-error"
      >
        <div className="flex items-center gap-3">
          <svg
            className="w-5 h-5 text-red-400 shrink-0"
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
            <p className="text-sm font-medium">Unable to load schools</p>
            <p className="text-xs text-red-300/80">{error}</p>
          </div>
        </div>
        <button
          onClick={onRetry ?? fetchSchools}
          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 text-red-100 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="glass rounded-xl p-4 w-full animate-pulse" data-testid="school-selector-loading">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-28 bg-slate-700/60 rounded"></div>
            <div className="h-6 w-56 bg-slate-700/80 rounded"></div>
          </div>
          <div className="h-9 w-32 bg-slate-700/60 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="glass rounded-xl p-4 w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      data-testid="school-selector"
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        </div>
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Selected School
          </span>
          <h2 className="text-lg font-semibold text-slate-100">
            {currentSchool?.name || "Select a school"}
          </h2>
          {currentSchool?.address && (
            <p className="text-xs text-slate-400 mt-0.5">
              {currentSchool.address}
              {currentSchool.district ? ` • ${currentSchool.district}` : ""}
            </p>
          )}
        </div>
      </div>

      <div className="relative min-w-[200px]">
        <label htmlFor="school-select" className="sr-only">
          Select School
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
          className="w-full appearance-none bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 focus:border-blue-500/80 rounded-lg px-3.5 py-2 pr-9 text-sm text-slate-200 outline-none transition-colors cursor-pointer"
        >
          {schools.map((school) => (
            <option
              key={school.id}
              value={school.id}
              className="bg-slate-900 text-slate-200 py-1"
            >
              {school.name} {school.district ? `(${school.district})` : ""}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
export default SchoolSelector;
