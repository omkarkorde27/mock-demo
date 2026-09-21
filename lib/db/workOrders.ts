import type { Dispatch } from "../dispatch/dispatchFor";
import type { GateResult } from "../dispatch/gate";
import type { Facts } from "../llm/schemas";
import { getDb } from "./client";

/** work_order holds current state. event holds what happened. */
export type PersistInput = {
  locationId: string;
  assetId: string | null;
  rawIntakeText: string;
  facts: Facts;
  dispatch: Dispatch;
  gateResult: GateResult;
  assumptions: unknown[];
  modelVersion: string;
  promptVersion: string;
};

export async function insertWorkOrder(input: PersistInput): Promise<string> {
  const { dispatch: d, facts: f } = input;

  const { data, error } = await getDb()
    .from("work_order")
    .insert({
      location_id: input.locationId,
      asset_id: input.assetId,
      raw_intake_text: input.rawIntakeText,
      trade: d.trade,
      urgency_tier: d.tier,
      urgency_rationale: d.rationale.text,
      respond_by: d.respondBy.at.toISOString(),
      business_impact: f.businessImpact,
      symptom_codes: f.symptoms.map((s) => s.code),
      suspected_causes: f.suspectedCauses,
      recommended_parts: d.bring,
      assumptions: input.assumptions,
      status: input.gateResult.status,
      confidence: f.confidence,
      model_version: input.modelVersion,
      prompt_version: input.promptVersion,
    })
    .select("id")
    .single();

  if (error) throw new Error(`insertWorkOrder: ${error.message}`);
  return (data as { id: string }).id;
}
