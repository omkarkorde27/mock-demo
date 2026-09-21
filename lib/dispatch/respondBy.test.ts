import { describe, expect, it } from "vitest";
import { LEAD_TIME_MINUTES, respondByFrom, type Deadline, type LocationHours } from "./respondBy";

const HARBOR: LocationHours = {
  timezone: "America/New_York",
  opensAt: "11:00",
  closesAt: "22:00",
};

const NONE: Deadline = { kind: "none", at: null, statedAs: null };
const iso = (d: Date) => d.toISOString();

// 2026-09-20 is EDT (UTC-4), so 11:00 local == 15:00Z, minus 60m lead == 14:00Z.
const OVERNIGHT = new Date("2026-09-20T06:00:00Z"); // 02:00 local

describe("P2 deadline handling", () => {
  it("before_open with a null `at` is the normal shape, not a degradation", () => {
    const r = respondByFrom("P2", { kind: "before_open", at: null, statedAs: "we open at 11" }, HARBOR, OVERNIGHT);
    expect(iso(r.at)).toBe("2026-09-20T14:00:00.000Z"); // 10:00 local
    expect(r.basis).toBe("next_open");
    expect(r.degraded).toBe(false);
  });

  // The case this was written to fix: the model asserted a specific deadline
  // ("thursday") but gave no timestamp.
  it('absolute with a null `at` degrades to next-open, flagged, never throws', () => {
    const r = respondByFrom("P2", { kind: "absolute", at: null, statedAs: "health inspector thursday" }, HARBOR, OVERNIGHT);
    expect(iso(r.at)).toBe("2026-09-20T14:00:00.000Z"); // identical to the default
    expect(r.basis).toBe("next_open");
    expect(r.degraded).toBe(true); // surfaced as an assumption, not swallowed
  });

  it("an unparseable `at` degrades the same way", () => {
    const r = respondByFrom("P2", { kind: "absolute", at: "thursday", statedAs: "thursday" }, HARBOR, OVERNIGHT);
    expect(iso(r.at)).toBe("2026-09-20T14:00:00.000Z");
    expect(r.degraded).toBe(true);
  });

  it("an `at` already in the past degrades rather than producing a past deadline", () => {
    const r = respondByFrom("P2", { kind: "absolute", at: "2026-09-19T12:00:00Z", statedAs: "yesterday" }, HARBOR, OVERNIGHT);
    expect(iso(r.at)).toBe("2026-09-20T14:00:00.000Z");
    expect(r.degraded).toBe(true);
  });

  it("a stated deadline that bites before opening wins", () => {
    // 08:00 local catering order == 12:00Z, minus lead == 11:00Z
    const r = respondByFrom("P2", { kind: "absolute", at: "2026-09-20T12:00:00Z", statedAs: "catering at 8" }, HARBOR, OVERNIGHT);
    expect(iso(r.at)).toBe("2026-09-20T11:00:00.000Z");
    expect(r.basis).toBe("stated_deadline");
    expect(r.degraded).toBe(false);
  });

  it("a stated deadline after opening loses to the open time (min rule)", () => {
    const r = respondByFrom("P2", { kind: "absolute", at: "2026-09-20T20:00:00Z", statedAs: "by 4pm" }, HARBOR, OVERNIGHT);
    expect(iso(r.at)).toBe("2026-09-20T14:00:00.000Z");
    expect(r.basis).toBe("next_open");
  });

  it("clamps to now rather than returning a time already past", () => {
    const halfHourBeforeOpen = new Date("2026-09-20T14:30:00Z");
    const r = respondByFrom("P2", NONE, HARBOR, halfHourBeforeOpen);
    expect(iso(r.at)).toBe(iso(halfHourBeforeOpen));
    expect(r.clamped).toBe(true);
  });
});

describe("other tiers", () => {
  it("P1 is now + 2h and ignores any stated deadline", () => {
    const r = respondByFrom("P1", { kind: "absolute", at: "2026-09-25T12:00:00Z", statedAs: "next week" }, HARBOR, OVERNIGHT);
    expect(iso(r.at)).toBe("2026-09-20T08:00:00.000Z");
    expect(r.basis).toBe("p1_immediate");
  });

  it("P3 is the next day's opening", () => {
    const r = respondByFrom("P3", NONE, HARBOR, OVERNIGHT);
    expect(iso(r.at)).toBe("2026-09-21T15:00:00.000Z");
  });

  it("P4 is a week out", () => {
    const r = respondByFrom("P4", NONE, HARBOR, OVERNIGHT);
    expect(iso(r.at)).toBe("2026-09-27T06:00:00.000Z");
  });
});

describe("daylight saving transitions", () => {
  it("spring forward: 11:00 local resolves as EDT", () => {
    // DST begins 2027-03-14. 11:00 EDT == 15:00Z.
    const r = respondByFrom("P2", NONE, HARBOR, new Date("2027-03-13T20:00:00Z"));
    expect(iso(r.at)).toBe("2027-03-14T14:00:00.000Z");
  });

  it("fall back: 11:00 local resolves as EST", () => {
    // DST ends 2026-11-01. 11:00 EST == 16:00Z, minus lead == 15:00Z.
    const r = respondByFrom("P2", NONE, HARBOR, new Date("2026-10-31T20:00:00Z"));
    expect(iso(r.at)).toBe("2026-11-01T15:00:00.000Z");
  });

  it("honours a different timezone for a different location", () => {
    const denver: LocationHours = { timezone: "America/Denver", opensAt: "07:00", closesAt: "21:00" };
    // 07:00 MDT == 13:00Z, minus lead == 12:00Z
    const r = respondByFrom("P2", NONE, denver, new Date("2026-09-20T06:00:00Z"));
    expect(iso(r.at)).toBe("2026-09-20T12:00:00.000Z");
  });
});

describe("invariants", () => {
  it("never returns a time before now, for any tier or deadline shape", () => {
    const shapes: Deadline[] = [
      NONE,
      { kind: "before_open", at: null, statedAs: null },
      { kind: "absolute", at: null, statedAs: "thursday" },
      { kind: "absolute", at: "not a date", statedAs: "x" },
      { kind: "absolute", at: "2020-01-01T00:00:00Z", statedAs: "ages ago" },
    ];
    const times = ["2026-09-20T06:00:00Z", "2026-09-20T14:30:00Z", "2026-09-20T23:00:00Z"];
    for (const tier of ["P1", "P2", "P3", "P4"] as const) {
      for (const d of shapes) {
        for (const t of times) {
          const now = new Date(t);
          const r = respondByFrom(tier, d, HARBOR, now);
          expect(r.at.getTime()).toBeGreaterThanOrEqual(now.getTime());
          expect(Number.isNaN(r.at.getTime())).toBe(false);
          expect(r.leadTimeMinutes).toBe(LEAD_TIME_MINUTES);
        }
      }
    }
  });
});
