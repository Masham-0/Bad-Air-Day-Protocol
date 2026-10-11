"use client";

import React, { useState } from "react";
import type { Notice, NoticeSeverity } from "@/types/api";
import {
  formatDate,
  formatTime,
  noticeSeverityLabel,
} from "@/lib/formatters";
import { useTranslation } from "@/lib/i18n";

export interface ParentNoticeProps {
  notices?: Notice[];
  schoolName?: string;
  date?: string;
  isLoading?: boolean;
  error?: string | null;
  standalone?: boolean;
  className?: string;
}

const SEVERITY_STYLES: Record<
  NoticeSeverity,
  {
    bg: string;
    text: string;
    border: string;
    icon: string;
    printBorder: string;
    badgeBg: string;
  }
> = {
  info: {
    bg: "rgba(59, 130, 246, 0.12)",
    text: "#60a5fa",
    border: "rgba(59, 130, 246, 0.35)",
    icon: "ℹ",
    printBorder: "#2563eb",
    badgeBg: "rgba(59, 130, 246, 0.2)",
  },
  warning: {
    bg: "rgba(234, 179, 8, 0.12)",
    text: "#facc15",
    border: "rgba(234, 179, 8, 0.35)",
    icon: "⚠",
    printBorder: "#d97706",
    badgeBg: "rgba(234, 179, 8, 0.2)",
  },
  critical: {
    bg: "rgba(239, 68, 68, 0.15)",
    text: "#f87171",
    border: "rgba(239, 68, 68, 0.45)",
    icon: "🚨",
    printBorder: "#dc2626",
    badgeBg: "rgba(239, 68, 68, 0.25)",
  },
};

/**
 * Lightweight inline markdown renderer for notice body (bold and paragraphs)
 */
function renderMarkdown(text: string): React.ReactNode {
  const paragraphs = text.split("\n\n");
  return paragraphs.map((para, pIdx) => {
    const parts = para.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={pIdx} className="mb-3 last:mb-0 leading-loose text-sm sm:text-base text-slate-700 print:text-black font-medium">
        {parts.map((part, idx) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={idx} className="font-bold text-slate-900 print:text-black">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return part;
        })}
      </p>
    );
  });
}

type LangViewMode = "auto" | "en" | "hi" | "both";

export function ParentNotice({
  notices = [],
  schoolName,
  date,
  isLoading,
  error,
  standalone = false,
  className = "",
}: ParentNoticeProps) {
  const { t, language } = useTranslation();
  const [langView, setLangView] = useState<LangViewMode>("auto");
  const [copied, setCopied] = useState<boolean>(false);

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handleShare = async () => {
    if (typeof window === "undefined") return;

    const shareUrl = window.location.href;
    const shareTitle = `${schoolName ? `${schoolName} – ` : ""}${t("notice.title") || "Parent Notice"}`;
    const shareText = notices.length > 0
      ? `${notices[0].title}\n\n${notices[0].body}`
      : `${shareTitle} - Bad Air Day Protocol`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or unsupported; fallback to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareTitle}\n\n${shareText}\n\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard access error
    }
  };

  if (error) {
    return (
      <div
        className={`clay-card p-6 w-full text-center ${className}`}
        data-testid="parent-notice-error"
      >
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-100 text-red-600 mb-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-sm font-bold text-slate-800">
          {t("notice.title") || "Parent Notice"} - {t("common.error") || "Unavailable"}
        </p>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className={`clay-card p-6 sm:p-7 w-full animate-pulse ${className}`}
        data-testid="parent-notice-loading"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 w-44 bg-slate-200 rounded-lg"></div>
          <div className="h-7 w-28 bg-slate-200 rounded-lg"></div>
        </div>
        <div className="space-y-4">
          <div className="h-28 bg-slate-100 rounded-2xl"></div>
          <div className="h-24 bg-slate-100 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  return (
    <section
      className={`clay-card p-6 sm:p-7 w-full print:border-none print:shadow-none print:bg-white print:p-0 ${className}`}
      data-testid="parent-notice"
      aria-label="Parent Advisories"
    >
      {/* Printable Header (Visible only when printed) */}
      <div className="hidden print:block mb-6 pb-4 border-b-2 border-black">
        <h1 className="text-2xl font-bold text-black uppercase tracking-wide">
          Bad Air Day Protocol — {t("notice.officialAdvisory") || "Official Air Quality & Activity Advisory"}
        </h1>
        {schoolName && (
          <p className="text-sm font-semibold text-gray-800 mt-1">
            School: {schoolName}
          </p>
        )}
        {date && (
          <p className="text-xs text-gray-600">
            Advisory Date: {date}
          </p>
        )}
      </div>

      {/* Main UI Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7 pb-5 border-b border-slate-100 print:hidden">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="p-2 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 shadow-xs">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </span>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>{t("notice.title") || "Parent Notice"}</span>
                <span className="sample-badge">
                  {notices.length} {notices.length === 1 ? "Notice" : "Notices"}
                </span>
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {t("notice.subtitle") || "Important advisory for parents and guardians"}
                {schoolName ? ` • ${schoolName}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls: View modes, Print & Share buttons */}
        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          {/* Language display view mode */}
          <div
            role="group"
            aria-label="Notice Language View"
            data-testid="notice-lang-selector"
            className="inline-flex items-center p-1 bg-white border border-slate-200 rounded-2xl shadow-[0_4px_10px_rgba(15,23,42,0.05),inset_0_1px_2px_rgba(255,255,255,0.9)] text-xs"
          >
            <button
              type="button"
              onClick={() => setLangView("en")}
              aria-pressed={langView === "en"}
              className={`px-2.5 py-1 rounded-xl font-bold transition-all ${
                langView === "en"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLangView("hi")}
              aria-pressed={langView === "hi"}
              className={`px-2.5 py-1 rounded-xl font-bold transition-all ${
                langView === "hi"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              हिन्दी
            </button>
            <button
              type="button"
              onClick={() => setLangView("both")}
              aria-pressed={langView === "both"}
              className={`px-2.5 py-1 rounded-xl font-bold transition-all ${
                langView === "both"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
              title="View English and Hindi notices side by side"
            >
              {t("notice.bilingual") || "Both"}
            </button>
          </div>

          {/* Share Button */}
          <button
            type="button"
            data-testid="notice-share-button"
            onClick={handleShare}
            className="clay-button inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs"
          >
            <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span>{copied ? t("notice.copied") || "Copied!" : t("notice.share") || "Share"}</span>
          </button>

          {/* Print Button */}
          <button
            type="button"
            data-testid="notice-print-button"
            onClick={handlePrint}
            className="clay-button inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs"
          >
            <svg className="w-3.5 h-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>{t("notice.print") || "Print Notice"}</span>
          </button>

          {/* Standalone Link if in Dashboard */}
          {!standalone && (
            <a
              href="/parent"
              className="clay-button inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-blue-700 shadow-xs"
            >
              <span>{t("notice.openPortal") || "Open Parent Portal"}</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Notices List */}
      {notices.length === 0 ? (
        <div
          data-testid="parent-notice-empty"
          className="clay-card text-center py-12 px-4 print:border-black print:bg-white"
        >
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400 print:hidden">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-600 print:text-black">
            {t("notice.empty") || "No active notices for this school today."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {notices.map((notice, index) => {
            const style = SEVERITY_STYLES[notice.severity] || SEVERITY_STYLES.info;

            // Determine which languages to display
            const showEnglish =
              langView === "en" ||
              langView === "both" ||
              (langView === "auto" && language === "en");
            const showHindi =
              langView === "hi" ||
              langView === "both" ||
              (langView === "auto" && language === "hi");

            const hiTitle = notice.title_hi || notice.title;
            const hiBody = notice.body_hi || notice.body;

            return (
              <article
                key={notice.id || index}
                data-testid={`notice-card-${index}`}
                className="clay-card p-5 sm:p-6 transition-all duration-200 print:bg-white print:border-2 print:border-black print:shadow-none print:break-inside-avoid print:mb-4"
              >
                {/* Header: Severity Badge, Title & Timestamps */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                  <div className="flex items-start gap-2.5 flex-wrap flex-1">
                    <span
                      data-testid={`notice-severity-${notice.severity}`}
                      className="clay-pill inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-wider print:border print:border-black print:text-black print:bg-gray-100"
                    >
                      <span>{style.icon}</span>
                      <span className="text-slate-800">{noticeSeverityLabel(notice.severity, language)}</span>
                    </span>

                    <div className="flex-1 min-w-[200px]">
                      {/* Bilingual View: Both English and Hindi titles */}
                      {langView === "both" ? (
                        <div className="space-y-1">
                          <h3 className="text-lg font-bold text-slate-900 print:text-black">
                            {notice.title}
                          </h3>
                          <h4 className="text-base font-semibold text-slate-600 mt-1 print:text-gray-800">
                            {hiTitle}
                          </h4>
                        </div>
                      ) : showHindi ? (
                        <h3 className="text-lg font-bold text-slate-900 print:text-black">
                          {hiTitle}
                        </h3>
                      ) : (
                        <h3 className="text-lg font-bold text-slate-900 print:text-black">
                          {notice.title}
                        </h3>
                      )}
                    </div>
                  </div>

                  {/* Timestamp & Expiry */}
                  <div className="text-[11px] text-slate-500 print:text-gray-700 flex flex-col sm:items-end gap-0.5 shrink-0 bg-slate-50 print:bg-transparent px-3 py-1.5 rounded-xl border border-slate-200/80 print:border-none">
                    <span>
                      {t("notice.issuedAt") || "Issued"}:{" "}
                      <span className="text-slate-800 print:text-black font-semibold">
                        {formatDate(notice.issued_at)}, {formatTime(notice.issued_at)}
                      </span>
                    </span>
                    {notice.expires_at && (
                      <span className="text-slate-400 print:text-gray-600">
                        {t("notice.expiresAt") || "Valid until"}:{" "}
                        {formatDate(notice.expires_at)}, {formatTime(notice.expires_at)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Body Content */}
                <div className="mt-4 pt-4 border-t border-slate-100 print:border-gray-300">
                  {langView === "both" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 print:bg-white print:border-gray-200">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 print:text-black block mb-1">
                          English Notice
                        </span>
                        {renderMarkdown(notice.body)}
                      </div>
                      <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200/80 print:bg-white print:border-gray-200">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 print:text-black block mb-1">
                          हिन्दी सूचना
                        </span>
                        {renderMarkdown(hiBody)}
                      </div>
                    </div>
                  ) : showHindi ? (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 print:bg-white print:border-none print:p-0">
                      {renderMarkdown(hiBody)}
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 print:bg-white print:border-none print:p-0">
                      {renderMarkdown(notice.body)}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ParentNotice;
