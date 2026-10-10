import type { Band } from "@/lib/types";
import { BAND_LABEL } from "@/lib/format";

export function BandChip({ band, text }: { band: Band; text?: string }) {
  return <span className={`chip band-${band}`}>{text ?? BAND_LABEL[band].en}</span>;
}

export function SampleBadge({ show, title }: { show: boolean; title?: string }) {
  if (!show) return null;
  return <span className="chip sample" title={title ?? "Mock or cached data, not a live reading"}>SAMPLE</span>;
}
