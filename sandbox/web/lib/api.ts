import type { Alert, TodayBundle } from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
export const DEFAULT_SCHOOL = process.env.NEXT_PUBLIC_SCHOOL_ID || "sample-dwarka";

export type Loaded = { bundle: TodayBundle; offline: boolean; error?: string };

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  return body as T;
}

/** GET /today; if the API is unreachable, fall back to the bundled sample so the page is never blank. */
export async function loadToday(schoolId: string): Promise<Loaded> {
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/schools/${schoolId}/today`, { cache: "no-store" });
      return { bundle: await json<TodayBundle>(res), offline: false };
    } catch (e) {
      const bundle = await fetch("/mock-today-bundle.json").then((r) => r.json());
      return { bundle, offline: true, error: String(e) };
    }
  }
  const bundle = await fetch("/mock-today-bundle.json").then((r) => r.json());
  return { bundle, offline: true, error: "NEXT_PUBLIC_API_URL is not set" };
}

/** POST /protocol (202), then poll /today until a plan newer than the request appears. */
export async function regeneratePlan(schoolId: string, onTick?: (secs: number) => void): Promise<TodayBundle> {
  const res = await fetch(`${API_URL}/schools/${schoolId}/protocol`, { method: "POST" });
  const { requested_at } = await json<{ requested_at: string }>(res);
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    await new Promise((r) => setTimeout(r, 2000));
    onTick?.(Math.round((Date.now() - started) / 1000));
    const { bundle } = await loadToday(schoolId);
    if (bundle.plan && bundle.plan.generated_at >= requested_at) return bundle;
  }
  throw new Error("The plan did not arrive within 2 minutes");
}

export async function sendTestAlert(schoolId: string): Promise<Alert & { preview: string }> {
  const res = await fetch(`${API_URL}/schools/${schoolId}/alert/test`, { method: "POST" });
  return json(res);
}
