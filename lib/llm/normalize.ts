import type { ExtractionWire, Facts } from "./schemas";
import {
  isDeadlineKind,
  isSymptomCode,
  isTrade,
  isUncertainField,
} from "./vocab";

const clamp01 = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

/**
 * Maps raw model output onto the closed vocabularies.
 *
 * Never throws, and never silently drops something that matters. Anything the
 * model said that we cannot place is preserved somewhere the UI can show it:
 * unrecognized symptoms become `other` with their raw text, unrecognized
 * trades land in droppedTrades. A model that invents a value should make the
 * demo more honest, not less.
 */
export function normalize(wire: ExtractionWire): Facts {
  const tradeCandidates: Facts["tradeCandidates"] = [];
  const droppedTrades: string[] = [];

  for (const c of wire.trade_candidates) {
    const t = c.trade.trim().toLowerCase();
    if (isTrade(t)) {
      tradeCandidates.push({ trade: t, confidence: clamp01(c.confidence) });
    } else if (t) {
      droppedTrades.push(c.trade);
    }
  }
  tradeCandidates.sort((a, b) => b.confidence - a.confidence);

  const symptoms: Facts["symptoms"] = [];
  const unknownSymptomTexts: string[] = [];

  for (const s of wire.symptoms) {
    const code = s.code.trim().toLowerCase();
    const raw = s.raw.trim();
    if (isSymptomCode(code) && code !== "other") {
      symptoms.push({ code, raw });
    } else {
      // Out of vocabulary, or the model itself said `other`. Same outcome:
      // we will not guess a parts list from words we do not know.
      symptoms.push({ code: "other", raw });
      if (raw) unknownSymptomTexts.push(raw);
    }
  }

  const kind = wire.deadline.kind.trim().toLowerCase();

  return {
    isMaintenanceRequest: wire.is_maintenance_request,
    outOfScopeReason: wire.out_of_scope_reason,

    tradeCandidates,
    droppedTrades,

    assetDescriptor: wire.asset_descriptor?.trim() || null,

    symptoms,
    unknownSymptomTexts,

    safetyHazard: wire.safety_hazard,
    serviceBlocking: wire.service_blocking,
    lossInProgress: wire.loss_in_progress,
    equipmentInoperable: wire.equipment_inoperable,
    workaroundExists: wire.workaround_exists,

    deadline: {
      kind: isDeadlineKind(kind) ? kind : "none",
      at: wire.deadline.at,
      statedAs: wire.deadline.stated_as,
    },

    uncertainFields: [
      ...new Set(
        wire.uncertain_fields
          .map((f) => f.trim().toLowerCase())
          .filter(isUncertainField),
      ),
    ],

    confidence: clamp01(wire.confidence),

    businessImpact: wire.business_impact,
    suspectedCauses: wire.suspected_causes,
    whatWouldChangeMyMind: wire.what_would_change_my_mind,
  };
}
