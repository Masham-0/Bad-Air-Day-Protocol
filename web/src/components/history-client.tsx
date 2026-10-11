"use client";

import React, { useState } from "react";
import { SchoolSelector } from "@/components/school-selector";
import type { School, ProtocolStatus, AqiCategory } from "@/types/api";
import { useTranslation } from "@/lib/i18n";
import {
  aqiCategoryLabel,
  protocolStatusLabel,
  formatAQI,
} from "@/lib/formatters";

interface HistoryRecord {
  date: string;
  dayLabel: string;
  avgAqi: number;
  category: AqiCategory;
  status: ProtocolStatus;
  primaryAction: string;
  pollutant: string;
}

const HISTORICAL_DATA: Record<string, HistoryRecord[]> = {
  sch_anand_vihar_01: [
    {
      date: "2026-10-10",
      dayLabel: "Yesterday",
      avgAqi: 156,
      category: "unhealthy",
      status: "restricted",
      primaryAction: "Outdoor sports cancelled; assembly moved indoors",
      pollutant: "PM2.5 (65.3 µg/m³)",
    },
    {
      date: "2026-10-09",
      dayLabel: "Fri",
      avgAqi: 142,
      category: "unhealthy_sensitive",
      status: "caution",
      primaryAction: "Sensitive students sheltered indoors; reduced PE duration",
      pollutant: "PM2.5 (54.1 µg/m³)",
    },
    {
      date: "2026-10-08",
      dayLabel: "Thu",
      avgAqi: 118,
      category: "unhealthy_sensitive",
      status: "caution",
      primaryAction: "Recess permitted with cautionary monitoring",
      pollutant: "PM2.5 (43.2 µg/m³)",
    },
    {
      date: "2026-10-07",
      dayLabel: "Wed",
      avgAqi: 88,
      category: "moderate",
      status: "all_clear",
      primaryAction: "All normal outdoor classes and sports permitted",
      pollutant: "PM10 (78.0 µg/m³)",
    },
    {
      date: "2026-10-06",
      dayLabel: "Tue",
      avgAqi: 74,
      category: "moderate",
      status: "all_clear",
      primaryAction: "Standard schedule active without restrictions",
      pollutant: "PM2.5 (24.0 µg/m³)",
    },
    {
      date: "2026-10-05",
      dayLabel: "Mon",
      avgAqi: 168,
      category: "unhealthy",
      status: "restricted",
      primaryAction: "Assembly indoors; all strenuous sports suspended",
      pollutant: "PM2.5 (72.5 µg/m³)",
    },
    {
      date: "2026-10-04",
      dayLabel: "Sun",
      avgAqi: 185,
      category: "unhealthy",
      status: "restricted",
      primaryAction: "Weekend school facility access closed",
      pollutant: "PM2.5 (81.0 µg/m³)",
    },
  ],
  sch_dwarka_02: [
    {
      date: "2026-10-10",
      dayLabel: "Yesterday",
      avgAqi: 122,
      category: "unhealthy_sensitive",
      status: "caution",
      primaryAction: "Outdoor activities limited to 30 minutes",
      pollutant: "PM2.5 (45.2 µg/m³)",
    },
    {
      date: "2026-10-09",
      dayLabel: "Fri",
      avgAqi: 105,
      category: "unhealthy_sensitive",
      status: "caution",
      primaryAction: "Sports practice shifted to indoor courts",
      pollutant: "PM2.5 (38.0 µg/m³)",
    },
    {
      date: "2026-10-08",
      dayLabel: "Thu",
      avgAqi: 82,
      category: "moderate",
      status: "all_clear",
      primaryAction: "Standard outdoor activities permitted",
      pollutant: "PM10 (65.0 µg/m³)",
    },
    {
      date: "2026-10-07",
      dayLabel: "Wed",
      avgAqi: 68,
      category: "moderate",
      status: "all_clear",
      primaryAction: "Full clear conditions for all grade levels",
      pollutant: "PM2.5 (21.5 µg/m³)",
    },
    {
      date: "2026-10-06",
      dayLabel: "Tue",
      avgAqi: 75,
      category: "moderate",
      status: "all_clear",
      primaryAction: "Normal school outdoor schedule active",
      pollutant: "PM10 (58.0 µg/m³)",
    },
    {
      date: "2026-10-05",
      dayLabel: "Mon",
      avgAqi: 135,
      category: "unhealthy_sensitive",
      status: "caution",
      primaryAction: "Assembly held with mask recommendations",
      pollutant: "PM2.5 (49.0 µg/m³)",
    },
    {
      date: "2026-10-04",
      dayLabel: "Sun",
      avgAqi: 148,
      category: "unhealthy_sensitive",
      status: "caution",
      primaryAction: "Weekend activities restricted",
      pollutant: "PM2.5 (56.0 µg/m³)",
    },
  ],
  sch_rohini_03: [
    {
      date: "2026-10-10",
      dayLabel: "Yesterday",
      avgAqi: 175,
      category: "unhealthy",
      status: "restricted",
      primaryAction: "Station feeds offline; standard fallback restricted mode",
      pollutant: "PM2.5 (78.0 µg/m³)",
    },
    {
      date: "2026-10-09",
      dayLabel: "Fri",
      avgAqi: 160,
      category: "unhealthy",
      status: "restricted",
      primaryAction: "Outdoor sports prohibited; air purifiers enabled",
      pollutant: "PM2.5 (68.4 µg/m³)",
    },
    {
      date: "2026-10-08",
      dayLabel: "Thu",
      avgAqi: 144,
      category: "unhealthy_sensitive",
      status: "caution",
      primaryAction: "Indoor assembly; PE drills conducted indoors",
      pollutant: "PM2.5 (56.1 µg/m³)",
    },
    {
      date: "2026-10-07",
      dayLabel: "Wed",
      avgAqi: 98,
      category: "moderate",
      status: "all_clear",
      primaryAction: "Brief outdoor recess permitted",
      pollutant: "PM10 (84.0 µg/m³)",
    },
    {
      date: "2026-10-06",
      dayLabel: "Tue",
      avgAqi: 85,
      category: "moderate",
      status: "all_clear",
      primaryAction: "Normal activity schedule",
      pollutant: "PM2.5 (28.0 µg/m³)",
    },
    {
      date: "2026-10-05",
      dayLabel: "Mon",
      avgAqi: 182,
      category: "unhealthy",
      status: "restricted",
      primaryAction: "High-exposure activities completely suspended",
      pollutant: "PM2.5 (82.0 µg/m³)",
    },
    {
      date: "2026-10-04",
      dayLabel: "Sun",
      avgAqi: 198,
      category: "unhealthy",
      status: "restricted",
      primaryAction: "Severe smoke dispersion; facility closed",
      pollutant: "PM2.5 (95.0 µg/m³)",
    },
  ],
};

const CATEGORY_BAR_COLORS: Record<AqiCategory, string> = {
  good: "#22c55e",
  moderate: "#eab308",
  unhealthy_sensitive: "#f97316",
  unhealthy: "#ef4444",
  very_unhealthy: "#a855f7",
  hazardous: "#7f1d1d",
};

export function HistoryClient({ initialSchools }: { initialSchools: School[] }) {
  const { t, language } = useTranslation();
  const [selectedSchool, setSelectedSchool] = useState<School>(initialSchools[0]);

  const historyRecords =
    HISTORICAL_DATA[selectedSchool?.id] ?? HISTORICAL_DATA.sch_anand_vihar_01;

  // Compute metrics
  const avgAqi = Math.round(
    historyRecords.reduce((acc, cur) => acc + cur.avgAqi, 0) / historyRecords.length
  );
  const peakAqi = Math.max(...historyRecords.map((r) => r.avgAqi));
  const restrictedDays = historyRecords.filter((r) => r.status === "restricted").length;
  const cleanDays = historyRecords.filter((r) => r.status === "all_clear").length;

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="clay-card p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <nav className="flex items-center gap-2 text-slate-600 font-semibold">
          <a
            href="/"
            className="hover:text-blue-600 transition-colors flex items-center gap-1.5 text-slate-500 hover:text-slate-800"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>{t("nav.backToDashboard") || "Back to Dashboard"}</span>
          </a>
          <span className="text-slate-300">•</span>
          <span className="text-slate-900 font-bold">
            {t("nav.history") || "Historical Trends"}
          </span>
        </nav>

        <div className="text-slate-500 text-xs">
          <span>{t("schoolSelector.selectedSchool") || "Selected"}: </span>
          <span className="text-slate-900 font-bold">{selectedSchool?.name}</span>
        </div>
      </div>

      {/* School Selector */}
      <section>
        <SchoolSelector
          schools={initialSchools}
          selectedSchoolId={selectedSchool?.id}
          onSelectSchool={setSelectedSchool}
        />
      </section>

      {/* Header Info Banner */}
      <div className="clay-card p-6 sm:p-7 space-y-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>{t("history.title") || "Historical Trends & Protocol Archive"}</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {t("history.subtitle") ||
              "Past 7-day record of school air quality and automated activity protocols"}
          </p>
        </div>

        {/* 4 Summary Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              {t("history.avgAqi") || "7-Day Avg AQI"}
            </span>
            <span className="text-2xl font-black text-slate-900">{avgAqi}</span>
          </div>

          <div className="p-4 rounded-2xl bg-rose-50/50 border border-rose-200/80 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-500 block mb-1">
              {t("history.peakAqi") || "Peak AQI"}
            </span>
            <span className="text-2xl font-black text-rose-700">{peakAqi}</span>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/80 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 block mb-1">
              {t("history.restrictedDays") || "Restricted Days"}
            </span>
            <span className="text-2xl font-black text-amber-700">{restrictedDays} / 7</span>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-200/80 shadow-xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 block mb-1">
              {t("history.cleanDays") || "All Clear Days"}
            </span>
            <span className="text-2xl font-black text-emerald-700">{cleanDays} / 7</span>
          </div>
        </div>

        {/* 7-Day Visual Bar Chart */}
        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
            7-Day AQI Progression
          </h3>
          <div className="grid grid-cols-7 gap-2 sm:gap-3 items-end h-36 pt-4 pb-1 px-3 bg-slate-50 rounded-2xl border border-slate-200/80">
            {historyRecords.map((item, idx) => {
              const heightPercent = Math.min(100, Math.max(20, (item.avgAqi / 220) * 100));
              const barColor = CATEGORY_BAR_COLORS[item.category] || "#3b82f6";
              return (
                <div key={idx} className="flex flex-col items-center h-full justify-end group">
                  <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-900 transition-colors mb-1 font-bold">
                    {item.avgAqi}
                  </span>
                  <div
                    className="w-full max-w-[28px] rounded-t-lg transition-all duration-300 group-hover:opacity-100 opacity-85 shadow-xs"
                    style={{
                      height: `${heightPercent}%`,
                      backgroundColor: barColor,
                    }}
                  />
                  <span className="text-[10px] font-semibold text-slate-500 mt-2 truncate w-full text-center">
                    {item.dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Protocol Decision Archive Table */}
      <div className="clay-card p-6 sm:p-7 overflow-hidden">
        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <span>{t("history.tableTitle") || "Daily Safety Decision Log"}</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 uppercase text-[10px] tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-bold">{t("history.date") || "Date"}</th>
                <th className="py-3 px-4 font-bold">{t("history.aqiCategory") || "AQI & Category"}</th>
                <th className="py-3 px-4 font-bold">{t("history.protocolStatus") || "Protocol Status"}</th>
                <th className="py-3 px-4 font-bold">{t("history.primaryAction") || "Primary Safety Action"}</th>
                <th className="py-3 px-4 font-bold">{t("history.pollutant") || "Primary Pollutant"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyRecords.map((record, index) => (
                <tr
                  key={index}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    <div>{record.date}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{record.dayLabel}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-bold text-slate-900 block">
                      {formatAQI(record.avgAqi)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {aqiCategoryLabel(record.category, language)}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 border border-slate-200 text-slate-700">
                      {protocolStatusLabel(record.status, language)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700 max-w-xs font-medium">
                    {record.primaryAction}
                  </td>
                  <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                    {record.pollutant}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default HistoryClient;
