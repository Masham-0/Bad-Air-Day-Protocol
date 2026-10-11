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
    <main className="min-h-dvh p-4 sm:p-6 md:p-10 max-w-6xl mx-auto space-y-6">
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
