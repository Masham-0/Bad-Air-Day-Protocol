import React from "react";
import {
  getSchools,
  getAirQuality,
  getProtocol,
  getParentNotices,
} from "@/lib/api-client";
import { DashboardClient } from "@/components/dashboard-client";
import { Header } from "@/components/header";

export default async function Home() {
  const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

  // Load initial data for the first school in parallel
  const schoolsData = await getSchools();
  const firstSchoolId = schoolsData.schools[0]?.id || "sch_anand_vihar_01";

  const [airQuality, protocol, noticesRes] = await Promise.all([
    getAirQuality(firstSchoolId),
    getProtocol(firstSchoolId),
    getParentNotices(firstSchoolId),
  ]);

  return (
    <main className="w-full min-h-dvh py-7 sm:py-8 px-4 sm:px-6 md:px-8 max-w-4xl mx-auto space-y-8 sm:space-y-10">
      <Header />

      {/* Main Dashboard Client */}
      <DashboardClient
        initialSchools={schoolsData.schools}
        initialReading={airQuality.current}
        initialForecast={airQuality.forecast}
        initialProtocol={protocol}
        initialNotices={noticesRes.notices}
        isMockMode={isMockMode}
      />
    </main>
  );
}
