import React, { useEffect, useMemo, useRef, useState } from "react";

const [feedStatus, setFeedStatus] = useState({ ok: [], fail: [] });

import { QRCodeCanvas } from "qrcode.react";




// === HOW TO USE ===
// 1) Replace ICS_FEED_URL with an ICS link from Sun Devil Central filtered to Downtown Phoenix Campus.
//    Tip: If the feed doesn't allow CORS from your host, set USE_CORS_PROXY=true to route via a public read-only proxy.
// 2) Deploy this single file with any React/Vite/Next app, or use CodeSandbox. Tailwind is optional; basic styles are inline.
// 3) This widget auto-rotates through upcoming events and can be paused with the Play/Pause control.

// === CONFIG ===
// === CONFIG ===
const ICS_FEED_URLS = [
  "https://sundevilcentral.eoss.asu.edu/ical/arizonau/ical_club_35747.ics",
  "https://sundevilcentral.eoss.asu.edu/ical/arizonau/ical_club_35683.ics",
  "https://sundevilcentral.eoss.asu.edu/ical/arizonau/ical_club_35594.ics",
  "https://sundevilcentral.eoss.asu.edu/ical/arizonau/ical_club_35557.ics",
  "https://sundevilcentral.eoss.asu.edu/ics?uid=8a6cb2ad-7932-11f0-b758-0ea371ea8909&type=group&eid=0a91a3d2a3d809a0fb59d96bda829dea",
  "https://sundevilcentral.eoss.asu.edu/ical/arizonau/ical_club_35845.ics",
  "https://sundevilcentral.eoss.asu.edu/ical/arizonau/ical_club_35892.ics",
  "https://sundevilcentral.eoss.asu.edu/ical/arizonau/ical_club_35797.ics",
  "https://sundevilcentral.eoss.asu.edu/ical/arizonau/ical_club_35781.ics",
  "https://sundevilcentral.eoss.asu.edu/ical/arizonau/ical_club_35517.ics"
];
const USE_CORS_PROXY = false; 
 // set to false if your ICS feed supports CORS from your host
const CORS_PROXY = "https://r.jina.ai/http/"; // simple read-only proxy for public content
const CAMPUS_FILTER_KEYWORDS = [
  // Events must include one of these keywords in LOCATION or DESCRIPTION or SUMMARY
  "Downtown Phoenix",
  "DPC",
  "Phoenix Biomedical Campus",
  "ASU Downtown",
];
const MAX_EVENTS = 25; // cap list length
const ROTATE_MS = 6000; // 6 seconds per card

// === Minimal ICS parser (handles common VEVENT fields) ===
function parseICS(icsText) {
   // NEW: force to a string so replaceAll never crashes
  icsText = typeof icsText === "string" ? icsText : String(icsText || "");

  const lines = icsText
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .reduce((acc, line) => {
      if (line.startsWith(" ") || line.startsWith("\t")) {
        // folded line; append to previous
        acc[acc.length - 1] = (acc[acc.length - 1] || "") + line.slice(1);
      } else acc.push(line);
      return acc;
    }, []);

  const events = [];
  let cur = null;

  const decode = (val) => val?.replaceAll("\\n", "\n");

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") {
      cur = {};
    } else if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
    } else if (cur) {
const [k, ...rest] = line.split(":");
const value = rest.join(":");
const [prop, ...params] = k.split(";");
const key = prop; // e.g., "DTSTART", "DTEND", "SUMMARY"
const tzidParam = params.find(p => p.startsWith("TZID="));
const tzid = tzidParam ? tzidParam.replace(/^TZID=/, "") : undefined;

switch (key) {
  case "UID":
    cur.uid = value;
    break;
  case "DTSTART":
    cur.dtstart = value;
    if (tzid) cur.dtstart_tzid = tzid;
    break;
  case "DTEND":
    cur.dtend = value;
    if (tzid) cur.dtend_tzid = tzid;
    break;
  case "SUMMARY":
    cur.summary = decode(value);
    break;
  case "LOCATION":
    cur.location = decode(value);
    break;
  case "DESCRIPTION":
    cur.description = decode(value);
    break;
  case "URL":
    if (!cur.url && value?.startsWith("http")) cur.url = value;
    break;
  default:
    // Handle special cases where VALUE=DATE was attached in key
    if (prop.startsWith("DTSTART")) {
      cur.dtstart = value;
      if (tzid) cur.dtstart_tzid = tzid;
    } else if (prop.startsWith("DTEND")) {
      cur.dtend = value;
      if (tzid) cur.dtend_tzid = tzid;
    }
    break;
}

    }
  }
  return events;
}

function parseIcsDate(value, tzid, { isEnd = false } = {}) {
  if (!value) return null;

  // Case A: date-only (YYYYMMDD)
  if (/^\d{8}$/.test(value)) {
    const y = +value.slice(0, 4);
    const m = +value.slice(4, 6) - 1; // 0-based
    const d = +value.slice(6, 8);
    // Treat as local "all day" in America/Phoenix (browser local time is OK here)
    // For DTEND on all-day, ICS is usually exclusive; if end missing, add 1 day.
    const date = new Date(y, m, d, 0, 0, 0);
    if (isEnd) {
      // end for all-day: end of day (or exclusive next day if feed provided that)
      return new Date(y, m, d, 23, 59, 59);
    }
    return date;
  }

  // Case B: date-time UTC (YYYYMMDDTHHMMSSZ)
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const y = +value.slice(0, 4);
    const m = +value.slice(4, 6) - 1;
    const d = +value.slice(6, 8);
    const hh = +value.slice(9, 11);
    const mm = +value.slice(11, 13);
    const ss = +value.slice(13, 15);
    return new Date(Date.UTC(y, m, d, hh, mm, ss));
  }

  // Case C: date-time local / with TZID=America/Phoenix
  // If TZID is present, we assume the wall clock of that zone. JS Date uses local timezone,
  // but for DPC this is typically America/Phoenix. We'll parse components as local wall time.
  if (/^\d{8}T\d{6}$/.test(value)) {
    const y = +value.slice(0, 4);
    const m = +value.slice(4, 6) - 1;
    const d = +value.slice(6, 8);
    const hh = +value.slice(9, 11);
    const mm = +value.slice(11, 13);
    const ss = +value.slice(13, 15);
    return new Date(y, m, d, hh, mm, ss);
  }

  // Fallback: let Date try; if it fails, return null (NOT "now")
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}


function formatRange(start, end, tz = "America/Phoenix", { allDay = false } = {}) {
  if (!start) return "";
  if (allDay) {
    const opts = { weekday: "short", month: "short", day: "numeric", timeZone: tz };
    return `${start.toLocaleDateString(undefined, opts)} · All day`;
  }
  const optsDate = { weekday: "short", month: "short", day: "numeric", timeZone: tz };
  const optsTime = { hour: "numeric", minute: "2-digit", timeZone: tz };
  const s = start; const e = end || start;
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay
    ? `${s.toLocaleDateString(undefined, optsDate)} · ${s.toLocaleTimeString(undefined, optsTime)} – ${e.toLocaleTimeString(undefined, optsTime)}`
    : `${s.toLocaleDateString(undefined, optsDate)} ${s.toLocaleTimeString(undefined, optsTime)} – ${e.toLocaleDateString(undefined, optsDate)} ${e.toLocaleTimeString(undefined, optsTime)}`;
}


function matchesCampus(e) {
  const hay = `${e.summary || ""}\n${e.location || ""}\n${e.description || ""}`.toLowerCase();
  return CAMPUS_FILTER_KEYWORDS.some((k) => hay.includes(k.toLowerCase()));
}

function useInterval(callback, delay) {
  const savedRef = useRef(null);
  useEffect(() => {
    savedRef.current = callback;
  }, [callback]);
  useEffect(() => {
    if (delay == null) return;
    const id = setInterval(() => savedRef.current && savedRef.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

export default function EventsRotator() {
  const [sourceCounts, setSourceCounts] = useState({});
  const [rawICS, setRawICS] = useState("");
  const counts = {};
for (const e of deduped) {
  counts[e.sourceId] = (counts[e.sourceId] || 0) + 1;
}
setSourceCounts(counts);

  const [events, setEvents] = useState([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState("");

const feedUrls = useMemo(() => {
  // Build three routes for EVERY original URL:
  //  1) Via Netlify function (/ics-proxy/*)
  //  2) Via external read-only proxy (r.jina.ai)
  //  3) Direct https://
  const makeCandidates = (u) => {
    if (!u) return [];
    const https = u.replace(/^webcal:/i, "https:");
    const cleanHostPath = https.replace(/^https?:\/\//, "");
    const fnPath = https.replace(/^https?:\/\/sundevilcentral\.eoss\.asu\.edu/i, ""); // /ical/... or /ics?...

    const functionUrl  = `/ics-proxy${fnPath}`;
    const externalUrl  = `https://r.jina.ai/http/${cleanHostPath}`;
    const directUrl    = https;

    return [functionUrl, externalUrl, directUrl];
  };

  const sourceIdFor = (u) => {
    try {
      const url = new URL(u);
      const qp = url.searchParams;
      if (qp.get("eid")) return `eid:${qp.get("eid")}`;
      if (qp.get("uid")) return `uid:${qp.get("uid")}`;
      const parts = url.pathname.split("/");
      const last = parts[parts.length - 1] || "";
      return last.replace(/\.ics$/i, "") || url.host;
    } catch {
      return String(u).slice(-32);
    }
  };

  return (ICS_FEED_URLS || []).filter(Boolean).map((orig) => ({
    id: sourceIdFor(orig),
    candidates: makeCandidates(orig),
    orig,
  }));
}, []);







useEffect(() => {
  async function loadAll() {
    try {
      setError("");
      if (!feedUrls?.length) { setError("No feed URLs configured"); return; }

      const looksLikeICS = (t) =>
        typeof t === "string" && (t.startsWith("BEGIN:VCALENDAR") || t.includes("\nBEGIN:VEVENT"));

      // Try up to 3 paths for each original feed: Netlify function → external → direct
      const fetchOne = async ({ id, candidates }) => {
        for (const url of candidates) {
          try {
            const res = await fetch(url);
            if (!res.ok) { console.warn("FEED FAIL", id, res.status, url); continue; }
            const text = await res.text();
            if (looksLikeICS(text)) {
              console.log("FEED OK", id, url);
              return { id, text, okUrl: url };
            } else {
              console.warn("FEED NON-ICS", id, url);
            }
          } catch (e) {
            console.warn("FEED ERROR", id, url, e);
          }
        }
        return { id, text: "", okUrl: "" };
      };

      const results = await Promise.all(feedUrls.map(fetchOne));
      const good = results.filter(r => r.text && r.text.trim().length > 0);
      const okIds = good.map(g => g.id);
      const failIds = feedUrls.map(f => f.id).filter(id => !okIds.includes(id));

      setFeedStatus({ ok: okIds, fail: failIds });

      if (!good.length) { setError("No feeds loaded"); setRawICS([]); return; }

      // Keep [{id, text}] so the parser can tag sourceId
      setRawICS(good);
    } catch (e) {
      setError(String(e));
      setRawICS([]);
      setFeedStatus({ ok: [], fail: feedUrls.map(f => f.id) });
    }
  }
  loadAll();
}, [feedUrls]);








useEffect(() => {
  if (!rawICS || (Array.isArray(rawICS) && rawICS.length === 0)) return;

  const parsedAll = (Array.isArray(rawICS) ? rawICS : [rawICS]).flatMap(({ id, text }) => {
    const items = parseICS(text).map((e) => {
      const start = parseIcsDate(e.dtstart, e.dtstart_tzid, { isEnd: false });
      const end = parseIcsDate(e.dtend || e.dtstart, e.dtend_tzid, { isEnd: true });
      const allDay = /^\d{8}$/.test(e.dtstart) && (!e.dtend || /^\d{8}$/.test(e.dtend));
      return { ...e, start, end, allDay, sourceId: id };
    });
    return items;
  });

  const valid = parsedAll.filter((e) => e.start && e.end);
  const timeFiltered = valid.filter((e) => (e.end || e.start) >= new Date(Date.now() - 1000 * 60 * 60));
  const campusFiltered = timeFiltered; // keep campus filter off while verifying

  const bySource = campusFiltered.reduce((m, e) => ((m[e.sourceId] = m[e.sourceId] || []).push(e), m), {});
  Object.values(bySource).forEach(arr => arr.sort((a, b) => a.start - b.start));

  // You can keep round-robin or just flatten; to keep *all* events, you can just flatten + sort:
  const flattened = Object.values(bySource).flat().sort((a, b) => a.start - b.start);

  // Deduplicate by UID+start
  const seen = new Set();
  const deduped = [];
  for (const e of flattened) {
    const key = `${e.sourceId}|${e.uid || e.summary || "noid"}|${+e.start}`;

    if (!seen.has(key)) { seen.add(key); deduped.push(e); }
  }

  console.log("Parsed total:", parsedAll.length,
              "Valid:", valid.length,
              "After time filter:", timeFiltered.length,
              "Final:", deduped.length);

  setEvents(deduped.slice(0, MAX_EVENTS));
  setIdx(0);
}, [rawICS]);


  useInterval(() => {
    if (!playing || events.length <= 1) return;
    setIdx((i) => (i + 1) % events.length);
  }, playing ? ROTATE_MS : null);

  const cur = events[idx];

  return (
    <div className="w-full min-h-[320px] grid place-items-center p-4 bg-white">
      <div className="w-full max-w-3xl rounded-2xl shadow-lg border border-gray-200 p-6 relative overflow-hidden">
        <Header total={events.length} index={idx} playing={playing} onToggle={() => setPlaying((p) => !p)} />
          {Object.keys(sourceCounts).length > 0 && (
  <div className="mt-2 text-xs text-gray-700">
    <div className="font-semibold">Feed contributions:</div>
    <div className="flex flex-wrap gap-2 mt-1">
      {Object.entries(sourceCounts).map(([id, n]) => (
        <span key={id} className="px-2 py-0.5 rounded-full border bg-gray-50">
          {id}: {n}
        </span>
      ))}
    </div>
  </div>
)}

        {error && (
          <div className="mt-3 text-sm text-red-600">Error loading feed: {String(error)}</div>
        )}
        {!cur && !error && (
          <Skeleton />
        )}
        {cur && (
          <EventCard event={cur} />
        )}
        <Ticker events={events} activeIndex={idx} onSelect={(i) => setIdx(i)} />
      </div>
    </div>
  );
}

function Header({ total, index, playing, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-xl font-semibold tracking-tight">ASU Downtown · Upcoming Events</h2>
      <div className="flex items-center gap-2 text-sm">
        <span className="px-2 py-1 rounded-full bg-gray-100 border">{total} events</span>
        <span className="px-2 py-1 rounded-full bg-gray-100 border">{index + 1}/{Math.max(1, total)}</span>
        <button onClick={onToggle} className="px-3 py-1 rounded-full border hover:bg-gray-50 active:scale-[0.98]">
          {playing ? "Pause" : "Play"}
        </button>
      </div>
    </div>
  );
}

function EventCard({ event }) {
  const { summary, location, description, start, end, url } = event;
  const range = formatRange(start, end, "America/Phoenix", { allDay: event.allDay });

  const plainDesc = (description || "").replace(/<[^>]+>/g, "").trim();
  return (
    <div className="mt-4">
      <div className="rounded-xl border bg-gradient-to-br from-amber-50 to-white p-5">
        <div className="text-2xl font-bold leading-snug">{summary || "Untitled event"}</div>
        <div className="mt-1 text-gray-700">{range}</div>
        {location && (
          <div className="mt-1 text-gray-700"><span className="font-medium">Location:</span> {location}</div>
        )}
        {plainDesc && (
          <p className="mt-3 text-gray-800 line-clamp-4">{plainDesc}</p>
        )}
<div className="mt-4 flex items-center gap-3">
  {url && (
    <div className="flex flex-col items-center">
      <QRCodeCanvas value={url} size={128} />
      <span className="text-xs text-gray-600 mt-2">Scan for details</span>
    </div>
  )}
</div>

      </div>
    </div>
  );
}

function Ticker({ events, activeIndex, onSelect }) {
  if (!events?.length) return null;
  return (
    <div className="mt-5 grid gap-2">
      <div className="text-xs uppercase tracking-wider text-gray-500">Up next</div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {events.map((e, i) => (
          <button
            key={e.uid || `${e.summary}-${i}`}
            onClick={() => onSelect(i)}
            className={`text-left shrink-0 min-w-[220px] px-3 py-2 rounded-lg border ${i === activeIndex ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-50"}`}
            title={e.summary}
          >
            <div className="text-sm font-semibold line-clamp-1">{e.summary || "Untitled"}</div>
            <div className={`text-xs ${i === activeIndex ? "text-gray-200" : "text-gray-600"}`}>
              {formatRange(e.start, e.end)}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="mt-4 animate-pulse">
      <div className="h-8 w-3/4 bg-gray-200 rounded" />
      <div className="mt-2 h-4 w-52 bg-gray-200 rounded" />
      <div className="mt-5 space-y-2">
        <div className="h-3 w-full bg-gray-200 rounded" />
        <div className="h-3 w-11/12 bg-gray-200 rounded" />
        <div className="h-3 w-10/12 bg-gray-200 rounded" />
      </div>
    </div>
  );
}
