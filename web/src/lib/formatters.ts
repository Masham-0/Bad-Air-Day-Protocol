/**
 * Formatters for dates, PM2.5, AQI, and related display values.
 * All functions produce explicit units so the UI never shows ambiguous numbers.
 */

import type { AqiCategory, ProtocolStatus, NoticeSeverity } from "@/types/api";

// ─── Date / Time ────────────────────────────────────────────────────────────────

/**
 * Format an ISO 8601 timestamp as a locale-aware date string.
 * @example formatDate("2026-10-10T10:00:00+05:30") → "10 Oct 2026"
 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format an ISO 8601 timestamp as a time string.
 * @example formatTime("2026-10-10T10:00:00+05:30") → "10:00 AM"
 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format an ISO 8601 timestamp as a short hour label.
 * @example formatHour("2026-10-10T14:00:00+05:30") → "2 PM"
 */
export function formatHour(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    hour12: true,
  });
}

/**
 * Format an ISO timestamp as relative time (e.g. "5 min ago", "2 hrs ago").
 */
export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.round(diffMs / 60_000);

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
export function formatDateOnly(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-IN", {
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
export function aqiCategoryLabel(category: AqiCategory): string {
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
export function protocolStatusLabel(status: ProtocolStatus): string {
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
export function noticeSeverityLabel(severity: NoticeSeverity): string {
  const labels: Record<NoticeSeverity, string> = {
    info: "Information",
    warning: "Warning",
    critical: "Critical",
  };
  return labels[severity];
}
