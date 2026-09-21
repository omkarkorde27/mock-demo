import { describe, expect, it } from "vitest";
import { ASSET_TYPES, SYMPTOM_CODES, TRADES } from "../llm/vocab";
import { bringFingerprint, bringFor, type AssetForBring } from "./bringFor";
import {
  countOverrideCells,
  isAssetTypeCovered,
  PINNED_OVERRIDE_CELLS,
  SYMPTOM_KIT,
  TRADE_KIT,
  TYPE_OVERRIDE,
} from "./parts";

const WALK_IN: AssetForBring = {
  trade: "refrigeration",
  type: "walk_in_cooler",
  refrigerantType: "R-404A",
  make: "Nor-Lake",
  model: "KLB7746-C",
};

const REACH_IN: AssetForBring = {
  trade: "refrigeration",
  type: "reach_in_cooler",
  refrigerantType: "R-134a",
  make: "True",
  model: "T-49-HC",
};

describe("the pin", () => {
  it("holds the override at exactly the scoped cells", () => {
    // If this fails, someone widened the catalog. That is a scope change and
    // should be acknowledged, not absorbed.
    expect(countOverrideCells()).toBe(PINNED_OVERRIDE_CELLS);
  });

  it("only references real asset types and symptom codes", () => {
    for (const [type, bySymptom] of Object.entries(TYPE_OVERRIDE)) {
      expect(ASSET_TYPES).toContain(type);
      for (const code of Object.keys(bySymptom ?? {})) {
        expect(SYMPTOM_CODES).toContain(code);
      }
    }
  });
});

describe("exhaustive base layers", () => {
  it("covers every trade", () => {
    for (const t of TRADES) expect(TRADE_KIT[t].length).toBeGreaterThan(0);
  });

  it("covers every symptom code, and `other` is deliberately empty", () => {
    for (const c of SYMPTOM_CODES) expect(Array.isArray(SYMPTOM_KIT[c])).toBe(true);
    expect(SYMPTOM_KIT.other).toEqual([]);
  });
});

describe("the walk-in / reach-in dispatch delta", () => {
  it("produces genuinely different lists for the same symptom", () => {
    const a = bringFor(WALK_IN, ["not_holding_temp"]);
    const b = bringFor(REACH_IN, ["not_holding_temp"]);
    expect(bringFingerprint(a)).not.toBe(bringFingerprint(b));
  });

  it("differs on refrigerant, straight off the asset row", () => {
    expect(bringFor(WALK_IN, ["not_holding_temp"]).map((i) => i.item))
      .toContain("R-404A refrigerant");
    expect(bringFor(REACH_IN, ["not_holding_temp"]).map((i) => i.item))
      .toContain("R-134a refrigerant");
  });

  it("differs on the override cell", () => {
    expect(bringFor(WALK_IN, ["not_holding_temp"]).map((i) => i.item))
      .toContain("condenser fan motor");
    expect(bringFor(REACH_IN, ["not_holding_temp"]).map((i) => i.item))
      .toContain("door gasket");
  });
});

describe("merge behaviour", () => {
  it("dedupes, keeping the more specific source", () => {
    // "calibrated thermometer" is in both the refrigeration trade kit and the
    // not_holding_temp symptom kit.
    const items = bringFor(WALK_IN, ["not_holding_temp"]);
    const hits = items.filter((i) => i.item === "calibrated thermometer");
    expect(hits).toHaveLength(1);
    expect(hits[0].source).toBe("symptom_kit");
  });

  it("orders most specific first", () => {
    const sources = bringFor(WALK_IN, ["not_holding_temp"]).map((i) => i.source);
    const rank = { asset_record: 3, type_override: 2, symptom_kit: 1, trade_kit: 0 };
    for (let i = 1; i < sources.length; i++) {
      expect(rank[sources[i - 1]]).toBeGreaterThanOrEqual(rank[sources[i]]);
    }
  });

  it("adds nothing precise for an unnameable symptom", () => {
    const items = bringFor(WALK_IN, ["other"]);
    expect(items.some((i) => i.source === "type_override")).toBe(false);
    expect(items.some((i) => i.source === "symptom_kit")).toBe(false);
  });

  it("falls back to the trade kit when no asset resolved", () => {
    const items = bringFor(null, ["backing_up"], "plumbing");
    expect(items.some((i) => i.source === "trade_kit")).toBe(true);
    expect(items.some((i) => i.source === "asset_record")).toBe(false);
  });

  it("returns nothing when there is neither an asset nor a trade", () => {
    expect(bringFor(null, [])).toEqual([]);
  });

  it("is deterministic across repeated calls", () => {
    const once = bringFingerprint(bringFor(WALK_IN, ["not_holding_temp", "icing_up"]));
    for (let i = 0; i < 25; i++) {
      expect(bringFingerprint(bringFor(WALK_IN, ["not_holding_temp", "icing_up"]))).toBe(once);
    }
  });

  it("never throws for any (asset type, symptom code) pair", () => {
    for (const type of ASSET_TYPES) {
      for (const code of SYMPTOM_CODES) {
        const asset: AssetForBring = {
          trade: "refrigeration", type, refrigerantType: null, make: null, model: null,
        };
        expect(() => bringFor(asset, [code])).not.toThrow();
      }
    }
  });
});

describe("catalog coverage reporting", () => {
  it("reports which asset types have any precise content", () => {
    expect(isAssetTypeCovered("walk_in_cooler")).toBe(true);
    // Deliberately uncovered -- falls through to the base layers.
    expect(isAssetTypeCovered("griddle")).toBe(false);
  });
});
