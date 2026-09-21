import * as z from "zod";
import type {
  DeadlineKind,
  SymptomCode,
  Trade,
  UncertainField,
} from "./vocab";

/**
 * WIRE schema -- deliberately permissive on every vocabulary field.
 *
 * The SDK renders z.enum() as {"type":"string"} with the allowed values in a
 * description, NOT as a JSON Schema `enum` constraint. The vocabulary is
 * therefore advisory to the model, not enforced by the server. If we declared
 * z.enum() here, one out-of-vocabulary string would fail the parse and throw
 * away an otherwise good extraction -- including the four booleans, which are
 * the part we most need.
 *
 * So: accept strings on the wire, then normalize. An unrecognized symptom
 * becomes `other` with its raw text preserved, which is exactly the behaviour
 * we want anyway. See normalize.ts.
 */
export const ExtractionWireSchema = z.object({
  is_maintenance_request: z.boolean(),
  out_of_scope_reason: z.string().nullable(),

  trade_candidates: z.array(
    z.object({ trade: z.string(), confidence: z.number() }),
  ),

  // The words the manager used for the equipment. resolveAsset is the ONLY
  // consumer -- it is never shown as a decision and never routed on directly.
  asset_descriptor: z.string().nullable(),

  // {code, raw} pairs so an unnameable symptom keeps its original words.
  symptoms: z.array(z.object({ code: z.string(), raw: z.string() })),

  safety_hazard: z.boolean(),
  service_blocking: z.boolean(),
  loss_in_progress: z.boolean(),
  equipment_inoperable: z.boolean(),
  workaround_exists: z.boolean(),

  deadline: z.object({
    kind: z.string(),
    at: z.string().nullable(),
    stated_as: z.string().nullable(),
  }),

  uncertain_fields: z.array(z.string()),
  confidence: z.number(),

  // ---- prose. nothing downstream reads any of these. ----
  business_impact: z.string().nullable(),
  suspected_causes: z.array(z.string()),
  what_would_change_my_mind: z.string().nullable(),
});

export type ExtractionWire = z.infer<typeof ExtractionWireSchema>;

/** Normalized facts. Every vocabulary field is now a real union type. */
export type Facts = {
  isMaintenanceRequest: boolean;
  outOfScopeReason: string | null;

  tradeCandidates: { trade: Trade; confidence: number }[];
  /** Out-of-vocabulary trades the model proposed. Kept, not hidden. */
  droppedTrades: string[];

  assetDescriptor: string | null;

  symptoms: { code: SymptomCode; raw: string }[];
  /** Raw text for symptoms that normalized to `other`. Drives the copy. */
  unknownSymptomTexts: string[];

  safetyHazard: boolean;
  serviceBlocking: boolean;
  lossInProgress: boolean;
  equipmentInoperable: boolean;
  workaroundExists: boolean;

  deadline: { kind: DeadlineKind; at: string | null; statedAs: string | null };

  uncertainFields: UncertainField[];
  confidence: number;

  businessImpact: string | null;
  suspectedCauses: string[];
  whatWouldChangeMyMind: string | null;
};
