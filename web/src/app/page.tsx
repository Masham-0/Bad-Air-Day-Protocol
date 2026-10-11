import React from "react";
import { getSchools, getAirQuality } from "@/lib/api-client";
import { DashboardClient } from "@/components/dashboard-client";
import { Header } from "@/components/header";

export default async function Home() {
  const schoolsData = await getSchools();
  const initialReading = await getAirQuality(schoolsData.schools[0].id);

  return (
    <main className="min-h-dvh p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <Header />

      <DashboardClient
        initialSchools={schoolsData.schools}
        initialReading={initialReading.current}
      />
    </main>
  );
}
