"use client";

import React, { useState } from "react";
import { SchoolSelector } from "@/components/school-selector";
import { AqiGauge } from "@/components/aqi-gauge";
import { ForecastTimeline } from "@/components/forecast-timeline";
import type { School, AirQualityReading, ForecastPoint } from "@/types/api";

interface DashboardClientProps {
  initialSchools: School[];
  initialReading: AirQualityReading;
  initialForecast?: ForecastPoint[];
}

export function DashboardClient({
  initialSchools,
  initialReading,
  initialForecast,
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

  return (
    <div className="space-y-6">
      {/* School Selector */}
      <section>
        <SchoolSelector
          schools={initialSchools}
          selectedSchoolId={selectedSchool?.id}
          onSelectSchool={(school) => {
            setSelectedSchool(school);
            setReading(null);
            setForecast(undefined);
          }}
        />
      </section>

      {/* AQI Gauge */}
      <section>
        <AqiGauge
          reading={reading}
          schoolId={selectedSchool?.id}
        />
      </section>

      {/* 24-Hour Forecast Timeline */}
      <section>
        <ForecastTimeline
          forecast={forecast}
          schoolId={selectedSchool?.id}
        />
      </section>
    </div>
  );
}
export default DashboardClient;
