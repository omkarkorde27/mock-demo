import { describe, expect, it } from "vitest";
import { askGate, BOOLEAN_SWEEP_CEILING } from "./askGate";
import { CONFIDENCE_FLOOR } from "./gate";
import type { DispatchFacts } from "./dispatchFor";
import type { LocationHours } from "./respondBy";
import type { AssetResolution, ResolvableAsset } from "./resolveAsset";

const HARBOR: LocationHours = { timezone: "America/New_York", opensAt: "11:00", closesAt: "22:00" };
const NOW = new Date("2026-09-20T06:00:00Z");

const A = (o: Partial<ResolvableAsset> & Pick<ResolvableAsset, "id" | "trade" | "type" | "label">): ResolvableAsset =>
  ({ aliases: [], make: null, model: null, refrigerantType: null, warrantyExpiresOn: null, ...o });

const WALK_IN = A({ id: "w", trade: "refrigeration", type: "walk_in_cooler", label: "Walk-In Cooler — Kitchen Rear",
  make: "Nor-Lake", model: "KLB7746-C", refrigerantType: "R-404A", warrantyExpiresOn: "2027-03-14" });
const REACH_IN = A({ id: "r", trade: "refrigeration", type: "reach_in_cooler", label: "Reach-In Cooler — Cook Line",
  make: "True", model: "T-49-HC", refrigerantType: "R-134a", warrantyExpiresOn: "2024-08-01" });

const AMBIGUOUS: AssetResolution = { kind: "ambiguous_same_trade", trade: "refrigeration", candidates: [WALK_IN, REACH_IN] };
const MATCHED: AssetResolution = { kind: "match", asset: WALK_IN, matchedOn: "walk in", tradeDisagreement: null };

const facts = (o: Partial<DispatchFacts> = {}): DispatchFacts => ({
  safetyHazard: false, serviceBlocking: false, lossInProgress: true,
  equipmentInoperable: true, workaroundExists: false,
  symptomCodes: ["not_holding_temp"],
  deadline: { kind: "before_open", at: null, statedAs: null },
  fallbackTrade: "refrigeration",
  ...o,
});

const run = (o: { confidence: number; uncertainFields?: any[]; resolution?: AssetResolution; f?: Partial<DispatchFacts> }) =>
  askGate({
    facts: facts(o.f), confidence: o.confidence,
    uncertainFields: o.uncertainFields ?? [], resolution: o.resolution ?? MATCHED,
    location: HARBOR, now: NOW,
  });

describe("the flagship question", () => {
  it("asks walk-in or reach-in when the database is ambiguous", () => {
    const r = run({ confidence: 0.7, resolution: AMBIGUOUS });
    expect(r.asked?.field).toBe("asset_identity");
    expect(r.asked?.options.map((o) => o.label)).toEqual([WALK_IN.label, REACH_IN.label]);
  });

  it("names what actually moves -- parts and warranty, from the rows", () => {
    const r = run({ confidence: 0.7, resolution: AMBIGUOUS });
    expect(r.asked?.changes).toEqual(expect.arrayContaining(["bring", "warranty"]));
  });

  it("asks nothing at all when one asset matched cleanly", () => {
    const r = run({ confidence: 0.8, resolution: MATCHED });
    expect(r.asked).toBeNull();
  });
});

describe("suppression, and its proof", () => {
  it("suppresses fields whose candidate values leave the dispatch identical", () => {
    // loss_in_progress fires first, so inoperable/workaround cannot move the tier.
    const r = run({ confidence: 0.5, f: { lossInProgress: true } });
    const fields = r.suppressed.map((s) => s.field);
    expect(fields).toEqual(expect.arrayContaining(["equipmentInoperable", "workaroundExists"]));
  });

  it("states the empty diff as the reason, not an opinion", () => {
    const r = run({ confidence: 0.5, f: { lossInProgress: true } });
    const s = r.suppressed.find((x) => x.field === "workaroundExists")!;
    expect(s.reason).toContain("identical dispatch");
    expect(s.candidatesConsidered).toBe(2);
  });

  it("never asks more than one question", () => {
    const r = run({ confidence: 0.4, resolution: AMBIGUOUS });
    expect(r.asked).not.toBeNull();
    // Everything else that also moved is recorded as suppressed, not asked.
    expect(r.suppressed.length).toBeGreaterThan(0);
  });
});

describe("the deterministic boolean sweep", () => {
  it("does not depend on the model flagging anything", () => {
    const r = run({ confidence: 0.5, uncertainFields: [] });
    const dyn = r.suppressed.filter((s) => s.proof === "diff_empty");
    expect(dyn.length + (r.asked ? 1 : 0)).toBeGreaterThan(0);
  });

  it("fires below the ceiling and stays quiet above it", () => {
    const below = run({ confidence: BOOLEAN_SWEEP_CEILING - 0.01, uncertainFields: [] });
    const above = run({ confidence: BOOLEAN_SWEEP_CEILING + 0.01, uncertainFields: [] });
    // Below the ceiling the booleans get swept, so counterfactual suppressions appear.
    const dynBelow = below.suppressed.filter((s) => s.proof === "diff_empty");
    const dynAbove = above.suppressed.filter((s) => s.proof === "diff_empty");
    expect(dynBelow.length + (below.asked ? 1 : 0)).toBeGreaterThan(0);
    expect(above.asked).toBeNull();
    expect(dynAbove).toEqual([]);
    // Static suppressions are unconditional -- they are not a confidence signal.
    expect(above.suppressed.every((s) => s.proof !== "diff_empty")).toBe(true);
  });

  it("still honours a model flag above the ceiling", () => {
    const r = run({ confidence: 0.9, uncertainFields: ["safety_hazard"] });
    expect(r.asked?.field).toBe("safetyHazard");
  });

  it("is a separate threshold from the dispatch floor", () => {
    expect(BOOLEAN_SWEEP_CEILING).toBeGreaterThan(CONFIDENCE_FLOOR);
  });

  // The real case: cross-trade water-on-floor sits at ~0.55 with a 6/4
  // unstable loss_in_progress that swings P2 <-> P4.
  it("catches the unstable boolean that prompt tightening could not", () => {
    const r = askGate({
      facts: facts({ lossInProgress: true, equipmentInoperable: false, symptomCodes: ["leaking_water"], fallbackTrade: "plumbing" }),
      confidence: 0.55, uncertainFields: ["asset_identity"],
      resolution: { kind: "none", reason: "no_match", trades: ["plumbing"] },
      location: HARBOR, now: NOW,
    });
    const touched = [r.asked?.field, ...r.suppressed.map((s) => s.field)];
    expect(touched).toContain("lossInProgress");
  });
});

describe("the question never blocks", () => {
  it("always returns a usable baseline dispatch", () => {
    for (const c of [0.1, 0.4, 0.55, 0.7, 0.99]) {
      const r = run({ confidence: c, resolution: AMBIGUOUS });
      expect(r.baseline.tier).toBeTruthy();
      expect(Number.isNaN(r.baseline.respondBy.at.getTime())).toBe(false);
    }
  });

  it("assumes the more urgent candidate while unanswered", () => {
    const r = run({ confidence: 0.7, resolution: AMBIGUOUS });
    // Both coolers are P2 here, so the tie breaks by label -- but the baseline
    // must be one of the real candidates, never a null asset.
    expect([WALK_IN.trade, REACH_IN.trade]).toContain(r.baseline.trade);
    expect(r.assumption).toContain("Answer not required");
    // Both coolers are P2 with the same respond-by, so the copy must NOT claim
    // a more-urgent reading was chosen.
    expect(r.assumption).toContain("equally urgent");
    expect(r.assumption).not.toContain("more urgent reading");
    expect(r.assumption).toMatch(/Assumed: (Walk-In|Reach-In)/);
  });

  it("states no assumption when nothing was asked", () => {
    expect(run({ confidence: 0.9 }).assumption).toBeNull();
  });
});

describe("suppression classes", () => {
  it("declines brand/model because the record already answers it", () => {
    const r = run({ confidence: 0.8, resolution: MATCHED });
    const s = r.suppressed.find((x) => x.field === "make_model");
    expect(s?.proof).toBe("already_known");
    expect(s?.reason).toContain("Nor-Lake KLB7746-C");
  });

  it("does not claim to already know brand/model when no asset resolved", () => {
    const r = askGate({
      facts: facts(), confidence: 0.8, uncertainFields: [],
      resolution: { kind: "none", reason: "no_match", trades: ["refrigeration"] },
      location: HARBOR, now: NOW,
    });
    expect(r.suppressed.find((x) => x.field === "make_model")).toBeUndefined();
  });

  it("declines form questions that no dispatch decision reads", () => {
    const r = run({ confidence: 0.8, resolution: MATCHED });
    const fields = r.suppressed.filter((s) => s.proof === "not_an_input").map((s) => s.field);
    expect(fields).toEqual(expect.arrayContaining(["duration", "reported_by"]));
  });

  it("labels counterfactual suppressions differently from static ones", () => {
    const r = run({ confidence: 0.5, f: { lossInProgress: true } });
    const dyn = r.suppressed.filter((s) => s.proof === "diff_empty");
    const stat = r.suppressed.filter((s) => s.proof !== "diff_empty");
    expect(dyn.length).toBeGreaterThan(0);
    expect(stat.length).toBeGreaterThan(0);
    // Only the dynamic ones claim candidates were actually compared.
    for (const s of dyn) expect(s.candidatesConsidered).toBeGreaterThan(0);
    for (const s of stat) expect(s.candidatesConsidered).toBe(0);
  });

  it("the flagship scenario now shows a populated panel alongside its question", () => {
    const r = run({ confidence: 0.7, resolution: AMBIGUOUS });
    expect(r.asked?.field).toBe("asset_identity");
    expect(r.suppressed.length).toBeGreaterThan(0);
  });
});

describe("assumption text matches the actual situation", () => {
  const safetyQ = (o: { safetyHazard: boolean; dispatching?: boolean }) =>
    askGate({
      facts: facts({ safetyHazard: o.safetyHazard, lossInProgress: false, equipmentInoperable: false }),
      confidence: 0.9, uncertainFields: ["safety_hazard"],
      resolution: MATCHED, location: HARBOR, now: NOW,
      dispatching: o.dispatching,
    });

  it("says 'more urgent reading' only when the baseline really is the most urgent", () => {
    // Extracted safety=true -> baseline P1, the alternative is P4.
    const r = safetyQ({ safetyHazard: true });
    expect(r.baseline.tier).toBe("P1");
    expect(r.assumption).toContain("more urgent reading");
  });

  // The bug: baseline P4, alternative P1, and the old template still claimed
  // the more urgent reading had been chosen.
  it("does NOT claim the more urgent reading when it dispatched the milder one", () => {
    const r = safetyQ({ safetyHazard: false });
    expect(r.baseline.tier).toBe("P4");
    expect(r.assumption).not.toContain("more urgent reading");
    expect(r.assumption).toContain("what the intake actually said");
  });

  it("names the downside so the operator knows the cost of not replying", () => {
    const r = safetyQ({ safetyHazard: false });
    expect(r.assumption).toMatch(/If the answer is .+, this becomes P1/);
  });

  it("does not talk about dispatching at all when nothing will be dispatched", () => {
    const r = safetyQ({ safetyHazard: false, dispatching: false });
    expect(r.assumption).toContain("Nothing is being dispatched either way");
    expect(r.assumption).not.toContain("Answer not required");
    expect(r.assumption).not.toContain("more urgent reading");
  });

  it("still calls an equal-urgency tie a tie", () => {
    const r = run({ confidence: 0.7, resolution: AMBIGUOUS });
    expect(r.assumption).toContain("equally urgent");
  });
});
