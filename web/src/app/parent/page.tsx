import React from "react";
import { Header } from "@/components/header";
import { ParentClient } from "@/components/parent-client";
import { getSchools, getParentNotices, getAirQuality } from "@/lib/api-client";

export const metadata = {
  title: "Parent Notice Portal — Bad Air Day Protocol",
  description:
    "Official parent notice and health advisories for school activity safety based on real-time air quality forecasts.",
};

export default async function ParentPage() {
  const schoolsData = await getSchools();
  const firstSchoolId = schoolsData.schools[0]?.id || "sch_anand_vihar_01";

  const [noticesRes, airQuality] = await Promise.all([
    getParentNotices(firstSchoolId),
    getAirQuality(firstSchoolId),
  ]);

  return (
    <main className="min-h-dvh py-8 px-4 sm:px-6 md:px-8 max-w-4xl mx-auto space-y-7 print:p-0 print:max-w-none">
      <div className="print:hidden">
        <Header />
      </div>

      <ParentClient
        initialSchools={schoolsData.schools}
        initialNotices={noticesRes.notices}
        initialReading={airQuality.current}
      />
    </main>
  );
}
