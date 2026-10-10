"use client";

import React from "react";
import type { Notice, NoticeSeverity } from "@/types/api";
import { formatDate, formatTime, noticeSeverityLabel } from "@/lib/formatters";

export interface ParentNoticeProps {
  notices?: Notice[];
  schoolName?: string;
  isLoading?: boolean;
  error?: string | null;
}

const SEVERITY_STYLES: Record<
  NoticeSeverity,
  { bg: string; text: string; border: string; icon: string }
> = {
  info: {
    bg: "rgba(59, 130, 246, 0.12)",
    text: "#60a5fa",
    border: "rgba(59, 130, 246, 0.3)",
    icon: "ℹ",
  },
  warning: {
    bg: "rgba(234, 179, 8, 0.12)",
    text: "#facc15",
    border: "rgba(234, 179, 8, 0.3)",
    icon: "⚠",
  },
  critical: {
    bg: "rgba(239, 68, 68, 0.15)",
    text: "#f87171",
    border: "rgba(239, 68, 68, 0.4)",
    icon: "🚨",
  },
};

export function ParentNotice({
  notices,
  schoolName,
  isLoading,
  error,
}: ParentNoticeProps) {
  if (error) {
    return (
      <div
        className="glass rounded-2xl p-6 w-full text-center border border-red-500/30 bg-red-950/10"
        data-testid="parent-notice-error"
      >
        <p className="text-sm font-semibold text-red-300">
          Parent Notices Unavailable
        </p>
        <p className="text-xs text-red-200/70 mt-1">{error}</p>
      </div>
    );
  }

  if (isLoading || !notices) {
    return (
      <div
        className="glass rounded-2xl p-6 w-full animate-pulse"
        data-testid="parent-notice-loading"
      >
        <div className="h-6 w-40 bg-slate-700/60 rounded mb-4"></div>
        <div className="space-y-3">
          <div className="h-20 bg-slate-800/50 rounded-xl"></div>
          <div className="h-20 bg-slate-800/50 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <section
      className="glass rounded-2xl p-6 w-full"
      data-testid="parent-notice"
      aria-label="Parent Advisories"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>Parent Notices & Advisories</span>
            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
              {notices.length} Active Notice{notices.length !== 1 ? "s" : ""}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Important announcements regarding air quality for parents and guardians
            {schoolName ? ` of ${schoolName}` : ""}
          </p>
        </div>

        <a
          href="/parent"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors shrink-0"
        >
          <span>Open Parent Portal</span>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </a>
      </div>

      <div className="space-y-3">
        {notices.map((notice) => {
          const style = SEVERITY_STYLES[notice.severity] || SEVERITY_STYLES.info;
          return (
            <div
              key={notice.id}
              className="rounded-xl p-4 bg-slate-900/60 border transition-all"
              style={{ borderColor: style.border }}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor: style.bg,
                      color: style.text,
                    }}
                  >
                    <span>{style.icon}</span>
                    <span>{noticeSeverityLabel(notice.severity)}</span>
                  </span>
                  <h3 className="text-sm font-semibold text-slate-100">
                    {notice.title}
                  </h3>
                </div>
                <span className="text-[11px] text-slate-500 shrink-0">
                  {formatDate(notice.issued_at)}, {formatTime(notice.issued_at)}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line pl-1">
                {notice.body}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default ParentNotice;
