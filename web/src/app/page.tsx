import React from "react";
import { getSchools, getAirQuality } from "@/lib/api-client";
import { DashboardClient } from "@/components/dashboard-client";

export default async function Home() {
  const schoolsData = await getSchools();
  const initialAirQuality = await getAirQuality(schoolsData.schools[0].id);

  return (
    <main className="min-h-dvh p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <header className="flex flex-col gap-1">
        <h1 className="gradient-text text-3xl font-extrabold tracking-tight">
          Bad Air Day Protocol
        </h1>
        <p className="text-slate-400 text-sm">
          Real-time school air quality monitoring & activity safety protocol
        </p>
      </header>

      <DashboardClient
        initialSchools={schoolsData.schools}
        initialReading={initialAirQuality.current}
        initialForecast={initialAirQuality.forecast}
      />
    </main>
  );
}
