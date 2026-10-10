/* Bad-Air Day Protocol, prototype 2 dashboard. No build step, no dependencies.
 *
 * Query params:
 *   ?api=http://host:port   API base (default: same origin as this page)
 *   ?school=sch_dwarka_02   school to open (default: last viewed, else the sample school)
 *   ?lang=hi                open in Hindi
 */
"use strict";

const params = new URLSearchParams(location.search);
const API = (params.get("api") || (location.protocol === "file:" ? "http://localhost:8000" : "")).replace(/\/+$/, "");
const DEFAULT_SCHOOL = "sch_dwarka_02";   // the mock school: its sample day has smoke by 14:00
const IST = "Asia/Kolkata";

const state = {
  lang: params.get("lang") || store("lang") || "en",
  school: params.get("school") || store("school") || null,
  trace: "afternoon",
  schools: [], aq: null, protocol: null, smoke: null, notices: null, alerts: null, basis: null,
  errors: {}, emailId: null,
};

/* ── i18n ────────────────────────────────────────────────────────────────── */

const T = {
  hi: {
    now: "अभी की हवा", plan: "आज की योजना", regen: "योजना फिर से बनाएँ", smoke: "धुआँ कहाँ से आ रहा है?",
    trace_now: "अभी", forecast: "अगले 24 घंटे", notices: "अभिभावकों के लिए सूचना", alerts: "अलर्ट ईमेल",
    send: "टेस्ट अलर्ट भेजें", job: "06:00 का काम चलाएँ",
    indicative: "अनुमानित: 120 मीटर ऊँचाई की हवा का एक-स्तरीय पिछला रास्ता, NASA FIRMS की आग की पहचान से मिलाया गया। यह फैलाव मॉडल नहीं है।",
    forecast_note: "हर घंटे के PM2.5 से US-EPA AQI (अनुमानित)। छायांकित: स्कूल का समय। डैश वाली रेखा: AQI 100।",
    disclaimer: "मॉडल पूर्वानुमान (Open-Meteo के ज़रिए CAMS) और अनुमानित धुएँ के रास्ते पर आधारित सलाह। गतिविधि की सीमाएँ स्कूल का नियम हैं, आधिकारिक मानक नहीं। GRAP/CAQM और शिक्षा निदेशालय के आधिकारिक आदेश हमेशा मान्य होंगे।",
  },
};
const S = {   // strings set from code
  en: {
    sample: "Sample", plan_for: "Plan for", engine_rules: "Written by the rules engine", engine_agent: "Written by the Strands agent on Bedrock",
    fallback: "fallback", generated: "generated", source: "Source", recorded: "reading for",
    fires: "Farm fires on the path", frp: "Fire power (FRP)", wind: "Wind from", threshold: "smoke if ≥",
    smoke_likely: "Smoke likely", smoke_unlikely: "Smoke unlikely", trace_for: "Trace arriving",
    school: "School", path: "Air path (back 24 h, dot every 6 h)", corridor: "km corridor", fire_key: "Fire (size = FRP)",
    table: "Show as table", hour: "Hour (IST)", category: "Category",
    copy: "Copy", whatsapp: "WhatsApp", copied: "Copied", expires: "until",
    no_alerts: "No alerts sent yet today. Send a test alert to see the email.", sent: "Alert sent", via: "via",
    regenerating: "Regenerating…", regenerated: "New plan generated", sending: "Sending…", running: "Running…",
    job_done: (n, e) => `Daily job ran for ${n} school${n === 1 ? "" : "s"}${e ? `, ${e} failed` : ""}`,
    api_down: (u) => `Can't reach the API at ${u}. Start it with: python sandbox2/api/server.py`,
    failed: "Couldn't load this part", no_path: "No trajectory available.",
    trigger: { manual: "manual", schedule: "06:00 job" },
    pm: (p25, p10) => `PM2.5 ${fmt(p25)} µg/m³` + (p10 != null ? ` · PM10 ${fmt(p10)} µg/m³` : ""),
  },
  hi: {
    sample: "सैंपल", plan_for: "योजना:", engine_rules: "नियमों से बनी योजना", engine_agent: "Bedrock पर Strands एजेंट से बनी योजना",
    fallback: "कारण", generated: "बनी", source: "स्रोत", recorded: "रीडिंग का समय",
    fires: "रास्ते में खेतों की आग", frp: "आग की ताक़त (FRP)", wind: "हवा की दिशा", threshold: "धुआँ अगर ≥",
    smoke_likely: "धुएँ की संभावना", smoke_unlikely: "धुएँ की संभावना कम", trace_for: "हवा पहुँचने का समय",
    school: "स्कूल", path: "हवा का रास्ता (पिछले 24 घंटे, हर 6 घंटे पर बिंदु)", corridor: "किमी पट्टी", fire_key: "आग (आकार = FRP)",
    table: "तालिका देखें", hour: "समय (IST)", category: "श्रेणी",
    copy: "कॉपी करें", whatsapp: "WhatsApp", copied: "कॉपी हो गया", expires: "तक",
    no_alerts: "आज अभी तक कोई अलर्ट नहीं भेजा गया। ईमेल देखने के लिए टेस्ट अलर्ट भेजें।", sent: "अलर्ट भेजा गया", via: "माध्यम",
    regenerating: "बन रही है…", regenerated: "नई योजना बन गई", sending: "भेजा जा रहा है…", running: "चल रहा है…",
    job_done: (n, e) => `${n} स्कूलों के लिए रोज़ का काम चला${e ? `, ${e} में गड़बड़ी` : ""}`,
    api_down: (u) => `API (${u}) से जुड़ नहीं पाए। चालू करें: python sandbox2/api/server.py`,
    failed: "यह हिस्सा लोड नहीं हो सका", no_path: "हवा का रास्ता उपलब्ध नहीं।",
    trigger: { manual: "हाथ से", schedule: "06:00 का काम" },
    pm: (p25, p10) => `PM2.5 ${fmt(p25)} µg/m³` + (p10 != null ? ` · PM10 ${fmt(p10)} µg/m³` : ""),
  },
};
const CATEGORY = {
  good: ["Good", "अच्छी", "--good"],
  moderate: ["Moderate", "मध्यम", "--moderate"],
  unhealthy_sensitive: ["Unhealthy for sensitive groups", "संवेदनशील लोगों के लिए अस्वस्थ", "--usg"],
  unhealthy: ["Unhealthy", "अस्वस्थ", "--unhealthy"],
  very_unhealthy: ["Very unhealthy", "बहुत अस्वस्थ", "--very"],
  hazardous: ["Hazardous", "ख़तरनाक", "--hazardous"],
};
const STATUS = {
  all_clear: ["All clear", "सब ठीक", "--out"],
  caution: ["Caution", "सावधानी", "--in"],
  restricted: ["Restricted", "सीमित", "--off"],
  emergency: ["Emergency", "आपात स्थिति", "--hazardous"],
};
const SEVERITY = { info: ["info", "सूचना"], warning: ["warning", "चेतावनी"], critical: ["critical", "गंभीर"] };
const DECISION = { outdoors: ["Outdoors", "बाहर"], indoors: ["Indoors", "अंदर"], restricted: ["Restricted", "रद्द / सीमित"] };
const COMPASS_EN = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const COMPASS_HI = ["उत्तर", "उत्तर-पूर्व", "पूर्व", "दक्षिण-पूर्व", "दक्षिण", "दक्षिण-पश्चिम", "पश्चिम", "उत्तर-पश्चिम"];

const s = () => S[state.lang] || S.en;
const hi = () => state.lang === "hi";
const pick = (pair) => (hi() ? pair[1] : pair[0]);
const cat = (c) => CATEGORY[c] || [c, c, "--muted"];

/* ── helpers ─────────────────────────────────────────────────────────────── */

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem("badair." + key);
    localStorage.setItem("badair." + key, value);
  } catch (_) { /* private mode: per-viewer convenience only */ }
  return null;
}
const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "style") n.style.cssText = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
  return n;
}
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n, d = 0) => (n == null || Number.isNaN(+n) ? "—" : (+n).toLocaleString("en-IN", { maximumFractionDigits: d }));
const istTime = (iso) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit" });
function planDate(ymd) {
  const d = new Date(ymd + "T06:30:00Z");
  return d.toLocaleDateString(hi() ? "hi-IN" : "en-GB", { timeZone: IST, weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
const compass = (deg) => (hi() ? COMPASS_HI : COMPASS_EN)[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
const isSample = () => !!(state.protocol?.sample || String(state.aq?.current?.source || "").startsWith("SAMPLE"));

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
  return body;
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

async function busy(btn, label, fn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (_) {
    const ta = el("textarea", { style: "position:fixed;opacity:0" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(s().copied);
}

/* Notice bodies use a small Markdown subset: **bold**, paragraphs and "- " lists. */
function mdToHtml(md) {
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return md.trim().split(/\n{2,}/).map((block) => {
    const html = [];
    let text = [], items = [];
    const flush = () => {
      if (text.length) html.push(`<p>${text.map(inline).join("<br>")}</p>`);
      if (items.length) html.push(`<ul>${items.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`);
      text = []; items = [];
    };
    for (const l of block.split("\n")) {
      const m = l.match(/^\s*-\s(.*)$/);
      if (m) { if (text.length) flush(); items.push(m[1]); }
      else { if (items.length) flush(); text.push(l); }
    }
    flush();
    return html.join("");
  }).join("");
}
const mdPlain = (md) => md.replace(/\*\*/g, "");
const mdWhatsApp = (md) => md.replace(/\*\*(.+?)\*\*/g, "*$1*");

/* ── citations ───────────────────────────────────────────────────────────── */

function cites(list) {
  return el("div", { class: "cites" }, (list || []).map((c) =>
    el("button", {
      class: "cite", type: "button", text: c.ref,
      title: `${c.ref} = ${JSON.stringify(c.value)}${c.note ? " · " + c.note : ""}`,
      onclick: () => followCitation(c.ref),
    })));
}

/* A citation is a JSON pointer into the plan's inputs; jump to the thing it points at. */
function followCitation(ref) {
  const fc = ref.match(/^\/air_quality\/forecast\/(\d+)\//);
  const sm = ref.match(/^\/smoke\/(now|afternoon)\//);
  if (fc) {
    $("forecast-card").scrollIntoView({ behavior: "smooth", block: "center" });
    flashHour(+fc[1]);
  } else if (sm) {
    setTrace(sm[1]);
    $("smoke-card").scrollIntoView({ behavior: "smooth", block: "center" });
    $("smoke-card").classList.remove("flash");
    void $("smoke-card").offsetWidth;
    $("smoke-card").classList.add("flash");
  } else if (ref.startsWith("/air_quality/current")) {
    $("hero").scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/* ── render: header, hero ────────────────────────────────────────────────── */

function renderStatic() {
  document.documentElement.lang = state.lang;
  for (const n of document.querySelectorAll("[data-i18n]")) {
    if (!n.dataset.en) n.dataset.en = n.textContent;
    n.textContent = (hi() && T.hi[n.dataset.i18n]) || n.dataset.en;
  }
  for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === state.lang));
  for (const b of document.querySelectorAll("[data-trace]")) b.setAttribute("aria-pressed", String(b.dataset.trace === state.trace));
  $("api-link").href = (API || "") + "/health";
}

function renderHeader() {
  const school = state.schools.find((x) => x.id === state.school);
  const date = state.protocol?.date || state.basis?.date;
  $("plan-date").textContent = date ? `${s().plan_for} ${planDate(date)}` + (school ? ` · ${school.district || ""}` : "") : "";
}

function renderHero() {
  const p = state.protocol, cur = state.aq?.current;
  const hero = $("hero");
  if (!p && !cur) {
    $("status-word").textContent = "—";
    $("status-msg").replaceChildren(el("span", { class: "err", text: state.errors.down ? s().api_down(API || location.origin) : s().failed }));
    return;
  }
  const badges = [];
  if (isSample()) badges.push(el("span", { class: "badge sample", text: s().sample }));
  if (p?.generator?.engine) badges.push(el("span", { class: "badge", text: p.generator.engine === "rules" ? "rules" : p.generator.engine }));
  $("badges").replaceChildren(...badges);

  if (p) {
    const st = STATUS[p.overall_status] || [p.overall_status, p.overall_status, "--muted"];
    hero.style.setProperty("--status", `var(${st[2]})`);
    $("status-word").textContent = pick(st);
    $("status-msg").textContent = (hi() && p.overall_message_hi) || p.overall_message;
    $("status-cites").replaceChildren(cites(p.citations));
  }
  if (cur) {
    const c = cat(cur.category);
    $("now").style.setProperty("--cat", `var(${c[2]})`);
    $("now-aqi").textContent = fmt(cur.aqi);
    $("now-cat").textContent = pick(c);
    $("now-cat").classList.toggle("dark-ink", cur.category === "moderate" || cur.category === "good");
    $("now-pm").textContent = s().pm(cur.pm25, cur.pm10);
    $("now-src").textContent = `${s().source}: ${cur.source} · ${s().recorded} ${istTime(cur.recorded_at)} IST`;
  }
}

/* ── render: plan ────────────────────────────────────────────────────────── */

function renderPlan() {
  const p = state.protocol;
  if (!p) {
    $("plan").replaceChildren(el("li", { class: "err", text: s().failed }));
    $("engine").textContent = "";
    return;
  }
  $("plan").replaceChildren(...p.activities.map((a) => {
    const h = hi() && a.hi ? a.hi : {};
    const alt = h.alternative || a.alternative;
    return el("li", {},
      el("span", { class: "time", text: a.scheduled_time }),
      el("div", { class: "title" },
        el("span", { text: h.activity || a.activity }),
        el("span", { class: `chip ${a.decision}`, text: pick(DECISION[a.decision] || [a.decision, a.decision]) })),
      el("p", { class: "why", text: h.reason || a.reason }),
      a.decision !== "outdoors" && alt ? el("p", { class: "alt", text: alt }) : null,
      cites(a.citations));
  }));
  const g = p.generator || {};
  const who = g.engine === "rules" ? s().engine_rules : g.engine ? s().engine_agent : "";
  $("engine").textContent = [who, g.fallback_reason ? `${s().fallback}: ${g.fallback_reason}` : "",
    p.generated_at ? `${s().generated} ${istTime(p.generated_at)} IST` : ""].filter(Boolean).join(" · ");
}

/* ── render: smoke map ───────────────────────────────────────────────────── */

function setTrace(kind) {
  state.trace = kind;
  renderStatic();
  renderSmoke();
}

function renderSmoke() {
  const tr = state.smoke?.[state.trace];
  if (!tr) {
    $("smoke-headline").replaceChildren(el("span", { class: "err", text: s().failed }));
    $("map").replaceChildren();
    $("smoke-stats").replaceChildren();
    return;
  }
  $("smoke-headline").replaceChildren(
    el("span", { class: `dot ${tr.smoke_likely ? "likely" : "unlikely"}`, "aria-hidden": "true" }),
    el("strong", { text: tr.smoke_likely ? s().smoke_likely : s().smoke_unlikely }),
    " · ", (tr.headline && (tr.headline[state.lang] || tr.headline.en)) || "");
  $("map").innerHTML = mapSvg(tr);
  const stat = (dt, dd, title) => el("div", { title }, el("dt", { text: dt }), el("dd", { text: dd }));
  $("smoke-stats").replaceChildren(
    stat(s().fires, fmt(tr.fire_count), `${s().threshold} ${tr.params?.min_fires}`),
    stat(s().frp, `${fmt(tr.frp_total_mw)} MW`, `${s().threshold} ${tr.params?.frp_threshold_mw} MW`),
    stat(s().wind, tr.upwind_from_deg != null ? `${compass(tr.upwind_from_deg)} · ${fmt(tr.upwind_from_deg)}°` : "—"),
  );
  $("map-key").replaceChildren(
    el("span", {}, el("i", { class: "k-school" }), s().school),
    el("span", {}, el("i", { class: "k-path" }), s().path),
    el("span", {}, el("i", { class: "k-corridor" }), `${tr.params?.corridor_km ?? ""} ${s().corridor}`),
    el("span", {}, el("i", { class: "k-fire" }), s().fire_key),
    el("span", { class: "muted" }, `${s().trace_for} ${istTime(tr.target_time)} IST`));
}

function mapSvg(tr) {
  const path = tr.path || [];
  if (!path.length) return `<p class="empty" style="padding:16px">${esc(s().no_path)}</p>`;
  const W = Math.max(300, Math.round($("map").clientWidth || 440)), P = 26;
  const o = tr.origin, kx = 111.32 * Math.cos((o.lat * Math.PI) / 180), ky = 110.57;
  const km = (p) => [(p.lon - o.lon) * kx, (o.lat - p.lat) * ky];      // east, south in km
  const fires = tr.matched_fires || [];
  const pts = [o, ...path, ...fires].map(km);
  let [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  let [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const pad = Math.max(20, (tr.params?.corridor_km || 25) * 1.2);
  x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
  const H = Math.round(Math.min(Math.max(W * (y1 - y0) / (x1 - x0), 260), Math.min(560, W * 1.25)));
  const sc = Math.min((W - 2 * P) / (x1 - x0), (H - 2 * P) / (y1 - y0));    // px per km
  const ox = (W - (x1 - x0) * sc) / 2 - x0 * sc, oy = (H - (y1 - y0) * sc) / 2 - y0 * sc;
  const X = (p) => (ox + km(p)[0] * sc).toFixed(1), Y = (p) => (oy + km(p)[1] * sc).toFixed(1);
  const out = [];

  // graticule
  const lonAt = (x) => o.lon + (x - ox) / sc / kx, latAt = (y) => o.lat - (y - oy) / sc / ky;
  const span = Math.max(lonAt(W) - lonAt(0), latAt(0) - latAt(H));
  const step = span > 4 ? 1 : 0.5;
  for (let lon = Math.ceil(lonAt(0) / step) * step; lon < lonAt(W); lon += step) {
    const x = X({ lon, lat: o.lat });
    out.push(`<line class="grat" x1="${x}" x2="${x}" y1="0" y2="${H}"/><text class="grat-t" x="${+x + 3}" y="${H - 6}">${lon.toFixed(1)}°E</text>`);
  }
  for (let lat = Math.ceil(latAt(H) / step) * step; lat < latAt(0); lat += step) {
    const y = Y({ lon: o.lon, lat });
    out.push(`<line class="grat" x1="0" x2="${W}" y1="${y}" y2="${y}"/><text class="grat-t" x="4" y="${+y - 3}">${lat.toFixed(1)}°N</text>`);
  }

  // corridor + path (path[0] is the school at arrival time, then back in time)
  const line = path.map((p) => `${X(p)},${Y(p)}`).join(" ");
  const cw = (2 * (tr.params?.corridor_km || 25) * sc).toFixed(1);
  out.push(`<polyline class="corridor" points="${line}" stroke-width="${cw}"/>`);
  out.push(`<polyline class="path" points="${line}"/>`);
  const t0 = Date.parse(path[0].time);
  for (let i = 1; i < path.length; i++) {
    const hrs = Math.round((t0 - Date.parse(path[i].time)) / 3600000);
    const prev = Math.round((t0 - Date.parse(path[i - 1].time)) / 3600000);
    if (hrs % 6 === 0 && hrs !== prev) {
      out.push(`<circle class="tick" cx="${X(path[i])}" cy="${Y(path[i])}" r="3.5"/>` +
        (i === path.length - 1 ? `<text class="tick-t" x="${+X(path[i]) + 8}" y="${+Y(path[i]) + 4}">−${hrs} h</text>` : ""));
    }
    if (i % 4 === 2) {          // arrows point the way the air moves: towards the school
      const a = path[i], b = path[i - 1];
      const ang = (Math.atan2(+Y(b) - +Y(a), +X(b) - +X(a)) * 180) / Math.PI;
      out.push(`<path class="arrow" d="M-5,-4 L3,0 L-5,4 Z" transform="translate(${X(a)},${Y(a)}) rotate(${ang.toFixed(0)})"/>`);
    }
  }

  // fires, largest first so small ones stay on top
  for (const f of [...fires].sort((a, b) => b.frp_mw - a.frp_mw)) {
    const r = (3.5 + Math.sqrt(f.frp_mw) * 1.3).toFixed(1);
    const tip = `${f.district || ""}${f.state ? ", " + f.state : ""}\n${fmt(f.frp_mw, 1)} MW · ${istTime(f.acq_time)} IST\n` +
      `${fmt(f.hours_before_arrival, 1)} h before arrival · ${fmt(f.distance_km, 1)} km from the path`;
    out.push(`<circle class="fire" cx="${X(f)}" cy="${Y(f)}" r="${r}"><title>${esc(tip)}</title></circle>`);
  }

  // district labels at the centroid of their matched fires
  for (const d of tr.by_district || []) {
    const mine = fires.filter((f) => f.district === d.district);
    if (!mine.length) continue;
    const c = { lon: mine.reduce((a, f) => a + f.lon, 0) / mine.length, lat: Math.max(...mine.map((f) => f.lat)) };
    const name = hi() ? d.district_hi || d.district : d.district;
    const n = hi() ? `${d.fire_count} आग` : `${d.fire_count} fire${d.fire_count === 1 ? "" : "s"}`;
    out.push(`<text class="dist" x="${X(c)}" y="${+Y(c) - 14}" text-anchor="middle">${esc(name)} · ${esc(n)}</text>`);
  }

  // school
  const school = state.schools.find((x) => x.id === state.school);
  const label = school ? school.name.split(",")[0] : s().school;
  const sx = +X(o), sy = +Y(o), right = sx < W - 170;
  out.push(`<circle class="school" cx="${sx}" cy="${sy}" r="7"/>` +
    `<text class="school-t" x="${right ? sx + 12 : sx - 12}" y="${sy + 4}" text-anchor="${right ? "start" : "end"}">${esc(label)}</text>`);

  // scale bar + north
  const bar = [100, 50, 20, 10].find((k) => k * sc <= 140) || 10;
  out.push(`<g class="scale" transform="translate(${P},${H - 26})"><line x1="0" x2="${(bar * sc).toFixed(1)}" y1="0" y2="0"/>` +
    `<line x1="0" x2="0" y1="-4" y2="4"/><line x1="${(bar * sc).toFixed(1)}" x2="${(bar * sc).toFixed(1)}" y1="-4" y2="4"/>` +
    `<text x="0" y="-8">${bar} km</text></g>`);
  out.push(`<g class="north" transform="translate(${W - 22},24)"><path d="M0,-12 L6,6 L0,2 L-6,6 Z"/><text y="20" text-anchor="middle">N</text></g>`);

  const alt = `${tr.smoke_likely ? s().smoke_likely : s().smoke_unlikely}: ${tr.fire_count} fires, ${fmt(tr.frp_total_mw)} MW`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}">${out.join("")}</svg>`;
}

/* ── render: 24 h chart ──────────────────────────────────────────────────── */

function renderChart() {
  const fc = state.aq?.forecast || [];
  const box = $("chart");
  if (!fc.length) {
    box.replaceChildren(el("p", { class: "err", text: s().failed }));
    return;
  }
  const W = Math.max(300, Math.round(box.clientWidth || 760)), H = W < 560 ? 200 : 230, L = 32, R = 50, Tm = 12, B = 26;
  const pw = W - L - R, ph = H - Tm - B, band = pw / fc.length;
  const bw = Math.min(24, band - 2);
  const top = Math.max(200, Math.ceil((Math.max(...fc.map((h) => h.aqi)) + 25) / 50) * 50);
  const y = (v) => Tm + ph - (v / top) * ph;
  const t0 = Date.parse(fc[0].hour);
  const xAt = (ms) => L + ((ms - t0) / 3600000) * band;
  const out = [];

  // school hours, from the earliest slot start to the latest slot end (IST on the plan day)
  const sched = state.basis?.schedule || [];
  if (sched.length && state.basis?.date) {
    const ms = (hhmm) => Date.parse(`${state.basis.date}T${hhmm}:00+05:30`);
    const a = Math.max(L, xAt(Math.min(...sched.map((x) => ms(x.start)))));
    const b = Math.min(L + pw, xAt(Math.max(...sched.map((x) => ms(x.end)))));
    if (b > a) out.push(`<rect class="hours" x="${a.toFixed(1)}" y="${Tm}" width="${(b - a).toFixed(1)}" height="${ph}"/>`);
  }
  for (let v = 0; v <= top; v += 50) {
    out.push(`<line class="grid" x1="${L}" x2="${L + pw}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`);
  }
  fc.forEach((h, i) => {
    const cx = L + band * i + band / 2, x = cx - bw / 2, yt = y(h.aqi), bh = Tm + ph - yt, r = Math.min(4, bh);
    out.push(`<path class="bar" data-i="${i}" style="fill:var(${cat(h.category)[2]})" d="M${x},${Tm + ph} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${Tm + ph} Z"/>`);
    if (i % (W < 560 ? 6 : 3) === 0) out.push(`<text class="ax" x="${cx}" y="${H - 9}" text-anchor="middle">${istTime(h.hour)}</text>`);
  });
  out.push(`<line class="ref" x1="${L}" x2="${L + pw}" y1="${y(100)}" y2="${y(100)}"/><text class="ref-t" x="${L + pw + 6}" y="${y(100) + 4}">AQI 100</text>`);
  fc.forEach((h, i) => out.push(`<rect class="hit" data-i="${i}" tabindex="0" x="${L + band * i}" y="${Tm}" width="${band}" height="${ph}"><title>${esc(tipText(h))}</title></rect>`));

  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(hi() ? T.hi.forecast : "Next 24 hours")}">${out.join("")}</svg>`;
  const present = [...new Set(fc.map((h) => h.category))].sort((a, b) => Object.keys(CATEGORY).indexOf(a) - Object.keys(CATEGORY).indexOf(b));
  const legend = el("div", { class: "legend" }, present.map((c) =>
    el("span", {}, el("i", { style: `background:var(${cat(c)[2]})` }), pick(cat(c)))));
  const table = el("details", { class: "table" }, el("summary", { text: s().table }),
    el("table", {},
      el("thead", {}, el("tr", {}, el("th", { text: s().hour }), el("th", { text: "AQI" }), el("th", { text: "PM2.5 µg/m³" }), el("th", { text: s().category }))),
      el("tbody", {}, fc.map((h) => el("tr", {},
        el("td", { text: istTime(h.hour) }), el("td", { text: fmt(h.aqi) }), el("td", { text: fmt(h.pm25, 1) }), el("td", { text: pick(cat(h.category)) }))))));
  const tip = el("div", { class: "tip", hidden: true });
  const wrap = el("div", { class: "plot" }, tip);
  wrap.insertAdjacentHTML("afterbegin", svg);
  box.replaceChildren(wrap, legend, table);

  const show = (rect) => {
    const i = +rect.dataset.i, h = fc[i];
    wrap.querySelectorAll(".bar").forEach((b) => b.classList.toggle("on", +b.dataset.i === i));
    tip.replaceChildren(el("strong", { text: `AQI ${fmt(h.aqi)}` }), el("span", { text: ` · ${pick(cat(h.category))}` }),
      el("br"), el("span", { class: "muted", text: `${istTime(h.hour)} IST · PM2.5 ${fmt(h.pm25, 1)} µg/m³` }));
    tip.hidden = false;
    const r = wrap.getBoundingClientRect(), rr = rect.getBoundingClientRect();
    const left = rr.left - r.left + rr.width / 2;
    tip.style.left = `${Math.min(Math.max(left, 80), r.width - 80)}px`;
  };
  const hide = () => { tip.hidden = true; wrap.querySelectorAll(".bar.on").forEach((b) => b.classList.remove("on")); };
  wrap.querySelectorAll(".hit").forEach((rect) => {
    rect.querySelector("title").remove();      // the HTML tooltip replaces the native one
    rect.addEventListener("pointerenter", () => show(rect));
    rect.addEventListener("focus", () => show(rect));
    rect.addEventListener("blur", hide);
  });
  wrap.addEventListener("pointerleave", hide);
}
const tipText = (h) => `${istTime(h.hour)} IST · AQI ${h.aqi} (${pick(cat(h.category))}) · PM2.5 ${h.pm25} µg/m³`;

function flashHour(i) {
  const b = document.querySelector(`#chart .bar[data-i="${i}"]`);
  if (!b) return;
  b.classList.remove("flash");
  void b.getBoundingClientRect();
  b.classList.add("flash");
  const hit = document.querySelector(`#chart .hit[data-i="${i}"]`);
  if (hit) hit.dispatchEvent(new Event("pointerenter"));
}

/* ── render: notices, alerts ─────────────────────────────────────────────── */

function renderNotices() {
  const list = state.notices?.notices;
  if (!list) {
    $("notices").replaceChildren(el("p", { class: "err", text: s().failed }));
    return;
  }
  // the reader's language first, then the other one
  const sorted = [...list].sort((a, b) => (a.lang === state.lang ? -1 : 0) - (b.lang === state.lang ? -1 : 0));
  $("notices").replaceChildren(...sorted.map((n) => {
    const body = el("div", { class: "body", lang: n.lang });
    body.innerHTML = mdToHtml(n.body);
    return el("article", { class: `notice ${n.severity}`, lang: n.lang },
      el("h3", { text: n.title }),
      el("p", { class: "muted tiny", text: `${n.lang === "hi" ? "हिंदी" : "English"} · ${pick(SEVERITY[n.severity] || [n.severity, n.severity])}` + (n.expires_at ? ` · ${s().expires} ${istTime(n.expires_at)} IST` : "") }),
      body,
      el("div", { class: "row" },
        el("button", { class: "btn ghost", type: "button", text: s().copy, onclick: () => copyText(`${n.title}\n\n${mdPlain(n.body)}`) }),
        el("a", { class: "btn ghost", href: "https://wa.me/?text=" + encodeURIComponent(`*${n.title}*\n\n${mdWhatsApp(n.body)}`), target: "_blank", rel: "noopener", text: s().whatsapp })));
  }));
}

function renderAlerts() {
  const list = state.alerts?.alerts;
  if (!list) {
    $("alerts").replaceChildren(el("li", { class: "err", text: s().failed }));
    $("email").hidden = true;
    return;
  }
  if (!list.length) {
    $("alerts").replaceChildren(el("li", { class: "empty", text: s().no_alerts }));
    $("email").hidden = true;
    return;
  }
  if (!list.some((a) => a.id === state.emailId)) state.emailId = list[0].id;
  $("alerts").replaceChildren(...list.map((a) => el("li", {},
    el("button", { type: "button", "aria-pressed": String(a.id === state.emailId), onclick: () => { state.emailId = a.id; renderAlerts(); } },
      a.subject,
      el("span", { class: "meta", text: `${istTime(a.sent_at)} IST · ${s().trigger[a.trigger] || a.trigger} · ${s().via} ${(a.delivered_via || []).join(", ") || a.channel}` })))));
  const a = list.find((x) => x.id === state.emailId);
  $("email").textContent = `Subject: ${a.subject}\n\n${a.text || ""}`;
  $("email").hidden = false;
}

function renderAll() {
  renderStatic();
  renderHeader();
  renderHero();
  renderPlan();
  renderSmoke();
  renderChart();
  renderNotices();
  renderAlerts();
}

/* ── data ────────────────────────────────────────────────────────────────── */

const LOADERS = {
  aq: (id) => api(`/schools/${id}/air-quality`),
  protocol: (id) => api(`/schools/${id}/protocol`),
  smoke: (id) => api(`/schools/${id}/smoke`),
  notices: (id) => api(`/schools/${id}/notices?lang=en,hi`),
  alerts: (id) => api(`/schools/${id}/alerts`),
  basis: (id) => api(`/schools/${id}/basis`),
};

async function load(keys = Object.keys(LOADERS)) {
  const id = state.school;
  const results = await Promise.allSettled(keys.map((k) => LOADERS[k](id)));
  if (id !== state.school) return;          // the user switched school meanwhile
  keys.forEach((k, i) => {
    const r = results[i];
    state[k] = r.status === "fulfilled" ? r.value : null;
    state.errors[k] = r.status === "rejected" ? r.reason.message : null;
  });
  renderAll();
}

async function selectSchool(id) {
  state.school = id;
  store("school", id);
  $("school").value = id;
  Object.assign(state, { aq: null, protocol: null, smoke: null, notices: null, alerts: null, basis: null, emailId: null });
  await load();
}

async function init() {
  renderStatic();
  try {
    state.schools = (await api("/schools")).schools || [];
  } catch (_) {
    state.errors.down = true;
    renderAll();
    return;
  }
  $("school").replaceChildren(...state.schools.map((x) => el("option", { value: x.id, text: x.name })));
  const ids = state.schools.map((x) => x.id);
  if (!ids.includes(state.school)) state.school = ids.includes(DEFAULT_SCHOOL) ? DEFAULT_SCHOOL : ids[0];
  if (state.school) await selectSchool(state.school);
}

/* ── events ──────────────────────────────────────────────────────────────── */

$("school").addEventListener("change", (e) => selectSchool(e.target.value));
for (const b of document.querySelectorAll("[data-lang]")) {
  b.addEventListener("click", () => {
    state.lang = b.dataset.lang;
    store("lang", state.lang);
    renderAll();
  });
}
for (const b of document.querySelectorAll("[data-trace]")) b.addEventListener("click", () => setTrace(b.dataset.trace));

$("regen").addEventListener("click", (e) => busy(e.currentTarget, s().regenerating, async () => {
  try {
    state.protocol = await api(`/schools/${state.school}/protocol`, { method: "POST" });
    await load(["notices", "basis"]);
    toast(s().regenerated);
  } catch (err) { toast(err.message); }
}));

$("send-alert").addEventListener("click", (e) => busy(e.currentTarget, s().sending, async () => {
  try {
    const a = await api(`/schools/${state.school}/alerts`, { method: "POST" });
    state.emailId = a.id;
    await load(["alerts"]);
    toast(`${s().sent} ${s().via} ${(a.delivered_via || []).join(", ")}`);
  } catch (err) { toast(err.message); }
}));

$("run-job").addEventListener("click", (e) => busy(e.currentTarget, s().running, async () => {
  try {
    const r = await api("/jobs/daily", { method: "POST" });
    state.emailId = null;
    await load(["protocol", "notices", "alerts", "basis"]);
    toast(s().job_done(r.results.length, r.results.filter((x) => x.error).length));
  } catch (err) { toast(err.message); }
}));

let lastWidth = innerWidth, resizeTimer;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (innerWidth === lastWidth) return;
    lastWidth = innerWidth;
    renderSmoke();
    renderChart();
  }, 150);
});

init();
