import type { ProvenanceSource } from "./provenance";
import type { RespondBy } from "./respondBy";
import type { TierInputs, TierRuleId } from "./tier";
import type { UrgencyTier } from "../llm/vocab";

/**
 * The sentence a dispatcher actually reads, generated from the rule that
 * fired. Never model prose: a model-written rationale can contradict the tier
 * the code computed, and this is the one line most likely to be believed.
 *
 * Item 4: the same {value, source} discipline as BringItem. The text is
 * `computed`, but it CITES values of mixed provenance -- the booleans came
 * from a model, the opening time came from the database -- so the citations
 * carry their own sources and the card can badge them individually.
 */

export type RationaleCitation = {
  field: string;
  value: string;
  source: ProvenanceSource;
};

export type Rationale = {
  ruleId: TierRuleId;
  text: string;
  citations: RationaleCitation[];
};

const TIER_SENTENCE: Record<TierRuleId, string> = {
  safety_hazard:
    "P1. The intake describes an immediate safety hazard, which outranks every other consideration.",
  service_blocking:
    "P1. The restaurant cannot open or cannot serve, so this is revenue-stopping from the moment it was reported.",
  loss_in_progress:
    "P2. Something is being lost right now and will keep being lost until someone arrives.",
  inoperable_no_workaround:
    "P2. The equipment cannot do its job and no workaround was stated.",
  inoperable_with_workaround:
    "P3. The equipment is down but a workaround was stated, so service continues degraded.",
  no_operational_impact:
    "P4. Nothing reported is stopping the kitchen from running.",
};

const BASIS_SENTENCE: Record<RespondBy["basis"], string> = {
  p1_immediate: "Respond-by is two hours from intake.",
  stated_deadline:
    "Respond-by comes from the deadline stated at intake, less a 60 minute lead time.",
  next_open:
    "Respond-by is the next opening time on record, less a 60 minute lead time.",
  next_business_day: "Respond-by is the next day's opening time.",
  scheduled_week: "Respond-by is one week out.",
};

export function rationaleFor(
  tier: UrgencyTier,
  rule: TierRuleId,
  booleans: TierInputs,
  respondBy: RespondBy,
  opensAt: string,
): Rationale {
  const parts = [TIER_SENTENCE[rule], BASIS_SENTENCE[respondBy.basis]];

  if (respondBy.degraded) {
    parts.push(
      "A specific deadline was claimed at intake but no time was given, so the next opening governs instead.",
    );
  }
  if (respondBy.clamped) {
    parts.push("That time has already passed, so this is due immediately.");
  }

  // Only cite the booleans that actually participated in the rule that fired.
  const cited: (keyof TierInputs)[] =
    rule === "safety_hazard"
      ? ["safetyHazard"]
      : rule === "service_blocking"
        ? ["serviceBlocking"]
        : rule === "loss_in_progress"
          ? ["lossInProgress"]
          : rule === "no_operational_impact"
            ? ["equipmentInoperable"]
            : ["equipmentInoperable", "workaroundExists"];

  const citations: RationaleCitation[] = cited.map((field) => ({
    field,
    value: String(booleans[field]),
    source: "model" as const,
  }));

  if (respondBy.basis === "next_open" || respondBy.basis === "next_business_day") {
    citations.push({ field: "opensAt", value: opensAt, source: "database" });
  }
  citations.push({ field: "tier", value: tier, source: "computed" });

  return { ruleId: rule, text: parts.join(" "), citations };
}
