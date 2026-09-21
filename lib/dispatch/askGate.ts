import type { UncertainField } from "../llm/vocab";
import {
  dispatchFingerprint,
  dispatchFor,
  dispatchDiff,
  type Dispatch,
  type DispatchFacts,
} from "./dispatchFor";
import type { LocationHours } from "./respondBy";
import type { AssetResolution, ResolvableAsset } from "./resolveAsset";

/**
 * The follow-up gate. A for-loop, not a model call.
 *
 * The dispatch decision is a pure function, so "would knowing this field
 * change the dispatch?" is answered by calling that function once per
 * candidate value and comparing. Zero latency, zero cost, and provable rather
 * than probabilistic.
 *
 * The comparison is on dispatchFingerprint() -- the whole tuple as one
 * canonical string -- so the suppression claim cannot be undermined by a field
 * with a sloppy equality check. dispatchDiff() is used only to EXPLAIN which
 * slot moved; it never decides anything.
 */

/**
 * Below this, sweep all five booleans as question candidates even when the
 * model did not flag them.
 *
 * Deliberately NOT gate()'s CONFIDENCE_FLOOR (0.35), which is the dispatch
 * floor. Reusing that would make this nearly dead code: anything under it is
 * already needs_human. The interesting band is [0.35, 0.65) -- dispatchable,
 * but shaky enough that the model's self-reported certainty is not worth
 * trusting about which fields it got right.
 */
export const BOOLEAN_SWEEP_CEILING = 0.65;

/** Fields this gate knows how to enumerate values for. */
const BOOLEAN_FIELDS = [
  "safetyHazard",
  "serviceBlocking",
  "lossInProgress",
  "equipmentInoperable",
  "workaroundExists",
] as const;
type BooleanField = (typeof BOOLEAN_FIELDS)[number];

const UNCERTAIN_TO_BOOLEAN: Partial<Record<UncertainField, BooleanField>> = {
  safety_hazard: "safetyHazard",
  service_blocking: "serviceBlocking",
  loss_in_progress: "lossInProgress",
  equipment_inoperable: "equipmentInoperable",
  workaround_exists: "workaroundExists",
};

const BOOLEAN_QUESTION: Record<BooleanField, { question: string; whenTrue: string; whenFalse: string }> = {
  safetyHazard: {
    question: "Is anyone at risk right now — smoke, sparks, a gas smell, or someone who could get hurt?",
    whenTrue: "Yes, there's a hazard",
    whenFalse: "No, nothing like that",
  },
  serviceBlocking: {
    question: "Can you still serve customers?",
    whenTrue: "No, we can't serve",
    whenFalse: "Yes, we're still serving",
  },
  lossInProgress: {
    question: "Is it still getting worse right now, or has it stopped?",
    whenTrue: "Still getting worse",
    whenFalse: "It's stopped",
  },
  equipmentInoperable: {
    question: "Is the equipment doing its job at all?",
    whenTrue: "No, it's not working",
    whenFalse: "Yes, it still works",
  },
  workaroundExists: {
    question: "Do you have another way to get by for now?",
    whenTrue: "Yes, we can manage",
    whenFalse: "No, nothing else",
  },
};

export type QuestionOption = {
  label: string;
  /** Opaque token the answer route replays. */
  value: string;
};

export type Question = {
  field: string;
  question: string;
  options: QuestionOption[];
  /** Which dispatch slots move across the candidate values. */
  changes: string[];
};

/**
 * Why a question was not asked. Three genuinely different proofs -- labelled
 * separately so the panel never implies a counterfactual was run when it was
 * not.
 *
 *   diff_empty     varied across candidate values, dispatch tuple identical
 *   already_known  the asset record already answers it
 *   not_an_input   no dispatch decision reads this field at all
 */
export type SuppressionProof = "diff_empty" | "already_known" | "not_an_input";

export type SuppressedQuestion = {
  field: string;
  question: string;
  proof: SuppressionProof;
  reason: string;
  /** Only meaningful for diff_empty. */
  candidatesConsidered: number;
};

/**
 * Questions a form would ask that dispatch never reads. These are the point of
 * the whole gate: not "I was unsure and checked", but "I knew this was
 * irrelevant and declined to make you type it".
 */
const NON_DISPATCH_QUESTIONS: { field: string; question: string; reason: string }[] = [
  {
    field: "duration",
    question: "How long has it been like this?",
    reason:
      "No dispatch decision reads it. The tier comes from what is happening now, not how long it has been happening.",
  },
  {
    field: "reported_by",
    question: "Who noticed it?",
    reason: "No dispatch decision reads it. It changes nothing about who gets called or when.",
  },
];

export type AskGateResult = {
  asked: Question | null;
  suppressed: SuppressedQuestion[];
  /** The dispatch used when the question goes unanswered. Conservative. */
  baseline: Dispatch;
  /** Stated on the work order whenever a question was offered but not answered. */
  assumption: string | null;
};

type Candidate = {
  field: string;
  question: string;
  options: QuestionOption[];
  variants: { value: string; dispatch: Dispatch }[];
};

/** Of several dispatches, the one that commits us soonest. */
function mostUrgent(ds: Dispatch[]): Dispatch {
  return [...ds].sort(
    (a, b) =>
      a.respondBy.at.getTime() - b.respondBy.at.getTime() ||
      a.tier.localeCompare(b.tier),
  )[0];
}

export function askGate(input: {
  facts: DispatchFacts;
  confidence: number;
  uncertainFields: UncertainField[];
  resolution: AssetResolution;
  location: LocationHours;
  now: Date;
  /** False when gate() already decided nothing will be dispatched. */
  dispatching?: boolean;
}): AskGateResult {
  const { facts, confidence, uncertainFields, resolution, location, now } = input;
  const dispatching = input.dispatching ?? true;

  const run = (f: DispatchFacts, asset: ResolvableAsset | null): Dispatch =>
    dispatchFor(f, asset, location, now);

  // ---- baseline asset, and the asset question if the DB is ambiguous ----
  const assetCandidates: ResolvableAsset[] =
    resolution.kind === "ambiguous_same_trade" ? resolution.candidates : [];

  const baselineAsset =
    resolution.kind === "match"
      ? resolution.asset
      : assetCandidates.length > 0
        ? // Assume the candidate whose dispatch commits us soonest. A manager
          // at 6am will not answer a chatbot; under-triaging them is worse
          // than rolling a truck an hour early.
          assetCandidates
            .map((a) => ({ a, d: run(facts, a) }))
            .sort(
              (x, y) =>
                x.d.respondBy.at.getTime() - y.d.respondBy.at.getTime() ||
                x.a.label.localeCompare(y.a.label),
            )[0].a
        : null;

  const baseline = run(facts, baselineAsset);

  const candidates: Candidate[] = [];

  if (assetCandidates.length > 1) {
    candidates.push({
      field: "asset_identity",
      question: "Which one is it?",
      options: assetCandidates.map((a) => ({ label: a.label, value: a.id })),
      variants: assetCandidates.map((a) => ({
        value: a.id,
        dispatch: run(facts, a),
      })),
    });
  }

  // ---- boolean candidates ----
  const flagged = new Set(
    uncertainFields
      .map((f) => UNCERTAIN_TO_BOOLEAN[f])
      .filter((f): f is BooleanField => Boolean(f)),
  );

  // The deterministic sweep. Does not depend on the model self-reporting.
  const swept =
    confidence < BOOLEAN_SWEEP_CEILING ? new Set(BOOLEAN_FIELDS) : new Set<BooleanField>();

  for (const field of BOOLEAN_FIELDS) {
    if (!flagged.has(field) && !swept.has(field)) continue;
    const copy = BOOLEAN_QUESTION[field];
    candidates.push({
      field,
      question: copy.question,
      options: [
        { label: copy.whenTrue, value: "true" },
        { label: copy.whenFalse, value: "false" },
      ],
      variants: [true, false].map((v) => ({
        value: String(v),
        dispatch: run({ ...facts, [field]: v }, baselineAsset),
      })),
    });
  }

  // ---- questions a form would ask, that dispatch never reads ----
  const staticSuppressions: SuppressedQuestion[] = [];

  const knownAsset = resolution.kind === "match" ? resolution.asset : null;
  if (knownAsset?.make && knownAsset.model) {
    staticSuppressions.push({
      field: "make_model",
      question: "What brand and model is it?",
      proof: "already_known",
      reason: `The asset record already has it: ${knownAsset.make} ${knownAsset.model}. Asking would make a manager retype what the database knows.`,
      candidatesConsidered: 0,
    });
  }
  for (const q of NON_DISPATCH_QUESTIONS) {
    staticSuppressions.push({ ...q, proof: "not_an_input", candidatesConsidered: 0 });
  }

  // ---- the diff ----
  const suppressed: SuppressedQuestion[] = [...staticSuppressions];
  const eligible: { candidate: Candidate; changes: string[] }[] = [];

  for (const c of candidates) {
    const prints = c.variants.map((v) => dispatchFingerprint(v.dispatch));
    const identical = prints.every((p) => p === prints[0]);

    if (identical) {
      suppressed.push({
        field: c.field,
        question: c.question,
        proof: "diff_empty",
        reason: `Holding every other extracted value as-is, all ${c.variants.length} candidate values produce an identical dispatch — same trade, tier, respond-by, parts and warranty.`,
        candidatesConsidered: c.variants.length,
      });
      continue;
    }

    // Union of slots that move across any pair, for the explanation.
    const changes = new Set<string>();
    for (let i = 1; i < c.variants.length; i++) {
      for (const f of dispatchDiff(c.variants[0].dispatch, c.variants[i].dispatch)) {
        changes.add(f);
      }
    }
    eligible.push({ candidate: c, changes: [...changes] });
  }

  if (eligible.length === 0) {
    return { asked: null, suppressed, baseline, assumption: null };
  }

  // At most one question. Most dispatch slots moved wins; asset identity
  // breaks ties because it is the one a tech cannot resolve from the truck.
  eligible.sort(
    (a, b) =>
      b.changes.length - a.changes.length ||
      (b.candidate.field === "asset_identity" ? 1 : 0) -
        (a.candidate.field === "asset_identity" ? 1 : 0),
  );

  const winner = eligible[0];
  for (const e of eligible.slice(1)) {
    suppressed.push({
      field: e.candidate.field,
      question: e.candidate.question,
      proof: "diff_empty",
      reason: `Also changes dispatch (${e.changes.join(", ")}), but less than the question asked. Only one question is ever asked.`,
      candidatesConsidered: e.candidate.variants.length,
    });
  }

  // Which option the baseline corresponds to, by label rather than by id.
  const baselinePrint = dispatchFingerprint(baseline);
  const baselineIndex = winner.candidate.variants.findIndex(
    (v) => dispatchFingerprint(v.dispatch) === baselinePrint,
  );
  const baselineLabel =
    baselineIndex >= 0 ? winner.candidate.options[baselineIndex]?.label : undefined;
  const assumed = baselineLabel ? ` Assumed: ${baselineLabel}.` : "";
  const changed = winner.changes.join(", ");

  // Be exact about WHY this candidate was assumed. Three different situations
  // that a single template cannot honestly cover:
  //
  //   tied            no candidate is more urgent; the pick was arbitrary
  //   baseline worst  we assumed the cautious reading
  //   baseline better we assumed what the intake SAID, and the other answer is
  //                   worse -- which the operator needs told, because it is the
  //                   downside risk of not replying
  //
  // The old template claimed "the more urgent reading" in every untied case,
  // including ones where the baseline was the LESS urgent option. That is the
  // same class of error as claiming a judgement on an arbitrary tie-break.
  const times = winner.candidate.variants.map((v) => v.dispatch.respondBy.at.getTime());
  const earliest = Math.min(...times);
  const tied = earliest === Math.max(...times);
  const baselineIsMostUrgent = baseline.respondBy.at.getTime() === earliest;

  const worstIndex = times.indexOf(earliest);
  const worstLabel = winner.candidate.options[worstIndex]?.label;
  const worstTier = winner.candidate.variants[worstIndex]?.dispatch.tier;

  let assumption: string;
  if (!dispatching) {
    // Nothing is going out, so any sentence about how it was dispatched is a lie.
    assumption =
      `Nothing is being dispatched either way — this is the question a human should be asked first.` +
      (baselineLabel ? ` Working assumption: ${baselineLabel}.` : "") +
      ` An answer would change ${changed}.`;
  } else if (tied) {
    assumption =
      `Answer not required. Every option here is equally urgent, so this was not a judgement call —` +
      ` one was assumed so the work order could go out.${assumed}` +
      ` Answering changes ${changed}.`;
  } else if (baselineIsMostUrgent) {
    assumption =
      `Answer not required. Until someone replies this is dispatched on the more urgent reading.${assumed}` +
      ` Answering changes ${changed}.`;
  } else {
    assumption =
      `Answer not required. This is dispatched on what the intake actually said.${assumed}` +
      (worstLabel && worstTier
        ? ` If the answer is “${worstLabel}”, this becomes ${worstTier} and ${changed} change.`
        : ` Answering changes ${changed}.`);
  }

  return {
    asked: {
      field: winner.candidate.field,
      question: winner.candidate.question,
      options: winner.candidate.options,
      changes: winner.changes,
    },
    suppressed,
    baseline,
    assumption,
  };
}
