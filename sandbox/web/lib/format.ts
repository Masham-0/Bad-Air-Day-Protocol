import type { Action, Band } from "./types";

const IST = "Asia/Kolkata";

export function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit" });
}

export function istDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: IST, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }) + " IST";
}

export const BAND_LABEL: Record<Band, { en: string; hi: string }> = {
  green: { en: "Green", hi: "हरा" },
  amber: { en: "Amber", hi: "नारंगी" },
  red: { en: "Red", hi: "लाल" },
};

export const ACTION_LABEL: Record<Action, { en: string; hi: string }> = {
  outdoor: { en: "Outdoors", hi: "बाहर" },
  outdoor_reduced: { en: "Outdoors, short & light", hi: "बाहर, छोटा और हल्का" },
  indoor: { en: "Indoors", hi: "अंदर" },
};

export const ACTION_BAND: Record<Action, Band> = { outdoor: "green", outdoor_reduced: "amber", indoor: "red" };

export function compass(deg: number): string {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
