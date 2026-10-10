"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL, DEFAULT_SCHOOL, type Loaded, loadToday, regeneratePlan, sendTestAlert } from "@/lib/api";
import { ACTION_BAND, ACTION_LABEL, BAND_LABEL, compass, istDateTime, istTime } from "@/lib/format";
import type { Citation, TodayBundle } from "@/lib/types";
import { BandChip, SampleBadge } from "@/components/Badges";
import { HourStrip } from "@/components/HourStrip";
import { SmokeMap } from "@/components/SmokeMap";

type Lang = "en" | "hi";

function Cites({ items }: { items: Citation[] }) {
  return (
    <div className="cites">
      {items.map((c) => (
        <code key={c.ref} title={c.note ?? ""}>{c.ref} = {String(c.value)}</code>
      ))}
    </div>
  );
}

export default function Home() {
  const [schoolId, setSchoolId] = useState(DEFAULT_SCHOOL);
  const [state, setState] = useState<Loaded | null>(null);
  const [lang, setLang] = useState<Lang>("en");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("school");
    if (q) setSchoolId(q);
    if (params.get("lang") === "hi") setLang("hi");
  }, []);

  const refresh = useCallback(async () => setState(await loadToday(schoolId)), [schoolId]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!state) return <main className="wrap"><p className="muted">Loading today&apos;s air…</p></main>;
  const b: TodayBundle = state.bundle;
  const { air, smoke, plan } = b;
  const sample = air.source === "sample" || smoke.now.source === "sample" || smoke.afternoon.source === "sample";

  async function onRegenerate() {
    setBusy("Agent is writing the plan…");
    try {
      const bundle = await regeneratePlan(schoolId, (s) => setBusy(`Agent is writing the plan… ${s}s`));
      setState({ bundle, offline: false });
      setToast("New plan ready");
    } catch (e) {
      setToast(`Could not regenerate: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  async function onTestAlert() {
    setBusy("Sending test alert…");
    try {
      const a = await sendTestAlert(schoolId);
      setToast(`Alert sent: ${a.subject}`);
      await refresh();
    } catch (e) {
      setToast(`Alert failed: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  const notice = plan ? plan.parent_notice[lang] : "";
  const schoolName = lang === "hi" && b.school.name_hi ? b.school.name_hi : b.school.name;

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>Bad-Air Day Protocol</h1>
          <p className="muted">
            {schoolName} · school day <b>{b.date}</b> · updated {istDateTime(b.generated_at)}
          </p>
        </div>
        <div className="top-right">
          <SampleBadge show={sample} />
          {state.offline && <span className="chip offline" title={state.error}>OFFLINE: showing bundled sample</span>}
          <div className="lang">
            <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
            <button className={lang === "hi" ? "on" : ""} onClick={() => setLang("hi")}>हिंदी</button>
          </div>
        </div>
      </header>

      {plan && (
        <section className={`hero band-edge-${plan.overall_band}`}>
          <div className="hero-band"><BandChip band={plan.overall_band} text={BAND_LABEL[plan.overall_band][lang]} /></div>
          <p className="hero-text">{plan.summary[lang]}</p>
        </section>
      )}

      <div className="grid">
        <section className="card">
          <h2>Air at school <SampleBadge show={air.source === "sample"} /></h2>
          <div className="now">
            <div>
              <div className="big">{air.now.pm25}<span className="unit"> µg/m³</span></div>
              <div className="muted">PM2.5 this hour ({istTime(air.now.time)} IST)</div>
            </div>
            <div className="now-side">
              <BandChip band={air.now.band} text={`${BAND_LABEL[air.now.band].en} this hour`} />
              <div className="muted small">24 h average {air.now.pm25_24h_mean} µg/m³</div>
              <div className="muted small" title={air.now.aqi_basis}>AQI-style {air.now.aqi} (24 h, indicative)</div>
            </div>
          </div>
          <p className="muted small">
            The band uses this hour&apos;s PM2.5 (our school rule). The AQI-style number uses the 24-hour average,
            the way CPCB computes AQI, so the two can point in different directions.
          </p>
          <HourStrip hours={air.hours} />
          <p className="muted small">
            Source: {air.source === "sample" ? "sample data" : "CAMS model via Open-Meteo (forecast, not a sensor)"}.
            Bands are a school rule, not an official standard.
          </p>
        </section>

        <section className="card">
          <h2>Where is the smoke from? <span className="chip indicative">INDICATIVE</span> <SampleBadge show={smoke.now.source === "sample"} /></h2>
          <SmokeMap now={smoke.now} afternoon={smoke.afternoon} />
          <div className="smoke-lines">
            {(["now", "afternoon"] as const).map((k) => (
              <div key={k} className={`smoke-line ${smoke[k].smoke_likely ? "likely" : ""}`}>
                <b>{k === "now" ? "Now" : "14:00"}</b>: {smoke[k].headline[lang]}
                <div className="muted small">
                  wind from {compass(smoke[k].upwind_from_deg)} · {smoke[k].fire_count} fires on path ·{" "}
                  {smoke[k].frp_total_mw} MW total
                </div>
              </div>
            ))}
          </div>
          {smoke.afternoon.by_district.length > 0 && (
            <table className="districts">
              <thead><tr><th>District (14:00 air)</th><th>Fires</th><th>FRP MW</th></tr></thead>
              <tbody>
                {smoke.afternoon.by_district.slice(0, 6).map((d) => (
                  <tr key={d.district + d.state}>
                    <td>{lang === "hi" ? `${d.district_hi}, ${d.state_hi}` : `${d.district}, ${d.state}`}</td>
                    <td>{d.fire_count}</td><td>{d.frp_total_mw}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Today&apos;s protocol</h2>
          <div className="actions">
            <button onClick={onRegenerate} disabled={!!busy || !API_URL || state.offline}>Regenerate plan</button>
            <button onClick={onTestAlert} disabled={!!busy || !API_URL || state.offline} className="secondary">Send test alert</button>
          </div>
        </div>
        {busy && <p className="busy">{busy}</p>}
        {!plan ? (
          <p className="muted">No plan yet for {b.date}. Press <b>Regenerate plan</b> to run the agent.</p>
        ) : (
          <>
            <p className="muted small">
              Written by {plan.generator.engine === "strands-bedrock" ? `Strands agent on Amazon Bedrock (${plan.generator.model_id})` : "rules engine (fallback)"}
              {plan.generator.fallback_reason ? `: ${plan.generator.fallback_reason}` : ""} · {istDateTime(plan.generated_at)}
            </p>
            <table className="plan">
              <thead><tr><th>Slot</th><th>Time (IST)</th><th>Decision</th><th>Why (cited numbers)</th></tr></thead>
              <tbody>
                {plan.decisions.map((d) => {
                  const slot = b.school.schedule.find((s) => s.slot_id === d.slot_id);
                  return (
                    <tr key={d.slot_id}>
                      <td><b>{lang === "hi" && slot?.label_hi ? slot.label_hi : d.label}</b></td>
                      <td>{d.start}–{d.end}</td>
                      <td><BandChip band={ACTION_BAND[d.action]} text={ACTION_LABEL[d.action][lang]} /></td>
                      <td>{d.reason[lang]}<Cites items={d.citations} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <h3>Windows</h3>
            <ul className="windows">
              {plan.windows.map((w) => (
                <li key={w.start}>
                  <span className={`chip ${w.state === "open" ? "band-green" : "band-red"}`}>{w.state === "open" ? "Open" : "Closed"}</span>{" "}
                  {w.start}–{w.end} · {w.reason[lang]} <Cites items={w.citations} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {plan && (
        <section className="card">
          <div className="card-head">
            <h2>Parent notice ({lang === "en" ? "English" : "हिंदी"})</h2>
            <div className="actions">
              <button className="secondary" onClick={() => navigator.clipboard.writeText(notice).then(() => setToast("Copied"))}>Copy</button>
              <a className="button" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(notice)}`}>Share on WhatsApp</a>
            </div>
          </div>
          <pre className="notice" lang={lang}>{notice}</pre>
          <p className="muted small">{plan.disclaimer[lang]}</p>
        </section>
      )}

      {b.alerts.length > 0 && (
        <section className="card">
          <h2>Alerts sent for {b.date}</h2>
          <ul className="alerts">
            {b.alerts.map((a) => (
              <li key={a.sent_at}>{istDateTime(a.sent_at)} · {a.trigger} · {a.channel} · {a.subject}</li>
            ))}
          </ul>
        </section>
      )}

      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
      <footer className="muted small">
        API: {API_URL || "not set"} · school: {schoolId} · Team Shawarma, Environmental Hacks 2026
      </footer>
    </main>
  );
}
