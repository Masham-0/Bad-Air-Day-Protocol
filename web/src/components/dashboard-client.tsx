"use client";

import React, { useState, useTransition } from "react";
import { SchoolSelector } from "@/components/school-selector";
import { AqiGauge } from "@/components/aqi-gauge";
import { DailyProtocol } from "@/components/daily-protocol";
import { ForecastTimeline } from "@/components/forecast-timeline";
import { ActivityWindows } from "@/components/activity-windows";
import { ParentNotice } from "@/components/parent-notice";
import {
  getAirQuality,
  getProtocol,
  getParentNotices,
} from "@/lib/api-client";
import type {
  School,
  AirQualityReading,
  ForecastPoint,
  ProtocolResponse,
  Notice,
} from "@/types/api";

interface DashboardClientProps {
  initialSchools: School[];
  initialReading: AirQualityReading;
  initialForecast: ForecastPoint[];
  initialProtocol: ProtocolResponse;
  initialNotices: Notice[];
  isMockMode: boolean;
}

export function DashboardClient({
  initialSchools,
  initialReading,
  initialForecast,
  initialProtocol,
  initialNotices,
  isMockMode,
}: DashboardClientProps) {
  const [selectedSchool, setSelectedSchool] = useState<School>(
    initialSchools[0]
  );
  const [reading, setReading] = useState<AirQualityReading | null>(
    initialReading
  );
  const [forecast, setForecast] = useState<ForecastPoint[] | undefined>(
    initialForecast
  );
  const [protocol, setProtocol] = useState<ProtocolResponse | null>(
    initialProtocol
  );
  const [notices, setNotices] = useState<Notice[] | undefined>(
    initialNotices
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleSelectSchool = async (school: School) => {
    setSelectedSchool(school);
    setIsLoading(true);
    setError(null);

    try {
      const [aqiRes, protoRes, noticesRes] = await Promise.all([
        getAirQuality(school.id),
        getProtocol(school.id),
        getParentNotices(school.id),
      ]);

      startTransition(() => {
        setReading(aqiRes.current);
        setForecast(aqiRes.forecast);
        setProtocol(protoRes);
        setNotices(noticesRes.notices);
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load school data"
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Mode Indicator & Quick Links */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-900/60 border border-white/5 rounded-xl px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Data Source:</span>
          {isMockMode ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              Mock Mode (contracts/examples)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Live API Connected
            </span>
          )}
        </div>

        <nav className="flex items-center gap-4 text-slate-300 font-medium">
          <a href="/" className="hover:text-blue-400 transition-colors text-blue-400">
            Dashboard
          </a>
          <span className="text-slate-700">•</span>
          <a href="/parent" className="hover:text-blue-400 transition-colors">
            Parent View
          </a>
          <span className="text-slate-700">•</span>
          <a href="/history" className="hover:text-blue-400 transition-colors">
            Historical Trends
          </a>
        </nav>
      </div>

      {/* Global Error Banner if school switch fails */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/30 text-red-200 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => handleSelectSchool(selectedSchool)}
            className="px-3 py-1 bg-red-600/30 hover:bg-red-600/50 rounded text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* 1. School Selector */}
      <section>
        <SchoolSelector
          schools={initialSchools}
          selectedSchoolId={selectedSchool?.id}
          onSelectSchool={handleSelectSchool}
        />
      </section>

      {/* 2. Top Grid: Current AQI Gauge + Daily Protocol Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <AqiGauge
          reading={reading}
          schoolId={selectedSchool?.id}
          isLoading={isLoading}
        />

        <DailyProtocol
          protocol={protocol}
          isLoading={isLoading}
          onRetry={() => handleSelectSchool(selectedSchool)}
        />
      </div>

      {/* 3. 24-Hour Forecast Timeline */}
      <section>
        <ForecastTimeline
          forecast={forecast}
          schoolId={selectedSchool?.id}
          isLoading={isLoading}
        />
      </section>

      {/* 4. Activity Decision Schedule Windows (Krishna slot) */}
      <section>
        <ActivityWindows
          activities={protocol?.activities}
          isLoading={isLoading}
        />
      </section>

      {/* 5. Parent Advisories Notice (Krishna slot) */}
      <section>
        <ParentNotice
          notices={notices}
          schoolName={selectedSchool?.name}
          isLoading={isLoading}
        />
      </section>
    </div>
  );
}

export default DashboardClient;
