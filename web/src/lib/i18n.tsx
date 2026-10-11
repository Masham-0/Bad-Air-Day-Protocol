"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import enMessages from "@/messages/en.json";
import hiMessages from "@/messages/hi.json";
import type { AqiCategory, ProtocolStatus, NoticeSeverity } from "@/types/api";

export type Language = "en" | "hi";

export interface TranslationParams {
  [key: string]: string | number;
}

export interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (path: string, params?: TranslationParams) => string;
}

const STORAGE_KEY = "bad_air_day_language";
const DEFAULT_LANGUAGE: Language = "en";

const catalogs: Record<Language, Record<string, unknown>> = {
  en: enMessages,
  hi: hiMessages,
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Helper to resolve nested keys like "aqi.categories.good" from message object
 */
function resolvePath(obj: unknown, path: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return typeof current === "string" ? current : undefined;
}

export function LanguageProvider({
  children,
  defaultLanguage,
}: {
  children: React.ReactNode;
  defaultLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(
    defaultLanguage || DEFAULT_LANGUAGE
  );

  // Synchronize from localStorage upon client mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (saved && (saved === "en" || saved === "hi")) {
        setLanguageState(saved);
        document.documentElement.lang = saved;
      }
    } catch {
      // localStorage may be unavailable in some browser security sandboxes
    }
  }, []);

  const setLanguage = useCallback((newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
      document.documentElement.lang = newLang;
    } catch {
      // safe fallback
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "en" ? "hi" : "en");
  }, [language, setLanguage]);

  const t = useCallback(
    (path: string, params?: TranslationParams): string => {
      // Try active language first, fall back to English, then path itself
      let translation =
        resolvePath(catalogs[language], path) ??
        resolvePath(catalogs.en, path) ??
        path;

      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          translation = translation.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        });
      }

      return translation;
    },
    [language]
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
    }),
    [language, setLanguage, toggleLanguage, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Hook to access language state, toggle and translator function
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback if rendered outside of LanguageProvider (e.g. testing)
    return {
      language: "en",
      setLanguage: () => {},
      toggleLanguage: () => {},
      t: (path: string, params?: TranslationParams) => {
        let text = resolvePath(catalogs.en, path) ?? path;
        if (params) {
          Object.entries(params).forEach(([k, v]) => {
            text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
          });
        }
        return text;
      },
    };
  }
  return ctx;
}

export const useTranslation = useLanguage;

/**
 * Localized formatters helper functions
 */
export function getLocalizedCategoryLabel(category: AqiCategory, lang: Language): string {
  const cat = catalogs[lang]?.aqi as Record<string, Record<string, string>> | undefined;
  return cat?.categories?.[category] ?? category;
}

export function getLocalizedProtocolStatusLabel(status: ProtocolStatus, lang: Language): string {
  const prot = catalogs[lang]?.protocol as Record<string, Record<string, string>> | undefined;
  return prot?.status?.[status] ?? status;
}

export function getLocalizedNoticeSeverityLabel(severity: NoticeSeverity, lang: Language): string {
  const noti = catalogs[lang]?.notice as Record<string, Record<string, string>> | undefined;
  return noti?.severity?.[severity] ?? severity;
}

export function formatLocalizedRelativeTime(iso: string, lang: Language): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.round(diffMs / 60_000);

  const getT = (path: string, params?: TranslationParams) => {
    let text = resolvePath(catalogs[lang], path) ?? resolvePath(catalogs.en, path) ?? path;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      });
    }
    return text;
  };

  if (diffMin < 1) return getT("time.justNow");
  if (diffMin < 60) return getT("time.minAgo", { count: diffMin });

  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) {
    return diffHrs === 1
      ? getT("time.hrAgo", { count: diffHrs })
      : getT("time.hrsAgo", { count: diffHrs });
  }

  const diffDays = Math.round(diffHrs / 24);
  return diffDays === 1
    ? getT("time.dayAgo", { count: diffDays })
    : getT("time.daysAgo", { count: diffDays });
}

/**
 * Compact, accessible Language Toggle Component
 */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Language selection"
      className={`inline-flex items-center rounded-lg p-0.5 bg-slate-900/80 border border-slate-700/60 shadow-sm backdrop-blur-md ${className}`}
      data-testid="language-toggle"
    >
      <button
        type="button"
        onClick={() => setLanguage("en")}
        aria-pressed={language === "en"}
        aria-label="English"
        data-testid="lang-btn-en"
        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all duration-150 ${
          language === "en"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
        }`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage("hi")}
        aria-pressed={language === "hi"}
        aria-label="हिन्दी"
        data-testid="lang-btn-hi"
        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all duration-150 ${
          language === "hi"
            ? "bg-blue-600 text-white shadow-sm"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
        }`}
      >
        हिन्दी
      </button>
    </div>
  );
}

export default LanguageToggle;
