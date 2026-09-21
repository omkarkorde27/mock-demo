import type { AssetType, SymptomCode, Trade } from "../llm/vocab";

/**
 * The parts catalog, in three layers.
 *
 * HONESTY NOTE, and it belongs in the README and the note verbatim. Be precise
 * about WHICH parts are guesses, because "the catalog might be off" invites a
 * shrug, and "these 11 cells might be off" invites a correction.
 *
 *   STRUCTURALLY GUARANTEED, not a guess:
 *     - every Trade has a kit; the compiler enforces it
 *     - every SymptomCode has a kit; the compiler enforces it
 *     - `other` is empty on purpose, so an unnameable symptom can never
 *       produce a parts list
 *     - anything with no override falls through to those layers and is
 *       reported as `trade_generic`, never dressed up as asset-specific
 *
 *   DOMAIN JUDGEMENT, and where I could simply be wrong -- 11 cells, listed
 *   in TYPE_OVERRIDE below, written by a software engineer rather than a
 *   refrigeration tech. If a line here is wrong, it is wrong in one named
 *   cell, it is wrong in isolation, and correcting it touches nothing else.
 *
 * The structure is the contribution. The 11 strings are the invitation.
 *
 *   TRADE_KIT     what any tech of that trade has on the truck anyway.
 *                 Exhaustive over Trade -- the compiler enforces it.
 *   SYMPTOM_KIT   what the symptom implies regardless of the equipment.
 *                 Exhaustive over SymptomCode -- the compiler enforces it.
 *   TYPE_OVERRIDE the precise stuff, and ONLY for the cells the demo
 *                 exercises. Deliberately sparse. See the pin below.
 *
 * Full AssetType x SymptomCode coverage would be 14 x 14 = 196 cells of
 * invented domain fiction, which is exactly the part a founder who has spent
 * years in this industry would spot as invented. So the override is pinned to
 * 11 cells and a test fails if that number changes.
 */

export type BringSource =
  | "trade_kit"
  | "symptom_kit"
  | "type_override"
  | "asset_record";

export type BringItem = {
  item: string;
  source: BringSource;
};

// --- layer 1: exhaustive over Trade ----------------------------------------
export const TRADE_KIT = {
  refrigeration: ["manifold gauge set", "electronic leak detector", "calibrated thermometer"],
  cooking_equipment: ["multimeter", "high-temp gasket assortment"],
  plumbing: ["drain auger", "wet vac", "pipe wrench", "common fittings"],
  electrical: ["multimeter", "insulated hand tools", "assorted breakers and fuses"],
  hvac: ["manifold gauge set", "multimeter", "common filters and belts"],
  networking: ["laptop with console cable", "cable tester", "spare patch cables"],
  fire_safety: ["inspection tags", "certification paperwork"],
} satisfies Record<Trade, string[]>;

// --- layer 2: exhaustive over SymptomCode ----------------------------------
export const SYMPTOM_KIT = {
  not_holding_temp: ["calibrated thermometer", "temperature log sheet"],
  not_heating: ["multimeter for element and thermostat continuity"],
  icing_up: ["defrost equipment", "calibrated thermometer"],
  leaking_water: ["wet vac", "absorbent pads", "moisture meter"],
  backing_up: ["drain auger", "wet vac", "waste containment"],
  no_hot_water: ["calibrated thermometer", "multimeter"],
  no_power: ["multimeter", "breaker panel access"],
  wont_start: ["multimeter"],
  no_connectivity: ["cable tester", "laptop with console cable"],
  unusual_noise: ["mechanic's stethoscope", "hand tools"],
  odor: ["combustible gas detector"],
  error_code: ["service manual for the installed model"],
  physical_damage: ["camera for documentation", "hand tools"],
  // Nothing. By design: we will not guess a parts list from words we could
  // not name. This route goes to a human instead.
  other: [],
} satisfies Record<SymptomCode, string[]>;

// --- layer 3: the pinned override ------------------------------------------
/**
 * PINNED to exactly the six seeded scenarios plus the three failure buttons.
 * The failure buttons contribute zero cells by construction -- vague,
 * out-of-scope and `other` never reach the catalog. Adding a twelfth cell is a
 * scope change, and parts.test.ts fails until it is acknowledged.
 */
export const TYPE_OVERRIDE: Partial<
  Record<AssetType, Partial<Record<SymptomCode, string[]>>>
> = {
  // refrigeration pair -- the ambiguous one
  walk_in_cooler: {
    not_holding_temp: [
      "condenser fan motor",
      "evaporator fan motor",
      "contactor",
      "defrost termination thermostat",
    ],
  },
  reach_in_cooler: {
    not_holding_temp: ["door gasket", "evaporator fan motor", "start relay"],
  },
  // fryer scenario + its role in the cross-trade case
  fryer: {
    not_heating: ["high-limit thermostat", "igniter assembly", "temperature probe"],
    leaking_water: ["drain valve gasket", "fry pot seal"],
  },
  // grease trap scenario
  grease_trap: {
    backing_up: ["pump-out hose", "PPE", "replacement baffle"],
  },
  // POS scenario -- two candidates, which is what gives it dispatch delta
  pos_terminal: {
    no_connectivity: ["spare terminal", "receipt printer cable"],
  },
  network_switch: {
    no_connectivity: ["spare PoE injector", "patch cables"],
  },
  // plumbing scenario
  water_heater: {
    no_hot_water: ["thermocouple", "gas control valve", "anode rod"],
  },
  three_comp_sink: {
    leaking_water: ["P-trap", "tailpiece washers", "basket strainer"],
    backing_up: ["P-trap", "basket strainer"],
  },
  // third candidate in the cross-trade case
  ice_machine: {
    leaking_water: ["drain line", "water inlet valve", "float switch"],
  },
};

/** The pin, as a number a test can assert on. */
export const PINNED_OVERRIDE_CELLS = 11;

export function countOverrideCells(): number {
  return Object.values(TYPE_OVERRIDE).reduce(
    (n, bySymptom) => n + Object.keys(bySymptom ?? {}).length,
    0,
  );
}

/**
 * Whether a type has any precise content at all. Used by the UI to say so out
 * loud rather than letting a generic list pass as a specific one.
 */
export function isAssetTypeCovered(type: AssetType): boolean {
  return Object.keys(TYPE_OVERRIDE[type] ?? {}).length > 0;
}
