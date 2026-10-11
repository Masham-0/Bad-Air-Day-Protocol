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
import { formatDate, formatTime } from "@/lib/formatters";
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
    <div className="space-y-12 sm:space-y-14">

      {/* Global Error Banner if school switch fails */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center justify-between shadow-sm">
          <span>{error}</span>
          <button
            onClick={() => handleSelectSchool(selectedSchool)}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-xl text-xs font-bold text-white shadow-sm"
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
          planDate={protocol?.date ? formatDate(protocol.date) : "Sunday, 11 October"}
          planTime={protocol?.generated_at ? formatTime(protocol.generated_at) : "6:00 am"}
        />
      </section>

      {/* 2. Air right now (Current AQI Gauge) */}
      <section>
        <AqiGauge
          reading={reading}
          schoolId={selectedSchool?.id}
          isLoading={isLoading}
        />
      </section>

      {/* 3. Next 24 hours (IST) (Forecast Timeline Scrubber) */}
      <section>
        <ForecastTimeline
          forecast={forecast}
          schoolId={selectedSchool?.id}
          isLoading={isLoading}
        />
      </section>

      {/* 4. Today's plan (Daily Safety Protocol) */}
      <section>
        <DailyProtocol
          protocol={protocol}
          isLoading={isLoading}
          onRetry={() => handleSelectSchool(selectedSchool)}
        />
      </section>

      {/* 5. Activity Schedule Decisions */}
      <section>
        <ActivityWindows
          activities={protocol?.activities}
          protocol={protocol}
          isLoading={isLoading}
        />
      </section>

      {/* 6. Parent Advisories Notice */}
      <section>
        <ParentNotice
          notices={notices}
          schoolName={selectedSchool?.name}
          date={protocol?.date}
          isLoading={isLoading}
        />
      </section>
    </div>
  );
}

export default DashboardClient;
