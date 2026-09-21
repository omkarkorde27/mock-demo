/**
 * Where a displayed value came from. One vocabulary, consumed by every
 * dispatch module and by the source badges on the work order card.
 *
 * Provenance is a property of the FIELD, not of an instance, so each module
 * exports a static map keyed by its own field names. `satisfies` makes a
 * missing entry a compile error, which is what stops a new field from quietly
 * shipping unbadged.
 */
export type ProvenanceSource = "model" | "computed" | "database";

export type ProvenanceMap<T> = Record<keyof T, ProvenanceSource>;
