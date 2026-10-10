/**
 * TypeScript types mirroring every contract in contracts/.
 * These types are the single source of truth for the frontend.
 */

// ─── AQI Categories ────────────────────────────────────────────────────────────

export type AqiCategory =
  | "good"
  | "moderate"
  | "unhealthy_sensitive"
  | "unhealthy"
  | "very_unhealthy"
  | "hazardous";

// ─── Air Quality (air_quality.schema.json) ──────────────────────────────────────

export interface AirQualityReading {
  /** Air Quality Index value (0–500) */
  aqi: number;
  /** PM2.5 concentration in µg/m³ */
  pm25: number;
  /** PM10 concentration in µg/m³ */
  pm10?: number;
  /** EPA AQI category */
  category: AqiCategory;
  /** Data source name (e.g. "CPCB Delhi - Anand Vihar") */
  source: string;
  /** ISO 8601 timestamp of the reading */
  recorded_at: string;
}

export interface ForecastPoint {
  /** ISO 8601 timestamp of the forecast hour */
  hour: string;
  /** Air Quality Index value (0–500) */
  aqi: number;
  /** PM2.5 concentration in µg/m³ */
  pm25: number;
  /** EPA AQI category */
  category: AqiCategory;
}

export interface ResponseMetadata {
  request_id: string;
  generated_at: string;
  cache_ttl_seconds?: number;
}

export interface AirQualityResponse {
  current: AirQualityReading;
  forecast: ForecastPoint[];
  metadata: ResponseMetadata;
}

// ─── School (school.schema.json) ────────────────────────────────────────────────

export interface School {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  district?: string;
}

export interface SchoolListResponse {
  schools: School[];
}

// ─── Protocol (protocol.schema.json) ────────────────────────────────────────────

export type ProtocolStatus = "all_clear" | "caution" | "restricted" | "emergency";

export type ActivityDecisionType = "outdoors" | "indoors" | "restricted";

export interface ActivityDecision {
  /** Name of the activity (e.g. "Morning Assembly", "PE Outdoor") */
  activity: string;
  /** Scheduled time range (e.g. "08:00–08:30") */
  scheduled_time?: string;
  /** Whether the activity should be outdoors, moved indoors, or fully restricted */
  decision: ActivityDecisionType;
  /** Explanation for the decision */
  reason: string;
  /** Suggested alternative if activity is restricted */
  alternative?: string | null;
}

export interface ProtocolResponse {
  school_id: string;
  /** ISO 8601 date for this protocol */
  date: string;
  overall_status: ProtocolStatus;
  /** Human-readable summary of the day's protocol */
  overall_message?: string;
  activities: ActivityDecision[];
  generated_at: string;
}

// ─── Parent Notice (parent_notice.schema.json) ──────────────────────────────────

export type NoticeSeverity = "info" | "warning" | "critical";

export interface Notice {
  id: string;
  severity: NoticeSeverity;
  /** Notice headline */
  title: string;
  /** Full notice text, may include Markdown */
  body: string;
  issued_at: string;
  expires_at?: string;
}

export interface ParentNoticeResponse {
  school_id: string;
  date: string;
  notices: Notice[];
}

// ─── Dashboard aggregate (convenience type for page.tsx) ────────────────────────

export interface DashboardData {
  airQuality: AirQualityResponse;
  protocol: ProtocolResponse;
  school: School;
}
