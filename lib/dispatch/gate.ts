import type { WorkOrderStatus } from "../llm/vocab";
import type { AssetResolution } from "./resolveAsset";

/**
 * The confidence floor, enforced in code.
 *
 * Model self-reported confidence is weakly calibrated, so this leans harder on
 * structural signals -- did an asset resolve, did the model name a trade at
 * all, is a symptom unnameable -- than on the number the model reports about
 * itself. The number is one input, not the gate.
 */
export const CONFIDENCE_FLOOR = 0.35;

export type GateReasonCode =
  | "not_a_maintenance_request"
  | "unnameable_symptom"
  | "below_confidence_floor"
  | "no_trade_identified"
  | "trade_undecidable"
  | "asset_unresolved";

export type GateReason = { code: GateReasonCode; detail: string };

export type GateInput = {
  isMaintenanceRequest: boolean;
  confidence: number;
  hasUnnameableSymptom: boolean;
  tradeCandidateCount: number;
  resolution: AssetResolution;
};

export type GateResult = { status: WorkOrderStatus; reasons: GateReason[] };

export function gate(input: GateInput): GateResult {
  const reasons: GateReason[] = [];

  if (!input.isMaintenanceRequest) {
    return {
      status: "out_of_scope",
      reasons: [
        {
          code: "not_a_maintenance_request",
          detail: "The intake is not about equipment, facilities or the building.",
        },
      ],
    };
  }

  if (input.hasUnnameableSymptom) {
    reasons.push({
      code: "unnameable_symptom",
      detail:
        "A symptom was described that is not in the vocabulary, so no parts list will be guessed from it.",
    });
  }
  if (input.confidence < CONFIDENCE_FLOOR) {
    reasons.push({
      code: "below_confidence_floor",
      detail: `Extraction confidence ${input.confidence.toFixed(2)} is below the floor of ${CONFIDENCE_FLOOR}.`,
    });
  }
  if (input.tradeCandidateCount === 0) {
    reasons.push({
      code: "no_trade_identified",
      detail: "No trade could be identified from the intake.",
    });
  }
  if (input.resolution.kind === "ambiguous_cross_trade") {
    reasons.push({
      code: "trade_undecidable",
      detail: `The description spans ${input.resolution.trades.join(", ")}. Enumerating the branches rather than picking one.`,
    });
  }

  if (reasons.length > 0) return { status: "needs_human", reasons };

  if (input.resolution.kind === "none") {
    return {
      status: "dispatchable_with_assumption",
      reasons: [
        {
          code: "asset_unresolved",
          detail:
            "No asset matched the words used. Dispatching on the trade with the assumption stated on the work order.",
        },
      ],
    };
  }

  return { status: "dispatchable", reasons: [] };
}
