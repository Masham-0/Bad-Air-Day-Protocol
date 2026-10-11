"use client";

import React, { useState, useTransition } from "react";
import { SchoolSelector } from "@/components/school-selector";
import { ParentNotice } from "@/components/parent-notice";
import { getParentNotices, getAirQuality } from "@/lib/api-client";
import type { School, Notice, AirQualityReading } from "@/types/api";
import { useTranslation } from "@/lib/i18n";
import { aqiCategoryLabel, formatAQI } from "@/lib/formatters";

interface ParentClientProps {
  initialSchools: School[];
  initialNotices: Notice[];
  initialReading: AirQualityReading;
}

export function ParentClient({
  initialSchools,
  initialNotices,
  initialReading,
}: ParentClientProps) {
  const { t, language } = useTranslation();
  const [selectedSchool, setSelectedSchool] = useState<School>(initialSchools[0]);
  const [notices, setNotices] = useState<Notice[]>(initialNotices);
  const [reading, setReading] = useState<AirQualityReading>(initialReading);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleSelectSchool = async (school: School) => {
    setSelectedSchool(school);
    setIsLoading(true);
    setError(null);

    try {
      const [noticesRes, aqiRes] = await Promise.all([
        getParentNotices(school.id),
        getAirQuality(school.id),
      ]);

      startTransition(() => {
        setNotices(noticesRes.notices);
        setReading(aqiRes.current);
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load school notices");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Navigation Bar */}
      <div className="clay-card p-4 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden">
        <nav className="flex items-center gap-2 text-slate-600 font-semibold">
          <a
            href="/"
            className="hover:text-blue-600 transition-colors flex items-center gap-1.5 text-slate-500 hover:text-slate-800"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>{t("nav.backToDashboard") || "Back to Dashboard"}</span>
          </a>
          <span className="text-slate-300">•</span>
          <span className="text-slate-900 font-bold">
            {t("nav.parent") || "Parent Notice Portal"}
          </span>
        </nav>

        <div className="flex items-center gap-2 text-slate-500">
          <span>{t("schoolSelector.selectedSchool") || "Selected"}:</span>
          <span className="text-slate-900 font-bold">{selectedSchool?.name}</span>
        </div>
      </div>

      {/* School Selector (Hidden in Print) */}
      <section className="print:hidden">
        <SchoolSelector
          schools={initialSchools}
          selectedSchoolId={selectedSchool?.id}
          onSelectSchool={handleSelectSchool}
        />
      </section>

      {/* Current AQI Quick Context Card for Parents */}
      <div className="clay-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:border-black print:bg-white print:p-3">
        <div className="flex items-center gap-3">
          <div className="clay-circle w-12 h-12 flex items-center justify-center text-amber-600 shrink-0 print:border-black print:text-black">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 print:text-black">
                {selectedSchool?.name}
              </h3>
              <span className="sample-badge print:text-black print:border-black">
                {formatAQI(reading.aqi)} • {aqiCategoryLabel(reading.category, language)}
              </span>
            </div>
            <p className="text-xs text-slate-500 print:text-gray-700 mt-0.5">
              PM2.5: {reading.pm25} µg/m³ • {reading.source}
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-600 print:text-gray-800 bg-slate-50 print:bg-transparent px-3 py-1.5 rounded-xl border border-slate-200/80 print:border-none self-start sm:self-auto">
          <span className="text-slate-400">{t("aqi.recordedAt") || "Recorded at"}: </span>
          <span className="font-semibold text-slate-800 print:text-black">
            {reading.recorded_at.replace("T", " ").substring(0, 16)}
          </span>
        </div>
      </div>

      {/* Main Standalone Parent Notice Component */}
      <ParentNotice
        notices={notices}
        schoolName={selectedSchool?.name}
        date={notices[0]?.issued_at ? notices[0].issued_at.split("T")[0] : undefined}
        isLoading={isLoading}
        error={error}
        standalone={true}
      />
    </div>
  );
}

export default ParentClient;
