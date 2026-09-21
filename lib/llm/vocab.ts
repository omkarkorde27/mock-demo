/**
 * Closed vocabularies. THE source of truth.
 *
 * Consumed by three things that must never drift apart:
 *   1. the prompt (descriptions below are rendered into it)
 *   2. the normalizer that maps model output onto these values
 *   3. the lookup tables in lib/dispatch that key off them
 *
 * The CHECK constraints in supabase/schema.sql mirror this file. If they ever
 * disagree, the insert fails loudly, which is the point.
 */

// ---------------------------------------------------------------------------
// Trades -- who gets dispatched
// ---------------------------------------------------------------------------
export const TRADES = [
  "refrigeration",
  "cooking_equipment",
  "plumbing",
  "electrical",
  "hvac",
  "networking",
  "fire_safety",
] as const;
export type Trade = (typeof TRADES)[number];

// ---------------------------------------------------------------------------
// Asset types -- keys the parts catalog
// ---------------------------------------------------------------------------
export const ASSET_TYPES = [
  "walk_in_cooler",
  "reach_in_cooler",
  "ice_machine",
  "fryer",
  "griddle",
  "grease_trap",
  "three_comp_sink",
  "dishwasher",
  "water_heater",
  "exhaust_hood",
  "rooftop_hvac",
  "pos_terminal",
  "network_switch",
  "fire_suppression",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

// ---------------------------------------------------------------------------
// Symptom codes -- the ONLY symptom value any dispatch function reads.
//
// 'other' is not a failure of the vocabulary, it is part of it. A symptom we
// cannot name is routed to a human with the raw text intact, rather than being
// forced into the nearest code so a parts list can be guessed from it.
// ---------------------------------------------------------------------------
export const SYMPTOM_CODES = [
  "not_holding_temp",
  "not_heating",
  "icing_up",
  "leaking_water",
  "backing_up",
  "no_hot_water",
  "no_power",
  "wont_start",
  "no_connectivity",
  "unusual_noise",
  "odor",
  "error_code",
  "physical_damage",
  "other",
] as const;
export type SymptomCode = (typeof SYMPTOM_CODES)[number];

/** Rendered into the prompt. `satisfies` makes a missing entry a compile error. */
export const SYMPTOM_CODE_DESCRIPTIONS = {
  not_holding_temp: "running but not reaching or holding its target temperature",
  not_heating: "a heating appliance that will not come up to temperature",
  icing_up: "frost or ice building up where it should not",
  leaking_water: "water escaping, pooling, or on the floor",
  backing_up: "a drain or waste line not carrying away; overflowing",
  no_hot_water: "no hot water at the tap or machine",
  no_power: "completely dead, no lights, no display",
  wont_start: "has power but will not turn on or start a cycle",
  no_connectivity: "offline, cannot reach the network or process payments",
  unusual_noise: "a new or worsening mechanical noise",
  odor: "an unusual smell -- gas, burning, sewage, chemical",
  error_code: "displaying a fault or error code",
  physical_damage: "visibly broken, cracked, bent, or torn",
  other: "a real symptom none of the above describes -- do NOT force a fit",
} satisfies Record<SymptomCode, string>;

// ---------------------------------------------------------------------------
// Deadline -- structured so merging it with location hours is arithmetic
// ---------------------------------------------------------------------------
export const DEADLINE_KINDS = ["before_open", "absolute", "none"] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

// ---------------------------------------------------------------------------
// Fields the model may flag as uncertain. askGate iterates exactly these.
// ---------------------------------------------------------------------------
export const UNCERTAIN_FIELDS = [
  "asset_identity",
  "trade",
  "safety_hazard",
  "service_blocking",
  "loss_in_progress",
  "equipment_inoperable",
  "workaround_exists",
  "deadline",
] as const;
export type UncertainField = (typeof UNCERTAIN_FIELDS)[number];

// ---------------------------------------------------------------------------
// Dispatch outputs -- mirrored by CHECK constraints in schema.sql
// ---------------------------------------------------------------------------
export const URGENCY_TIERS = ["P1", "P2", "P3", "P4"] as const;
export type UrgencyTier = (typeof URGENCY_TIERS)[number];

export const WORK_ORDER_STATUSES = [
  "dispatchable",
  "dispatchable_with_assumption",
  "needs_human",
  "out_of_scope",
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const EVENT_TYPES = [
  "intake_received",
  "classified",
  "question_asked",
  "answer_received",
  "reclassified",
  "escalated",
  "trade_disagreement",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_ACTORS = ["manager", "system", "model"] as const;
export type EventActor = (typeof EVENT_ACTORS)[number];

// ---------------------------------------------------------------------------
// Guards. Used by the normalizer -- never trust that model output is in vocab.
// ---------------------------------------------------------------------------
const set = <T extends readonly string[]>(xs: T) => new Set<string>(xs);

const TRADE_SET = set(TRADES);
const SYMPTOM_SET = set(SYMPTOM_CODES);
const ASSET_TYPE_SET = set(ASSET_TYPES);
const UNCERTAIN_SET = set(UNCERTAIN_FIELDS);
const DEADLINE_KIND_SET = set(DEADLINE_KINDS);

export const isTrade = (v: string): v is Trade => TRADE_SET.has(v);
export const isSymptomCode = (v: string): v is SymptomCode => SYMPTOM_SET.has(v);
export const isAssetType = (v: string): v is AssetType => ASSET_TYPE_SET.has(v);
export const isUncertainField = (v: string): v is UncertainField => UNCERTAIN_SET.has(v);
export const isDeadlineKind = (v: string): v is DeadlineKind => DEADLINE_KIND_SET.has(v);
