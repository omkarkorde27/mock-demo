import type { ProvenanceMap } from "./provenance";

/**
 * Pure over (asset row, today). `today` is injected -- a Date.now() inside
 * would make this untestable and make the eval unable to replay fixtures.
 *
 * Lives inside the Dispatch tuple rather than beside it, so askGate diffs it
 * for free: "the walk-in is under warranty and the reach-in is not" becomes
 * another reason the asset question has real delta.
 */

export type WarrantyInput = {
  warrantyExpiresOn: string | null; // ISO date from the asset row
};

export type WarrantyFlag = {
  expiresOn: string | null;
  underWarranty: boolean;
  daysRemaining: number | null;
  /** Null when there is nothing worth telling a dispatcher. */
  note: string | null;
};

/** Item 4: the same {value, source} discipline as BringItem, as a field map. */
export const WARRANTY_PROVENANCE = {
  expiresOn: "database",
  underWarranty: "computed",
  daysRemaining: "computed",
  note: "computed",
} as const satisfies ProvenanceMap<WarrantyFlag>;

const DAY = 86_400_000;

export function warrantyFlag(
  asset: WarrantyInput | null,
  today: Date,
): WarrantyFlag {
  const none: WarrantyFlag = {
    expiresOn: null,
    underWarranty: false,
    daysRemaining: null,
    note: null,
  };

  if (!asset?.warrantyExpiresOn) return none;

  const expiry = new Date(`${asset.warrantyExpiresOn}T00:00:00Z`);
  if (Number.isNaN(expiry.getTime())) return none;

  // Compare whole days in UTC so a time-of-day difference cannot flip the
  // answer on the boundary date.
  const todayUtc = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const daysRemaining = Math.round((expiry.getTime() - todayUtc) / DAY);
  const underWarranty = daysRemaining >= 0;

  return {
    expiresOn: asset.warrantyExpiresOn,
    underWarranty,
    daysRemaining,
    note: underWarranty
      ? `Under warranty until ${asset.warrantyExpiresOn} -- confirm coverage before authorising a paid repair.`
      : `Warranty expired ${asset.warrantyExpiresOn}.`,
  };
}
