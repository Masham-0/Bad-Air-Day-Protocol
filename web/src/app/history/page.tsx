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
    <main className="min-h-dvh py-8 px-4 sm:px-6 md:px-8 max-w-4xl mx-auto space-y-7">
      <Header />
      <HistoryClient initialSchools={schoolsData.schools} />
    </main>
  );
}
