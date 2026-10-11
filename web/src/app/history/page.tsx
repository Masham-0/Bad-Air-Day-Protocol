import React from "react";
import { Header } from "@/components/header";

export default function HistoryPage() {
  return (
    <main className="min-h-dvh p-6 md:p-10 max-w-4xl mx-auto space-y-6">
      <Header />
      <div className="glass rounded-2xl p-6">
        <h2 className="text-xl font-bold text-slate-100">History</h2>
      </div>
    </main>
  );
}
