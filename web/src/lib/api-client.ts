/**
 * API client with mock mode that reads from contracts/examples.
 *
 * When NEXT_PUBLIC_USE_MOCK=true, returns static mock data.
 * When false, fetches from NEXT_PUBLIC_API_BASE_URL.
 */

import type {
  AirQualityResponse,
  SchoolListResponse,
  ProtocolResponse,
  ParentNoticeResponse,
} from "@/types/api";

// ─── Mock data (inlined from contracts/examples/) ──────────────────────────────

const MOCK_AIR_QUALITY: AirQualityResponse = {
  current: {
    aqi: 156,
    pm25: 65.3,
    pm10: 112.0,
    category: "unhealthy",
    source: "CPCB Delhi - Anand Vihar",
    recorded_at: "2026-10-10T10:00:00+05:30",
  },
  forecast: [
    { hour: "2026-10-10T11:00:00+05:30", aqi: 148, pm25: 60.1, category: "unhealthy_sensitive" },
    { hour: "2026-10-10T12:00:00+05:30", aqi: 140, pm25: 55.8, category: "unhealthy_sensitive" },
    { hour: "2026-10-10T13:00:00+05:30", aqi: 132, pm25: 50.2, category: "unhealthy_sensitive" },
    { hour: "2026-10-10T14:00:00+05:30", aqi: 120, pm25: 44.6, category: "unhealthy_sensitive" },
    { hour: "2026-10-10T15:00:00+05:30", aqi: 105, pm25: 38.1, category: "unhealthy_sensitive" },
    { hour: "2026-10-10T16:00:00+05:30", aqi: 95, pm25: 33.5, category: "moderate" },
    { hour: "2026-10-10T17:00:00+05:30", aqi: 88, pm25: 29.7, category: "moderate" },
    { hour: "2026-10-10T18:00:00+05:30", aqi: 82, pm25: 26.4, category: "moderate" },
    { hour: "2026-10-10T19:00:00+05:30", aqi: 90, pm25: 31.0, category: "moderate" },
    { hour: "2026-10-10T20:00:00+05:30", aqi: 102, pm25: 37.8, category: "unhealthy_sensitive" },
    { hour: "2026-10-10T21:00:00+05:30", aqi: 118, pm25: 43.2, category: "unhealthy_sensitive" },
    { hour: "2026-10-10T22:00:00+05:30", aqi: 130, pm25: 49.5, category: "unhealthy_sensitive" },
    { hour: "2026-10-10T23:00:00+05:30", aqi: 145, pm25: 58.0, category: "unhealthy_sensitive" },
    { hour: "2026-10-11T00:00:00+05:30", aqi: 160, pm25: 68.4, category: "unhealthy" },
    { hour: "2026-10-11T01:00:00+05:30", aqi: 172, pm25: 75.1, category: "unhealthy" },
    { hour: "2026-10-11T02:00:00+05:30", aqi: 180, pm25: 80.3, category: "unhealthy" },
    { hour: "2026-10-11T03:00:00+05:30", aqi: 185, pm25: 83.6, category: "unhealthy" },
    { hour: "2026-10-11T04:00:00+05:30", aqi: 178, pm25: 78.9, category: "unhealthy" },
    { hour: "2026-10-11T05:00:00+05:30", aqi: 165, pm25: 70.2, category: "unhealthy" },
    { hour: "2026-10-11T06:00:00+05:30", aqi: 155, pm25: 64.8, category: "unhealthy" },
    { hour: "2026-10-11T07:00:00+05:30", aqi: 148, pm25: 60.1, category: "unhealthy_sensitive" },
    { hour: "2026-10-11T08:00:00+05:30", aqi: 138, pm25: 54.3, category: "unhealthy_sensitive" },
    { hour: "2026-10-11T09:00:00+05:30", aqi: 128, pm25: 48.0, category: "unhealthy_sensitive" },
    { hour: "2026-10-11T10:00:00+05:30", aqi: 115, pm25: 42.5, category: "unhealthy_sensitive" },
  ],
  metadata: {
    request_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    generated_at: "2026-10-10T10:01:12+05:30",
    cache_ttl_seconds: 300,
  },
};

const MOCK_SCHOOLS: SchoolListResponse = {
  schools: [
    {
      id: "sch_anand_vihar_01",
      name: "Delhi Public School, Anand Vihar",
      address: "Anand Vihar, East Delhi, Delhi 110092",
      latitude: 28.6468,
      longitude: 77.3152,
      district: "East Delhi",
    },
    {
      id: "sch_dwarka_02",
      name: "Kendriya Vidyalaya, Dwarka",
      address: "Sector 8, Dwarka, New Delhi 110077",
      latitude: 28.5823,
      longitude: 77.05,
      district: "South West Delhi",
    },
    {
      id: "sch_rohini_03",
      name: "DAV Public School, Rohini",
      address: "Sector 14, Rohini, Delhi 110085",
      latitude: 28.7358,
      longitude: 77.1143,
      district: "North West Delhi",
    },
  ],
};

const MOCK_PROTOCOL: ProtocolResponse = {
  school_id: "sch_anand_vihar_01",
  date: "2026-10-10",
  overall_status: "restricted",
  overall_message:
    "Air quality is Unhealthy (AQI 156). Outdoor activities are restricted. All physical activities moved indoors or cancelled.",
  activities: [
    {
      activity: "Morning Assembly",
      scheduled_time: "07:30–08:00",
      decision: "indoors",
      reason: "AQI 156 exceeds safe threshold for prolonged outdoor gatherings.",
      alternative: "Conduct assembly in the auditorium.",
    },
    {
      activity: "PE – Outdoor Sports",
      scheduled_time: "09:00–09:45",
      decision: "restricted",
      reason: "Vigorous physical activity is unsafe at AQI 156 (Unhealthy).",
      alternative: "Indoor stretching and yoga in the gymnasium.",
    },
    {
      activity: "Recess – Playground",
      scheduled_time: "10:30–11:00",
      decision: "restricted",
      reason: "Extended outdoor exposure not recommended for children at this AQI level.",
      alternative: "Indoor recess in classrooms with board games and reading.",
    },
    {
      activity: "Lunch Break",
      scheduled_time: "12:30–13:15",
      decision: "indoors",
      reason: "Forecast shows AQI improving to ~132 by 13:00 but still above safe threshold.",
      alternative: "Eat in the cafeteria; windows closed.",
    },
    {
      activity: "Afternoon Sports Practice",
      scheduled_time: "15:00–16:00",
      decision: "indoors",
      reason:
        "AQI forecast ~105 (Unhealthy for Sensitive Groups). Safe for brief exposure but practice moved indoors as precaution.",
      alternative: "Indoor drills and fitness exercises.",
    },
    {
      activity: "Dismissal – Walking Students",
      scheduled_time: "16:00–16:30",
      decision: "outdoors",
      reason: "Brief outdoor exposure for dismissal is acceptable. AQI forecast ~95 (Moderate).",
      alternative: null,
    },
  ],
  generated_at: "2026-10-10T06:00:00+05:30",
};

const MOCK_NOTICES: ParentNoticeResponse = {
  school_id: "sch_anand_vihar_01",
  date: "2026-10-10",
  notices: [
    {
      id: "b1c2d3e4-f5a6-7890-bcde-f12345678901",
      severity: "warning",
      title: "Outdoor Activities Restricted Today",
      body: "Due to **Unhealthy** air quality (AQI 156), all outdoor activities including PE, recess, and sports practice have been moved indoors or cancelled. Please ensure your child carries indoor activity supplies.\n\nThe school will monitor conditions throughout the day and update if the situation changes.",
      issued_at: "2026-10-10T06:30:00+05:30",
      expires_at: "2026-10-10T18:00:00+05:30",
    },
    {
      id: "c2d3e4f5-a6b7-8901-cdef-234567890123",
      severity: "info",
      title: "Afternoon Improvement Expected",
      body: "Forecast indicates AQI may improve to **Moderate** (~95) by 16:00. Dismissal will proceed normally outdoors. Brief outdoor exposure is safe.",
      issued_at: "2026-10-10T06:30:00+05:30",
      expires_at: "2026-10-10T18:00:00+05:30",
    },
  ],
};

// ─── Configuration ──────────────────────────────────────────────────────────────

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";

// ─── Generic fetcher ────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText} [${path}]`);
  }

  return res.json() as Promise<T>;
}

/**
 * Simulate network latency in mock mode so loading states are visible
 * during development.
 */
function mockDelay(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/** Fetch the list of available schools. */
export async function getSchools(): Promise<SchoolListResponse> {
  if (USE_MOCK) {
    await mockDelay();
    return structuredClone(MOCK_SCHOOLS);
  }
  return apiFetch<SchoolListResponse>("/schools");
}

/** Fetch current air quality and 24-hour forecast for a school. */
export async function getAirQuality(
  schoolId: string,
): Promise<AirQualityResponse> {
  if (USE_MOCK) {
    await mockDelay();
    return structuredClone(MOCK_AIR_QUALITY);
  }
  return apiFetch<AirQualityResponse>(
    `/schools/${encodeURIComponent(schoolId)}/air-quality`,
  );
}

/** Fetch the daily activity protocol for a school. */
export async function getProtocol(
  schoolId: string,
): Promise<ProtocolResponse> {
  if (USE_MOCK) {
    await mockDelay();
    return structuredClone(MOCK_PROTOCOL);
  }
  return apiFetch<ProtocolResponse>(
    `/schools/${encodeURIComponent(schoolId)}/protocol`,
  );
}

/** Fetch parent notices for a school. */
export async function getParentNotices(
  schoolId: string,
): Promise<ParentNoticeResponse> {
  if (USE_MOCK) {
    await mockDelay();
    return structuredClone(MOCK_NOTICES);
  }
  return apiFetch<ParentNoticeResponse>(
    `/schools/${encodeURIComponent(schoolId)}/notices`,
  );
}

/** Fetch all dashboard data for a school in parallel. */
export async function getDashboard(schoolId: string) {
  const [airQuality, protocol] = await Promise.all([
    getAirQuality(schoolId),
    getProtocol(schoolId),
  ]);

  const schoolsResponse = await getSchools();
  const school = schoolsResponse.schools.find((s) => s.id === schoolId);

  if (!school) {
    throw new Error(`School not found: ${schoolId}`);
  }

  return { airQuality, protocol, school };
}
