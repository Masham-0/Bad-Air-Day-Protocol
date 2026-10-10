// Mirrors /contracts/*.schema.json. If a schema changes, change this file in the same PR.
// Times ending in Z are UTC; schedule/window times are IST "HH:MM".

export type Band = "green" | "amber" | "red";
export type Bilingual = { en: string; hi: string };

export interface ScheduleSlot {
  slot_id: string;
  label: string;
  label_hi?: string;
  start: string;
  end: string;
  outdoor: boolean;
}

export interface School {
  school_id: string;
  name: string;
  name_hi?: string;
  lat: number;
  lon: number;
  district?: string;
  state?: string;
  alert_emails?: string[];
  schedule: ScheduleSlot[];
}

export interface ForecastHour {
  time: string;
  pm25: number;
  band: Band;
}

export interface Forecast {
  school_id: string;
  lat: number;
  lon: number;
  generated_at: string;
  source: "open-meteo-cams" | "sample";
  now: {
    time: string;
    pm25: number;
    pm25_24h_mean: number;
    aqi: number;
    aqi_basis: string;
    band: Band;
    station?: { name: string; aqi_us: number | null; pm25_subindex_us?: number | null; time: string; source: "waqi" };
  };
  hours: ForecastHour[];
}

export interface MatchedFire {
  lat: number;
  lon: number;
  frp_mw: number;
  acq_time: string;
  satellite?: string;
  distance_km: number;
  hours_before_arrival: number;
  district: string;
  state: string;
}

export interface DistrictGroup {
  district: string;
  district_hi: string;
  state: string;
  state_hi: string;
  fire_count: number;
  frp_total_mw: number;
}

export interface SmokeTrace {
  school_id: string;
  kind: "now" | "forecast";
  target_time: string;
  generated_at: string;
  source: "live" | "sample";
  inputs: { wind: "open-meteo" | "sample"; fires: "firms-area-api" | "firms-public-csv" | "sample" };
  indicative: true;
  method: string;
  params: {
    hours_back: number;
    step_minutes: number;
    corridor_km: number;
    frp_threshold_mw: number;
    min_fires: number;
    wind_level: string;
  };
  origin: { lat: number; lon: number };
  path: { time: string; lat: number; lon: number; wind_speed_ms: number; wind_from_deg: number }[];
  upwind_from_deg: number;
  matched_fires: MatchedFire[];
  by_district: DistrictGroup[];
  fire_count: number;
  frp_total_mw: number;
  smoke_likely: boolean;
  headline: Bilingual;
}

export interface Citation {
  ref: string; // JSON pointer into the TodayBundle
  value: unknown;
  note?: string;
}

export type Action = "outdoor" | "outdoor_reduced" | "indoor";

export interface Decision {
  slot_id: string;
  label: string;
  start: string;
  end: string;
  action: Action;
  band: Band;
  reason: Bilingual;
  citations: Citation[];
}

export interface WindowPeriod {
  state: "open" | "closed";
  start: string;
  end: string;
  reason: Bilingual;
  citations: Citation[];
}

export interface Protocol {
  school_id: string;
  date: string;
  generated_at: string;
  generator: { engine: "strands-bedrock" | "rules-fallback"; model_id?: string; fallback_reason?: string };
  source: "live" | "sample";
  overall_band: Band;
  summary: Bilingual;
  decisions: Decision[];
  windows: WindowPeriod[];
  parent_notice: Bilingual;
  disclaimer: Bilingual;
}

export interface Alert {
  school_id: string;
  date: string;
  sent_at: string;
  channel: "sns-email";
  trigger: "schedule" | "test";
  subject: string;
  message_id: string;
  plan_generated_at: string;
}

export interface TodayBundle {
  school: School;
  date: string;
  generated_at: string;
  air: Forecast;
  smoke: { now: SmokeTrace; afternoon: SmokeTrace };
  plan: Protocol | null;
  alerts: Alert[];
}
