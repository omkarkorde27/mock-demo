import type { AssetType, Trade } from "../llm/vocab";

/**
 * Descriptor -> asset row. Deterministic, but BRITTLE -- deterministic is not
 * the same as accurate, and this is the weakest link in the chain. The alias
 * column is the accuracy lever; "none" is a designed outcome, not a failure.
 *
 * Matching is token-subset, not substring. Substring matching would let the
 * alias "ice" match the word "service", and "a tech was dispatched because the
 * word service contains ice" is not a sentence anyone wants to explain.
 */

export type ResolvableAsset = {
  id: string;
  trade: Trade;
  type: AssetType;
  label: string;
  aliases: string[];
  make: string | null;
  model: string | null;
  refrigerantType: string | null;
  warrantyExpiresOn: string | null;
};

export type TradeDisagreement = {
  modelProposed: Trade;
  modelConfidence: number;
  recordSays: Trade;
};

export type AssetResolution =
  | {
      kind: "match";
      asset: ResolvableAsset;
      matchedOn: string;
      /** Set when the model's top trade contradicts the asset row. Record wins. */
      tradeDisagreement: TradeDisagreement | null;
    }
  | { kind: "ambiguous_same_trade"; trade: Trade; candidates: ResolvableAsset[] }
  | { kind: "ambiguous_cross_trade"; trades: Trade[]; candidates: ResolvableAsset[] }
  | { kind: "none"; reason: "no_descriptor" | "no_match"; trades: Trade[] };

/** Filler words a manager types that carry no identifying information. */
const STOPWORDS = new Set([
  "the", "a", "an", "our", "my", "is", "was", "are", "been", "has", "have",
  "it", "its", "this", "that", "there", "theres", "all", "over", "and",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

function isSubset(small: string[], big: string[]): boolean {
  if (small.length === 0) return false;
  const bag = new Set(big);
  return small.every((t) => bag.has(t));
}

/** Either phrase fully accounts for the other, ignoring word order. */
function phraseMatch(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  return isSubset(ta, tb) || isSubset(tb, ta);
}

/** The most specific alias that matched, for display. */
function matchedAlias(
  descriptor: string,
  asset: ResolvableAsset,
): string | null {
  const candidates = [asset.label, ...asset.aliases]
    .filter((c) => phraseMatch(descriptor, c))
    .sort((a, b) => tokens(b).length - tokens(a).length);
  return candidates[0] ?? null;
}

/** A model trade opinion only counts as a disagreement if it was confident. */
const DISAGREEMENT_CONFIDENCE = 0.5;
/** Below this, a top trade candidate is not a decision, it is a shrug. */
const DOMINANT_TRADE_CONFIDENCE = 0.6;

export function resolveAsset(
  descriptor: string | null,
  tradeCandidates: { trade: Trade; confidence: number }[],
  assetsAtLocation: ResolvableAsset[],
): AssetResolution {
  const proposedTrades = tradeCandidates.map((t) => t.trade);
  const top = tradeCandidates[0] ?? null;

  const crossTradeShrug =
    tradeCandidates.length > 1 &&
    (top?.confidence ?? 0) < DOMINANT_TRADE_CONFIDENCE;

  if (!descriptor || tokens(descriptor).length === 0) {
    // No equipment named. If the model also could not settle on a trade, this
    // is the genuinely undecidable case -- enumerate, do not pick.
    if (crossTradeShrug) {
      return {
        kind: "ambiguous_cross_trade",
        trades: proposedTrades,
        candidates: assetsAtLocation.filter((a) =>
          proposedTrades.includes(a.trade),
        ),
      };
    }
    return { kind: "none", reason: "no_descriptor", trades: proposedTrades };
  }

  const hits = assetsAtLocation.filter((a) => matchedAlias(descriptor, a) !== null);

  if (hits.length === 0) {
    if (crossTradeShrug) {
      return {
        kind: "ambiguous_cross_trade",
        trades: proposedTrades,
        candidates: assetsAtLocation.filter((a) =>
          proposedTrades.includes(a.trade),
        ),
      };
    }
    return { kind: "none", reason: "no_match", trades: proposedTrades };
  }

  if (hits.length === 1) {
    const asset = hits[0];
    const disagrees =
      top !== null &&
      top.trade !== asset.trade &&
      top.confidence >= DISAGREEMENT_CONFIDENCE;

    return {
      kind: "match",
      asset,
      matchedOn: matchedAlias(descriptor, asset)!,
      tradeDisagreement: disagrees
        ? {
            modelProposed: top.trade,
            modelConfidence: top.confidence,
            recordSays: asset.trade,
          }
        : null,
    };
  }

  const trades = [...new Set(hits.map((h) => h.trade))];
  return trades.length === 1
    ? { kind: "ambiguous_same_trade", trade: trades[0], candidates: hits }
    : { kind: "ambiguous_cross_trade", trades, candidates: hits };
}
