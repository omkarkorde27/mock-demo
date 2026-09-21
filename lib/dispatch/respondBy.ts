import type { DeadlineKind, UrgencyTier } from "../llm/vocab";

/**
 * Tier -> a concrete timestamp. Pure: same inputs, same output, no clock reads.
 * `now` is injected so this is testable and so the eval can replay fixtures.
 *
 * A tier without a timestamp is a vibe. This is where the tier becomes a
 * commitment someone can be held to.
 */

export type Deadline = {
  kind: DeadlineKind;
  at: string | null;
  statedAs: string | null;
};

export type LocationHours = {
  timezone: string; // IANA
  opensAt: string; // "11:00" or "11:00:00"
  closesAt: string;
};

export type RespondByBasis =
  | "p1_immediate"
  | "stated_deadline"
  | "next_open"
  | "next_business_day"
  | "scheduled_week";

export type RespondBy = {
  at: Date;
  basis: RespondByBasis;
  /**
   * True when the model claimed a specific deadline but gave no usable
   * timestamp, so we fell back to the tier default. Surfaced as an assumption,
   * never swallowed.
   */
  degraded: boolean;
  /** True when the computed time had already passed, so it was clamped to now. */
  clamped: boolean;
  leadTimeMinutes: number;
};

/** A tech needs lead time to arrive and finish before the deadline bites. */
export const LEAD_TIME_MINUTES = 60;
const P1_WINDOW_MINUTES = 120;
const MINUTE = 60_000;

// --- timezone helpers -------------------------------------------------------

function partsIn(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Intl can render midnight as "24" in some locales/zones.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = partsIn(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant.getTime();
}

/**
 * Wall-clock time in a zone -> UTC instant. Two passes so that a date landing
 * on a DST transition resolves against the offset in effect at that instant,
 * not the offset in effect now.
 */
function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const pass1 = guess - tzOffsetMs(new Date(guess), timeZone);
  const pass2 = guess - tzOffsetMs(new Date(pass1), timeZone);
  return new Date(pass2);
}

function parseClock(hhmm: string): { hour: number; minute: number } {
  const [h, m] = hhmm.split(":");
  return { hour: Number(h), minute: Number(m ?? 0) };
}

function addDays(
  p: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  d.setUTCDate(d.getUTCDate() + days);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** The next time the doors open, strictly after `now`. */
export function nextOpenAfter(now: Date, loc: LocationHours): Date {
  const { hour, minute } = parseClock(loc.opensAt);
  const today = partsIn(now, loc.timezone);
  const todayOpen = zonedToUtc(
    today.year,
    today.month,
    today.day,
    hour,
    minute,
    loc.timezone,
  );
  if (todayOpen.getTime() > now.getTime()) return todayOpen;
  const t = addDays(today, 1);
  return zonedToUtc(t.year, t.month, t.day, hour, minute, loc.timezone);
}

/** Opening time on the following calendar day. Our locations open daily. */
export function openOnNextDay(now: Date, loc: LocationHours): Date {
  const { hour, minute } = parseClock(loc.opensAt);
  const t = addDays(partsIn(now, loc.timezone), 1);
  return zonedToUtc(t.year, t.month, t.day, hour, minute, loc.timezone);
}

// --- the function ----------------------------------------------------------

/**
 * A stated deadline is usable only if it is present, parseable, and still in
 * the future. `{kind: "absolute", at: null}` -- the model asserting a specific
 * deadline it could not pin to a time, e.g. "thursday" -- is NOT usable, and
 * degrades to the tier default rather than throwing or inventing a timestamp.
 */
function usableStatedDeadline(deadline: Deadline, now: Date): Date | null {
  if (!deadline.at) return null;
  const parsed = new Date(deadline.at);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() <= now.getTime()) return null;
  return parsed;
}

export function respondByFrom(
  tier: UrgencyTier,
  deadline: Deadline,
  loc: LocationHours,
  now: Date,
): RespondBy {
  const finish = (
    at: Date,
    basis: RespondByBasis,
    degraded: boolean,
  ): RespondBy => {
    const clamped = at.getTime() < now.getTime();
    return {
      at: clamped ? new Date(now.getTime()) : at,
      basis,
      degraded,
      clamped,
      leadTimeMinutes: LEAD_TIME_MINUTES,
    };
  };

  if (tier === "P1") {
    // A stated deadline cannot make an emergency less urgent.
    return finish(
      new Date(now.getTime() + P1_WINDOW_MINUTES * MINUTE),
      "p1_immediate",
      false,
    );
  }

  if (tier === "P4") {
    return finish(
      new Date(now.getTime() + 7 * 24 * 60 * MINUTE),
      "scheduled_week",
      false,
    );
  }

  if (tier === "P3") {
    return finish(openOnNextDay(now, loc), "next_business_day", false);
  }

  // ---- P2: whichever bites first, the stated deadline or the next open ----
  const stated = usableStatedDeadline(deadline, now);
  // Only "absolute" promises a specific time. "before_open" with a null `at`
  // is the normal, expected shape -- next_open IS its answer.
  const degraded = deadline.kind === "absolute" && stated === null;

  const open = nextOpenAfter(now, loc);
  const useStated = stated !== null && stated.getTime() < open.getTime();
  const target = useStated ? stated! : open;

  return finish(
    new Date(target.getTime() - LEAD_TIME_MINUTES * MINUTE),
    useStated ? "stated_deadline" : "next_open",
    degraded,
  );
}
