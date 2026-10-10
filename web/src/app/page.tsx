import React from "react";
import {
  getSchools,
  getAirQuality,
  getProtocol,
  getParentNotices,
} from "@/lib/api-client";
import { DashboardClient } from "@/components/dashboard-client";

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
      {/* Principal Dashboard Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div>
          <h1 className="gradient-text text-3xl sm:text-4xl font-extrabold tracking-tight">
            Bad Air Day Protocol
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            School Principal Dashboard — Real-time air quality & protocol decisions
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 border border-white/5 px-3 py-1.5 rounded-lg shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>System Active</span>
        </div>
      </header>

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
