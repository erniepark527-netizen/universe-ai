// ============================================================
// UNIVERSE AI v6.0 — SCHEDULE / publishAt RESOLVER
// Standalone, no deps. Safe to import without touching existing routes.
//
// Cloudflare Workers + YouTube publishAt both run in UTC.
//   - Arabic (AST, constant UTC+3): slots already given in UTC.
//   - English (US Eastern wall-clock): resolved via the ICU tz database
//     (Intl) so EDT/EST flips automatically — no hand-rolled DST math.
// Cron fires PRODUCTION 90 min before the publish slot.
// ============================================================

const PRODUCTION_BUFFER_MIN = 90; // tune freely

// Wall-clock targets. Arabic values are UTC directly (constant +3, no DST).
// English values are America/New_York wall-clock hours, converted at runtime.
const SLOTS = {
  arabic: {
    tz: "Asia/Riyadh",            // UTC+3, no DST
    mode: "utc",                  // hours below are already UTC
    short:    [{ utcHour: 5,  utcMin: 0 }, { utcHour: 17, utcMin: 0 }],
    long:     [{ utcHour: 13, utcMin: 0 }],
    longDays: [2, 5],             // Tue, Fri (local weekday)
  },
  english: {
    tz: "America/New_York",       // EDT/EST auto
    mode: "wallclock",            // hours below are NY wall-clock
    short:    [{ hour: 9, min: 0 }, { hour: 18, min: 0 }],
    long:     [{ hour: 12, min: 0 }],
    longDays: [2, 5],             // Tue, Fri (local weekday)
  },
};

// Minutes that `timeZone` is ahead of UTC at the given instant.
function tzOffsetMinutes(date, timeZone) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const asIfUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asIfUTC - date.getTime()) / 60000;
}

// Weekday (1=Mon..7=Sun) of `date` in `timeZone`.
function localWeekday(date, timeZone) {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[wd];
}

// Build a UTC Date for a wall-clock H:M in `timeZone` on the calendar day of `baseDate`.
function wallClockToUTC(baseDate, hour, min, timeZone) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(baseDate).reduce((a, x) => ((a[x.type] = x.value), a), {});
  const guess = Date.UTC(+p.year, +p.month - 1, +p.day, hour, min, 0);
  const off = tzOffsetMinutes(new Date(guess), timeZone); // exact for daytime slots
  return new Date(guess - off * 60000);
}

// Resolve publishAt (ISO UTC) for a channel/format/slotIndex on baseDate.
// Returns null if it's a long-form request on a non-release day.
function resolvePublishAt(channel, format, slotIndex, baseDate = new Date()) {
  const cfg = SLOTS[channel];
  if (!cfg) throw new Error(`unknown channel: ${channel}`);

  if (format === "long") {
    const wd = localWeekday(baseDate, cfg.tz);
    if (!cfg.longDays.includes(wd)) return null;
  }
  const slot = cfg[format]?.[slotIndex];
  if (!slot) throw new Error(`no ${format} slot #${slotIndex} for ${channel}`);

  const d =
    cfg.mode === "utc"
      ? (() => {
          const p = new Intl.DateTimeFormat("en-US", {
            timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit",
          }).formatToParts(baseDate).reduce((a, x) => ((a[x.type] = x.value), a), {});
          return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, slot.utcHour, slot.utcMin, 0));
        })()
      : wallClockToUTC(baseDate, slot.hour, slot.min, cfg.tz);

  return d.toISOString();
}

// Cron should START production 90 min before publishAt.
function cronFireTimeFor(publishAtISO) {
  return new Date(new Date(publishAtISO).getTime() - PRODUCTION_BUFFER_MIN * 60000).toISOString();
}

// All publishAt slots that should be PRODUCED for `baseDate` (skips off-days).
function dueSlots(baseDate = new Date()) {
  const out = [];
  for (const channel of Object.keys(SLOTS)) {
    for (const format of ["short", "long"]) {
      const arr = SLOTS[channel][format] || [];
      arr.forEach((_, i) => {
        const publishAt = resolvePublishAt(channel, format, i, baseDate);
        if (publishAt) out.push({ channel, format, slot: i, publishAt, cronFire: cronFireTimeFor(publishAt) });
      });
    }
  }
  return out.sort((a, b) => a.publishAt.localeCompare(b.publishAt));
}

export { SLOTS, PRODUCTION_BUFFER_MIN, resolvePublishAt, cronFireTimeFor, dueSlots };
