import React from "react";
import { Header } from "@/components/header";
import { HistoryClient } from "@/components/history-client";
import { getSchools } from "@/lib/api-client";

export const metadata = {
  title: "Historical Trends & Archive — Bad Air Day Protocol",
  description:
    "7-day historical school air quality trends and protocol safety decision archive.",
};

export default async function HistoryPage() {
  const schoolsData = await getSchools();

  return (
    <main className="min-h-dvh p-4 sm:p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <Header />
      <HistoryClient initialSchools={schoolsData.schools} />
    </main>
  );
}
