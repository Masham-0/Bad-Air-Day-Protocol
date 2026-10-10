import type { ForecastHour } from "@/lib/types";
import { istTime } from "@/lib/format";

/** 24 hourly PM2.5 bars coloured by band, labelled in IST. */
export function HourStrip({ hours }: { hours: ForecastHour[] }) {
  const max = Math.max(150, ...hours.map((h) => h.pm25));
  return (
    <div className="strip" role="img" aria-label="24-hour PM2.5 forecast">
      {hours.map((h, i) => (
        <div key={h.time} className="strip-col" title={`${istTime(h.time)} IST · PM2.5 ${h.pm25} µg/m³ · ${h.band}`}>
          <div className="strip-bar-wrap">
            <div className={`strip-bar band-${h.band}`} style={{ height: `${Math.max(4, (h.pm25 / max) * 100)}%` }} />
          </div>
          <div className="strip-label">{i % 3 === 0 ? istTime(h.time) : ""}</div>
        </div>
      ))}
    </div>
  );
}
