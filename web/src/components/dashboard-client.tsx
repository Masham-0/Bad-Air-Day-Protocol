"use client";

import React, { useState } from "react";
import { SchoolSelector } from "@/components/school-selector";
import { AqiGauge } from "@/components/aqi-gauge";
import type { School, AirQualityReading } from "@/types/api";

interface DashboardClientProps {
  initialSchools: School[];
  initialReading: AirQualityReading;
}

export function DashboardClient({
  initialSchools,
  initialReading,
}: DashboardClientProps) {
  const [selectedSchool, setSelectedSchool] = useState<School>(
    initialSchools[0]
  );
  const [reading, setReading] = useState<AirQualityReading | null>(
    initialReading
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
            // reset reading to trigger gauge fetch for new school if needed
            setReading(null);
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
    </div>
  );
}
export default DashboardClient;
