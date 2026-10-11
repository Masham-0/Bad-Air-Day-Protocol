/**
 * Formatters for dates, PM2.5, AQI, and related display values.
 * All functions produce explicit units so the UI never shows ambiguous numbers.
 */

import type {
  AqiCategory,
  ProtocolStatus,
  NoticeSeverity,
  ActivityDecisionType,
} from "@/types/api";

// ─── Date / Time ────────────────────────────────────────────────────────────────

/**
 * Format an ISO 8601 timestamp as a locale-aware date string.
 * @example formatDate("2026-10-10T10:00:00+05:30") → "10 Oct 2026"
 */
export function formatDate(iso: string, locale: string = "en-IN"): string {
  const d = new Date(iso);
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format an ISO 8601 timestamp as a time string.
 * @example formatTime("2026-10-10T10:00:00+05:30") → "10:00 AM"
 */
export function formatTime(iso: string, locale: string = "en-IN"): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format an ISO 8601 timestamp as a short hour label.
 * @example formatHour("2026-10-10T14:00:00+05:30") → "2 PM"
 */
export function formatHour(iso: string, locale: string = "en-IN"): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale, {
    hour: "numeric",
    hour12: true,
  });
}

/**
 * Format an ISO timestamp as relative time (e.g. "5 min ago", "2 hrs ago").
 */
export function formatRelativeTime(iso: string, lang: "en" | "hi" = "en"): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.round(diffMs / 60_000);

  if (lang === "hi") {
    if (diffMin < 1) return "अभी";
    if (diffMin < 60) return `${diffMin} मिनट पहले`;
    const diffHrs = Math.round(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs} घंटे पहले`;
    const diffDays = Math.round(diffHrs / 24);
    return `${diffDays} दिन पहले`;
  }

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} hr${diffHrs > 1 ? "s" : ""} ago`;

  const diffDays = Math.round(diffHrs / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

/**
 * Format a date string (YYYY-MM-DD) as a readable date.
 * @example formatDateOnly("2026-10-10") → "10 Oct 2026"
 */
export function formatDateOnly(dateStr: string, locale: string = "en-IN"): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── PM2.5 ──────────────────────────────────────────────────────────────────────

/**
 * Format a PM2.5 value with explicit unit.
 * @example formatPM25(65.3) → "65.3 µg/m³"
 */
export function formatPM25(value: number): string {
  return `${value.toFixed(1)} µg/m³`;
}

/**
 * Format a PM10 value with explicit unit.
 * @example formatPM10(112.0) → "112.0 µg/m³"
 */
export function formatPM10(value: number): string {
  return `${value.toFixed(1)} µg/m³`;
}

// ─── AQI ────────────────────────────────────────────────────────────────────────

/**
 * Format an AQI value with explicit label.
 * @example formatAQI(156) → "AQI 156"
 */
export function formatAQI(value: number): string {
  return `AQI ${value}`;
}

/**
 * Map an AQI category enum value to a human-readable label.
 */
export function aqiCategoryLabel(category: AqiCategory, lang: "en" | "hi" = "en"): string {
  if (lang === "hi") {
    const hiLabels: Record<AqiCategory, string> = {
      good: "अच्छा",
      moderate: "मध्यम",
      unhealthy_sensitive: "संवेदनशील समूहों के लिए अस्वस्थ",
      unhealthy: "अस्वस्थ",
      very_unhealthy: "बहुत अस्वस्थ",
      hazardous: "खतरनाक",
    };
    return hiLabels[category] ?? category;
  }
  const labels: Record<AqiCategory, string> = {
    good: "Good",
    moderate: "Moderate",
    unhealthy_sensitive: "Unhealthy for Sensitive Groups",
    unhealthy: "Unhealthy",
    very_unhealthy: "Very Unhealthy",
    hazardous: "Hazardous",
  };
  return labels[category];
}

/**
 * Get the CSS custom property name for an AQI category color.
 * Maps to the design tokens defined in globals.css.
 */
export function aqiCategoryColor(category: AqiCategory): string {
  const colors: Record<AqiCategory, string> = {
    good: "var(--color-aqi-good)",
    moderate: "var(--color-aqi-moderate)",
    unhealthy_sensitive: "var(--color-aqi-unhealthy-sensitive)",
    unhealthy: "var(--color-aqi-unhealthy)",
    very_unhealthy: "var(--color-aqi-very-unhealthy)",
    hazardous: "var(--color-aqi-hazardous)",
  };
  return colors[category];
}

/**
 * Get a Tailwind-compatible CSS class suffix for an AQI category.
 * Use with the `text-aqi-*` and `bg-aqi-*` utilities from the design tokens.
 */
export function aqiCategoryTailwind(category: AqiCategory): string {
  const map: Record<AqiCategory, string> = {
    good: "aqi-good",
    moderate: "aqi-moderate",
    unhealthy_sensitive: "aqi-unhealthy-sensitive",
    unhealthy: "aqi-unhealthy",
    very_unhealthy: "aqi-very-unhealthy",
    hazardous: "aqi-hazardous",
  };
  return map[category];
}

/**
 * Determine the AQI category from a raw AQI number.
 * Uses EPA breakpoints.
 */
export function aqiToCategory(aqi: number): AqiCategory {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "moderate";
  if (aqi <= 150) return "unhealthy_sensitive";
  if (aqi <= 200) return "unhealthy";
  if (aqi <= 300) return "very_unhealthy";
  return "hazardous";
}

// ─── Protocol ───────────────────────────────────────────────────────────────────

/**
 * Map a protocol status enum to a human-readable label.
 */
export function protocolStatusLabel(status: ProtocolStatus, lang: "en" | "hi" = "en"): string {
  if (lang === "hi") {
    const hiLabels: Record<ProtocolStatus, string> = {
      all_clear: "सब सुरक्षित",
      caution: "सावधानी",
      restricted: "प्रतिबंधित",
      emergency: "आपातकालीन",
    };
    return hiLabels[status] ?? status;
  }
  const labels: Record<ProtocolStatus, string> = {
    all_clear: "All Clear",
    caution: "Caution",
    restricted: "Restricted",
    emergency: "Emergency",
  };
  return labels[status];
}

/**
 * Map a protocol status to a display color (CSS custom property).
 */
export function protocolStatusColor(status: ProtocolStatus): string {
  const colors: Record<ProtocolStatus, string> = {
    all_clear: "var(--color-aqi-good)",
    caution: "var(--color-aqi-moderate)",
    restricted: "var(--color-aqi-unhealthy)",
    emergency: "var(--color-aqi-hazardous)",
  };
  return colors[status];
}

// ─── Notice ─────────────────────────────────────────────────────────────────────

/**
 * Map a notice severity to a display color.
 */
export function noticeSeverityColor(severity: NoticeSeverity): string {
  const colors: Record<NoticeSeverity, string> = {
    info: "var(--color-primary-400)",
    warning: "var(--color-aqi-moderate)",
    critical: "var(--color-aqi-unhealthy)",
  };
  return colors[severity];
}

/**
 * Map a notice severity to a human-readable label.
 */
export function noticeSeverityLabel(severity: NoticeSeverity, lang: "en" | "hi" = "en"): string {
  if (lang === "hi") {
    const hiLabels: Record<NoticeSeverity, string> = {
      info: "सूचना",
      warning: "चेतावनी",
      critical: "गंभीर",
    };
    return hiLabels[severity] ?? severity;
  }
  const labels: Record<NoticeSeverity, string> = {
    info: "Information",
    warning: "Warning",
    critical: "Critical",
  };
  return labels[severity];
}

// ─── Activity Decisions ─────────────────────────────────────────────────────────

/**
 * Map an activity decision type to a human-readable label.
 */
export function activityDecisionLabel(
  decision: ActivityDecisionType,
  lang: "en" | "hi" = "en"
): string {
  if (lang === "hi") {
    const hiLabels: Record<ActivityDecisionType, string> = {
      outdoors: "बाहरी गतिविधियाँ अनुमत",
      indoors: "अंदर स्थानांतरित",
      restricted: "पूरी तरह प्रतिबंधित",
    };
    return hiLabels[decision] ?? decision;
  }
  const labels: Record<ActivityDecisionType, string> = {
    outdoors: "Outdoors Approved",
    indoors: "Moved Indoors",
    restricted: "Fully Restricted",
  };
  return labels[decision];
}

/**
 * Visual styling token definitions for activity decision types.
 */
export function activityDecisionStyle(decision: ActivityDecisionType) {
  const styles: Record<
    ActivityDecisionType,
    {
      bg: string;
      text: string;
      border: string;
      glow: string;
      badgeBg: string;
      badgeText: string;
      badgeBorder: string;
      icon: string;
      shortLabel: string;
    }
  > = {
    outdoors: {
      bg: "rgba(34, 197, 94, 0.08)",
      text: "#4ade80",
      border: "rgba(34, 197, 94, 0.35)",
      glow: "0 0 20px -4px rgba(34, 197, 94, 0.25)",
      badgeBg: "rgba(34, 197, 94, 0.15)",
      badgeText: "#4ade80",
      badgeBorder: "rgba(34, 197, 94, 0.4)",
      icon: "✓",
      shortLabel: "Outdoors",
    },
    indoors: {
      bg: "rgba(234, 179, 8, 0.08)",
      text: "#facc15",
      border: "rgba(234, 179, 8, 0.35)",
      glow: "0 0 20px -4px rgba(234, 179, 8, 0.25)",
      badgeBg: "rgba(234, 179, 8, 0.15)",
      badgeText: "#facc15",
      badgeBorder: "rgba(234, 179, 8, 0.4)",
      icon: "⌂",
      shortLabel: "Indoors",
    },
    restricted: {
      bg: "rgba(239, 68, 68, 0.08)",
      text: "#f87171",
      border: "rgba(239, 68, 68, 0.35)",
      glow: "0 0 20px -4px rgba(239, 68, 68, 0.25)",
      badgeBg: "rgba(239, 68, 68, 0.15)",
      badgeText: "#f87171",
      badgeBorder: "rgba(239, 68, 68, 0.4)",
      icon: "✕",
      shortLabel: "Restricted",
    },
  };
  return styles[decision] ?? styles.indoors;
}
