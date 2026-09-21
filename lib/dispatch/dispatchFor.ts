import type { Trade, UrgencyTier } from "../llm/vocab";
import { bringFor, type AssetForBring } from "./bringFor";
import type { BringItem } from "./parts";
import type { ProvenanceMap } from "./provenance";
import { rationaleFor, type Rationale } from "./rationale";
import type { ResolvableAsset } from "./resolveAsset";
import { respondByFrom, type Deadline, type LocationHours, type RespondBy } from "./respondBy";
import { tierFrom, type TierInputs, type TierRuleId } from "./tier";
import { warrantyFlag, type WarrantyFlag } from "./warrantyFlag";
import type { SymptomCode } from "../llm/vocab";

/**
 * The tuple askGate diffs.
 *
 * Item 5: this is diffable AS A UNIT. askGate compares dispatchFingerprint()
 * strings, not five fields with five separate equality rules -- otherwise the
 * "no candidate value changes the dispatch" claim would only be as strong as
 * whichever field had the sloppiest comparison. Dates become ISO strings,
 * lists become ordered joins, everything lands in one canonical string with a
 * fixed key order. dispatchDiff() then explains WHICH field moved, but the
 * ask/suppress decision itself is one string comparison.
 */

export type BringPrecision = "asset_specific" | "trade_generic";

export type Dispatch = {
  trade: Trade | null;
  tier: UrgencyTier;
  tierRule: TierRuleId;
  respondBy: RespondBy;
  bring: BringItem[];
  /**
   * Item 3: whether the parts list is genuinely asset-specific or a trade
   * fallback. Part of the tuple so the card renders it as data rather than
   * having to remember to call a helper.
   */
  bringPrecision: BringPrecision;
  warranty: WarrantyFlag;
  rationale: Rationale;
};

export const DISPATCH_PROVENANCE = {
  trade: "database",
  tier: "computed",
  tierRule: "computed",
  respondBy: "computed",
  bring: "computed",
  bringPrecision: "computed",
  warranty: "computed",
  rationale: "computed",
} as const satisfies ProvenanceMap<Dispatch>;

export type DispatchFacts = TierInputs & {
  symptomCodes: SymptomCode[];
  deadline: Deadline;
  fallbackTrade: Trade | null;
};

export function dispatchFor(
  facts: DispatchFacts,
  asset: ResolvableAsset | null,
  location: LocationHours,
  now: Date,
): Dispatch {
  // The record wins over the model when they disagree about trade.
  const trade = asset?.trade ?? facts.fallbackTrade;

  const { tier, rule } = tierFrom(facts);
  const respondBy = respondByFrom(tier, facts.deadline, location, now);

  const forBring: AssetForBring | null = asset
    ? {
        trade: asset.trade,
        type: asset.type,
        refrigerantType: asset.refrigerantType,
        make: asset.make,
        model: asset.model,
      }
    : null;

  const bring = bringFor(forBring, facts.symptomCodes, facts.fallbackTrade);

  // Derived from the output itself, so it cannot drift from what is shown.
  const bringPrecision: BringPrecision = bring.some(
    (i) => i.source === "type_override",
  )
    ? "asset_specific"
    : "trade_generic";

  return {
    trade,
    tier,
    tierRule: rule,
    respondBy,
    bring,
    bringPrecision,
    warranty: warrantyFlag(asset, now),
    rationale: rationaleFor(tier, rule, facts, respondBy, location.opensAt),
  };
}

/** Canonical, total, order-stable. Two dispatches are equal iff these match. */
export function dispatchFingerprint(d: Dispatch): string {
  return [
    `trade=${d.trade ?? "-"}`,
    `tier=${d.tier}`,
    `rule=${d.tierRule}`,
    `respond_by=${d.respondBy.at.toISOString()}`,
    `basis=${d.respondBy.basis}`,
    `degraded=${d.respondBy.degraded}`,
    `clamped=${d.respondBy.clamped}`,
    `precision=${d.bringPrecision}`,
    `bring=${d.bring.map((i) => `${i.source}:${i.item}`).join("~")}`,
    `warranty=${d.warranty.underWarranty}:${d.warranty.expiresOn ?? "-"}`,
    `rationale=${d.rationale.ruleId}`,
  ].join("|");
}

export const DISPATCH_DIFF_FIELDS = [
  "trade", "tier", "rule", "respond_by", "basis", "degraded",
  "clamped", "precision", "bring", "warranty", "rationale",
] as const;

/** Which fields moved. Explanation only -- the decision uses the fingerprint. */
export function dispatchDiff(a: Dispatch, b: Dispatch): string[] {
  const pa = dispatchFingerprint(a).split("|");
  const pb = dispatchFingerprint(b).split("|");
  const moved: string[] = [];
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] !== pb[i]) moved.push(DISPATCH_DIFF_FIELDS[i]);
  }
  return moved;
}
