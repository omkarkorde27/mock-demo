import type { UrgencyTier } from "../llm/vocab";

/**
 * Five booleans -> a tier. Pure, total, and the only place tier is decided.
 *
 * The plan called for four booleans. With four, `otherwise` is unreachable --
 * workaround_exists is either true or false, so one of the last two rules
 * always fires and nothing can ever be P4. equipment_inoperable is what
 * separates "this is down" from "this is cosmetic".
 */

export type TierInputs = {
  safetyHazard: boolean;
  serviceBlocking: boolean;
  lossInProgress: boolean;
  equipmentInoperable: boolean;
  workaroundExists: boolean;
};

export type TierRuleId =
  | "safety_hazard"
  | "service_blocking"
  | "loss_in_progress"
  | "inoperable_no_workaround"
  | "inoperable_with_workaround"
  | "no_operational_impact";

export type TierDecision = {
  tier: UrgencyTier;
  /** Which rule fired. rationale.ts turns this into the sentence a dispatcher reads. */
  rule: TierRuleId;
};

export function tierFrom(b: TierInputs): TierDecision {
  if (b.safetyHazard) return { tier: "P1", rule: "safety_hazard" };
  if (b.serviceBlocking) return { tier: "P1", rule: "service_blocking" };
  if (b.lossInProgress) return { tier: "P2", rule: "loss_in_progress" };
  if (b.equipmentInoperable && !b.workaroundExists)
    return { tier: "P2", rule: "inoperable_no_workaround" };
  if (b.equipmentInoperable && b.workaroundExists)
    return { tier: "P3", rule: "inoperable_with_workaround" };
  return { tier: "P4", rule: "no_operational_impact" };
}
