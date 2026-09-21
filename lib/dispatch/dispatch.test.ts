import { describe, expect, it } from "vitest";
import { URGENCY_TIERS } from "../llm/vocab";
import { dispatchDiff, dispatchFingerprint, dispatchFor, type Dispatch, type DispatchFacts } from "./dispatchFor";
import { CONFIDENCE_FLOOR, gate } from "./gate";
import { resolveAsset, type ResolvableAsset } from "./resolveAsset";
import type { LocationHours } from "./respondBy";
import { tierFrom, type TierInputs } from "./tier";
import { warrantyFlag } from "./warrantyFlag";

const HARBOR: LocationHours = { timezone: "America/New_York", opensAt: "11:00", closesAt: "22:00" };
const NOW = new Date("2026-09-20T06:00:00Z");

const A = (o: Partial<ResolvableAsset> & Pick<ResolvableAsset, "id" | "trade" | "type" | "label">): ResolvableAsset => ({
  aliases: [], make: null, model: null, refrigerantType: null, warrantyExpiresOn: null, ...o,
});

const WALK_IN = A({
  id: "w", trade: "refrigeration", type: "walk_in_cooler", label: "Walk-In Cooler — Kitchen Rear",
  aliases: ["walk-in", "walk in", "wic", "big cooler", "the big cooler", "cooler in back", "big fridge"],
  make: "Nor-Lake", model: "KLB7746-C", refrigerantType: "R-404A", warrantyExpiresOn: "2027-03-14",
});
const REACH_IN = A({
  id: "r", trade: "refrigeration", type: "reach_in_cooler", label: "Reach-In Cooler — Cook Line",
  aliases: ["reach-in", "reach in", "line cooler", "small fridge", "prep fridge"],
  make: "True", model: "T-49-HC", refrigerantType: "R-134a", warrantyExpiresOn: "2024-08-01",
});
const ICE = A({ id: "i", trade: "refrigeration", type: "ice_machine", label: "Ice Machine — Bar", aliases: ["ice machine", "ice maker", "ice"] });
const FRYER = A({ id: "f", trade: "cooking_equipment", type: "fryer", label: "Fryer — 3-Bay", aliases: ["fryer", "fry station", "fryolator"] });
const SINK = A({ id: "s", trade: "plumbing", type: "three_comp_sink", label: "Three-Compartment Sink", aliases: ["dish sink", "3 comp sink", "wash sink"] });
const ALL = [WALK_IN, REACH_IN, ICE, FRYER, SINK];

const facts = (o: Partial<DispatchFacts> = {}): DispatchFacts => ({
  safetyHazard: false, serviceBlocking: false, lossInProgress: false,
  equipmentInoperable: false, workaroundExists: false,
  symptomCodes: ["not_holding_temp"],
  deadline: { kind: "before_open", at: null, statedAs: null },
  fallbackTrade: "refrigeration",
  ...o,
});

describe("tier", () => {
  it("is total over all 32 boolean combinations and never throws", () => {
    for (let m = 0; m < 32; m++) {
      const b: TierInputs = {
        safetyHazard: !!(m & 1), serviceBlocking: !!(m & 2), lossInProgress: !!(m & 4),
        equipmentInoperable: !!(m & 8), workaroundExists: !!(m & 16),
      };
      const d = tierFrom(b);
      expect(URGENCY_TIERS).toContain(d.tier);
    }
  });

  it("makes P4 reachable -- the bug the fifth boolean exists to fix", () => {
    const allFalse: TierInputs = {
      safetyHazard: false, serviceBlocking: false, lossInProgress: false,
      equipmentInoperable: false, workaroundExists: false,
    };
    expect(tierFrom(allFalse)).toEqual({ tier: "P4", rule: "no_operational_impact" });
  });

  it("orders safety above everything", () => {
    expect(tierFrom({ safetyHazard: true, serviceBlocking: false, lossInProgress: false, equipmentInoperable: false, workaroundExists: true }).tier).toBe("P1");
  });

  it("uses the workaround to separate P2 from P3", () => {
    const base = { safetyHazard: false, serviceBlocking: false, lossInProgress: false, equipmentInoperable: true };
    expect(tierFrom({ ...base, workaroundExists: false }).tier).toBe("P2");
    expect(tierFrom({ ...base, workaroundExists: true }).tier).toBe("P3");
  });
});

describe("warrantyFlag", () => {
  it("is inclusive on the expiry date itself", () => {
    expect(warrantyFlag({ warrantyExpiresOn: "2026-09-20" }, NOW).underWarranty).toBe(true);
    expect(warrantyFlag({ warrantyExpiresOn: "2026-09-19" }, NOW).underWarranty).toBe(false);
  });
  it("handles a null or absent record without inventing coverage", () => {
    expect(warrantyFlag(null, NOW).underWarranty).toBe(false);
    expect(warrantyFlag({ warrantyExpiresOn: null }, NOW).note).toBeNull();
  });
  it("separates the database date from the computed verdict", () => {
    const w = warrantyFlag({ warrantyExpiresOn: "2027-03-14" }, NOW);
    expect(w.expiresOn).toBe("2027-03-14");
    expect(w.underWarranty).toBe(true);
    expect(w.daysRemaining).toBeGreaterThan(0);
  });
});

describe("resolveAsset", () => {
  const ref = [{ trade: "refrigeration" as const, confidence: 0.95 }];

  it("resolves a specific descriptor to one asset", () => {
    const r = resolveAsset("walk in", ref, ALL);
    expect(r.kind).toBe("match");
    if (r.kind === "match") expect(r.asset.id).toBe("w");
  });

  it("finds exactly the two box coolers for a generic descriptor", () => {
    const r = resolveAsset("the fridge", ref, ALL);
    expect(r.kind).toBe("ambiguous_same_trade");
    if (r.kind === "ambiguous_same_trade") {
      expect(r.candidates.map((c) => c.id).sort()).toEqual(["r", "w"]);
    }
  });

  it("never pulls the ice machine into a cooler question", () => {
    for (const d of ["the fridge", "cooler", "the big cooler"]) {
      const r = resolveAsset(d, ref, ALL);
      const ids = r.kind === "ambiguous_same_trade" ? r.candidates.map((c) => c.id) : r.kind === "match" ? [r.asset.id] : [];
      expect(ids).not.toContain("i");
    }
  });

  it("does not let the alias 'ice' match the word 'service'", () => {
    // The trap that substring matching would fall into.
    const r = resolveAsset("service door", ref, ALL);
    expect(r.kind).toBe("none");
  });

  it("flags a trade disagreement and keeps the record's answer", () => {
    const r = resolveAsset("fryer", [{ trade: "plumbing", confidence: 0.6 }], ALL);
    expect(r.kind).toBe("match");
    if (r.kind === "match") {
      expect(r.asset.trade).toBe("cooking_equipment");
      expect(r.tradeDisagreement).toEqual({ modelProposed: "plumbing", modelConfidence: 0.6, recordSays: "cooking_equipment" });
    }
  });

  it("does not call a low-confidence model opinion a disagreement", () => {
    const r = resolveAsset("fryer", [{ trade: "plumbing", confidence: 0.3 }], ALL);
    if (r.kind === "match") expect(r.tradeDisagreement).toBeNull();
  });

  it("returns cross-trade when nothing matched and the model could not settle", () => {
    const r = resolveAsset("something back there", [
      { trade: "plumbing", confidence: 0.5 }, { trade: "cooking_equipment", confidence: 0.3 },
    ], ALL);
    expect(r.kind).toBe("ambiguous_cross_trade");
  });

  it("returns none with a reason when there is no descriptor at all", () => {
    const r = resolveAsset(null, ref, ALL);
    expect(r).toMatchObject({ kind: "none", reason: "no_descriptor" });
  });
});

describe("gate", () => {
  const base = { isMaintenanceRequest: true, confidence: 0.9, hasUnnameableSymptom: false, tradeCandidateCount: 1,
    resolution: { kind: "match", asset: WALK_IN, matchedOn: "walk in", tradeDisagreement: null } as const };

  it("passes a clean intake", () => {
    expect(gate(base).status).toBe("dispatchable");
  });
  it("routes a non-request out of scope, not to a human", () => {
    expect(gate({ ...base, isMaintenanceRequest: false }).status).toBe("out_of_scope");
  });
  it("holds the confidence floor regardless of how fluent the rest was", () => {
    expect(gate({ ...base, confidence: CONFIDENCE_FLOOR - 0.01 }).status).toBe("needs_human");
    expect(gate({ ...base, confidence: CONFIDENCE_FLOOR }).status).toBe("dispatchable");
  });
  it("refuses to dispatch on an unnameable symptom", () => {
    const r = gate({ ...base, hasUnnameableSymptom: true });
    expect(r.status).toBe("needs_human");
    expect(r.reasons[0].code).toBe("unnameable_symptom");
  });
  it("enumerates rather than picks on a cross-trade description", () => {
    const r = gate({ ...base, resolution: { kind: "ambiguous_cross_trade", trades: ["plumbing", "cooking_equipment"], candidates: [] } });
    expect(r.status).toBe("needs_human");
  });
  it("dispatches with a stated assumption when no asset resolved", () => {
    const r = gate({ ...base, resolution: { kind: "none", reason: "no_match", trades: ["plumbing"] } });
    expect(r.status).toBe("dispatchable_with_assumption");
    expect(r.reasons[0].code).toBe("asset_unresolved");
  });
});

describe("dispatchFor is diffable as a unit", () => {
  const d = (asset: ResolvableAsset | null, f: Partial<DispatchFacts> = {}) =>
    dispatchFor(facts(f), asset, HARBOR, NOW);

  it("is deterministic", () => {
    expect(dispatchFingerprint(d(WALK_IN))).toBe(dispatchFingerprint(d(WALK_IN)));
  });

  it("separates the walk-in from the reach-in", () => {
    const a = d(WALK_IN), b = d(REACH_IN);
    expect(dispatchFingerprint(a)).not.toBe(dispatchFingerprint(b));
    expect(dispatchDiff(a, b)).toEqual(expect.arrayContaining(["bring", "warranty"]));
  });

  // Item 5: every field of Dispatch must reach the fingerprint, or "no
  // candidate changes the dispatch" is only as strong as the weakest field.
  it("covers every field of the tuple -- mutating any one changes the fingerprint", () => {
    const base = d(WALK_IN);
    const mutations: [string, Dispatch][] = [
      ["trade", { ...base, trade: "plumbing" }],
      ["tier", { ...base, tier: "P1" }],
      ["tierRule", { ...base, tierRule: "safety_hazard" }],
      ["respondBy.at", { ...base, respondBy: { ...base.respondBy, at: new Date("2030-01-01T00:00:00Z") } }],
      ["respondBy.basis", { ...base, respondBy: { ...base.respondBy, basis: "p1_immediate" } }],
      ["respondBy.degraded", { ...base, respondBy: { ...base.respondBy, degraded: !base.respondBy.degraded } }],
      ["respondBy.clamped", { ...base, respondBy: { ...base.respondBy, clamped: !base.respondBy.clamped } }],
      ["bring", { ...base, bring: [...base.bring.slice(1)] }],
      ["bringPrecision", { ...base, bringPrecision: base.bringPrecision === "asset_specific" ? "trade_generic" : "asset_specific" }],
      ["warranty", { ...base, warranty: { ...base.warranty, underWarranty: !base.warranty.underWarranty } }],
      ["rationale", { ...base, rationale: { ...base.rationale, ruleId: "service_blocking" } }],
    ];
    const baseFp = dispatchFingerprint(base);
    for (const [name, mutated] of mutations) {
      expect(dispatchFingerprint(mutated), `${name} did not reach the fingerprint`).not.toBe(baseFp);
    }
    // Every named diff slot is exercised by the list above.
    expect(mutations.length).toBeGreaterThanOrEqual(11);
  });

  it("admits when the parts list is only trade-level", () => {
    expect(d(WALK_IN).bringPrecision).toBe("asset_specific");
    // griddle has no override cell; the list degrades to the base layers.
    const griddle = A({ id: "g", trade: "cooking_equipment", type: "griddle", label: "Griddle" });
    expect(d(griddle, { symptomCodes: ["not_heating"], fallbackTrade: "cooking_equipment" }).bringPrecision).toBe("trade_generic");
  });

  it("cites the booleans that fired, with their sources", () => {
    const r = d(WALK_IN, { lossInProgress: true }).rationale;
    expect(r.ruleId).toBe("loss_in_progress");
    expect(r.citations).toEqual(expect.arrayContaining([
      { field: "lossInProgress", value: "true", source: "model" },
      { field: "opensAt", value: "11:00", source: "database" },
    ]));
  });

  it("explains a degraded deadline in the rationale rather than hiding it", () => {
    const r = d(WALK_IN, { lossInProgress: true, deadline: { kind: "absolute", at: null, statedAs: "thursday" } }).rationale;
    expect(r.text).toContain("no time was given");
  });
});
