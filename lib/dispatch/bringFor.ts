import type { AssetType, SymptomCode, Trade } from "../llm/vocab";
import {
  SYMPTOM_KIT,
  TRADE_KIT,
  TYPE_OVERRIDE,
  type BringItem,
  type BringSource,
} from "./parts";

/**
 * Pure. Composes the three catalog layers plus fields read straight off the
 * asset row into one list.
 *
 * This is one of the four values askGate diffs, and it is where the
 * walk-in/reach-in question gets its teeth: the two rows carry different
 * refrigerants and different override cells, so the lists genuinely differ.
 * Not because a model had an opinion -- because the records disagree.
 */

export type AssetForBring = {
  trade: Trade;
  type: AssetType;
  refrigerantType: string | null;
  make: string | null;
  model: string | null;
};

/** Most specific first. Also the dedupe priority. */
const RANK: Record<BringSource, number> = {
  asset_record: 3,
  type_override: 2,
  symptom_kit: 1,
  trade_kit: 0,
};

export function bringFor(
  asset: AssetForBring | null,
  symptomCodes: SymptomCode[],
  fallbackTrade: Trade | null = null,
): BringItem[] {
  const trade = asset?.trade ?? fallbackTrade;
  const collected: BringItem[] = [];

  // Layer 1 -- the truck's normal stock for this trade.
  if (trade) {
    for (const item of TRADE_KIT[trade]) {
      collected.push({ item, source: "trade_kit" });
    }
  }

  // Layers 2 and 3, per symptom. `other` contributes nothing on purpose.
  for (const code of symptomCodes) {
    for (const item of SYMPTOM_KIT[code]) {
      collected.push({ item, source: "symptom_kit" });
    }
    if (asset) {
      for (const item of TYPE_OVERRIDE[asset.type]?.[code] ?? []) {
        collected.push({ item, source: "type_override" });
      }
    }
  }

  // Straight off the asset row. The DB, not the model, decides these.
  if (asset?.refrigerantType) {
    collected.push({
      item: `${asset.refrigerantType} refrigerant`,
      source: "asset_record",
    });
  }
  if (asset?.make && asset.model) {
    collected.push({
      item: `parts reference for ${asset.make} ${asset.model}`,
      source: "asset_record",
    });
  }

  // Dedupe by item, keeping the most specific source. Stable: ties preserve
  // first-seen order, so the output is byte-identical across runs.
  const best = new Map<string, { entry: BringItem; seq: number }>();
  collected.forEach((entry, seq) => {
    const prior = best.get(entry.item);
    if (!prior || RANK[entry.source] > RANK[prior.entry.source]) {
      best.set(entry.item, { entry, seq: prior?.seq ?? seq });
    }
  });

  return [...best.values()]
    .sort((a, b) =>
      RANK[b.entry.source] - RANK[a.entry.source] || a.seq - b.seq,
    )
    .map((v) => v.entry);
}

/** Stable string form, so askGate can diff two lists cheaply. */
export function bringFingerprint(items: BringItem[]): string {
  return items.map((i) => `${i.source}:${i.item}`).join("|");
}
