/**
 * Prompt-version regression harness.
 *
 * Reconstructs v1 from the live v2 prompt string rather than editing source,
 * so both versions are captured in one run with nothing to revert. Each case
 * runs N times per version: single runs cannot distinguish a prompt effect
 * from ordinary sampling variance.
 */
import { readFileSync } from "node:fs";
import { EXTRACT_SYSTEM_PROMPT, PROMPT_VERSION } from "../lib/llm/extract";
import { normalize } from "../lib/llm/normalize";
import { getProvider } from "../lib/llm/provider";
import { ExtractionWireSchema, type Facts } from "../lib/llm/schemas";

const BASELINE = process.env.BASELINE ?? "extract-2026-09-20.1";

/** The "before" is a frozen file, not a reconstruction. Baselines must not drift. */
const V1 = readFileSync(`evals/baselines/${BASELINE}.prompt.txt`, "utf8");
const V2 = EXTRACT_SYSTEM_PROMPT;
if (V1 === V2) throw new Error("baseline is identical to the live prompt");

const CASES: [string, string][] = [
  ["refrigeration/specific", "walk in has been at 52 since last night, food is gonna spoil, we open at 11"],
  ["refrigeration/generic", "the fridge is at 52, food is gonna spoil, we open at 11"],
  ["fryer", "fryer won't heat up, we open in an hour"],
  ["grease trap", "grease trap is backing up into the dish pit, smells awful"],
  ["POS network", "card reader won't connect, we can't take any payments at all"],
  ["plumbing", "no hot water in the dish pit and the health inspector is coming thursday"],
  ["cross-trade", "there's water all over the floor by the fryer"],
  ["vague", "something's wrong in the back"],
  ["out of scope", "what time does the mail usually come"],
  ["cosmetic", "the handle on the walk in door is loose, not urgent"],
];

const RUNS = 3;

/** Fields compared across versions. Prose is excluded: nothing reads it. */
function signature(f: Facts): Record<string, string> {
  return {
    maintenance: String(f.isMaintenanceRequest),
    top_trade: f.tradeCandidates[0]?.trade ?? "-",
    symptoms: f.symptoms.map((s) => s.code).sort().join(","),
    safety_hazard: String(f.safetyHazard),
    service_blocking: String(f.serviceBlocking),
    loss_in_progress: String(f.lossInProgress),
    equipment_inoperable: String(f.equipmentInoperable),
    workaround_exists: String(f.workaroundExists),
    deadline_kind: f.deadline.kind,
    uncertain: [...f.uncertainFields].sort().join(","),
  };
}



type Cell = { majority: string; unstable: boolean; values: string[] };

async function capture(system: string): Promise<Map<string, Record<string, Cell>>> {
  const provider = getProvider();
  const out = new Map<string, Record<string, Cell>>();

  for (const [label, text] of CASES) {
    const sigs: Record<string, string>[] = [];
    for (let i = 0; i < RUNS; i++) {
      const call = await provider.extract({
        system,
        user: text,
        schema: ExtractionWireSchema,
        maxTokens: 8000,
        effort: "low",
      });
      sigs.push(signature(normalize(call.value)));
    }
    const row: Record<string, Cell> = {};
    for (const field of Object.keys(sigs[0])) {
      const values = sigs.map((s) => s[field]);
      const counts = new Map<string, number>();
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      row[field] = { majority, unstable: counts.size > 1, values };
    }
    out.set(label, row);
    process.stdout.write(".");
  }
  return out;
}

async function main() {
  process.stdout.write(`capturing baseline (${BASELINE}) `);
  const v1 = await capture(V1);
  process.stdout.write(`\ncapturing live (${PROMPT_VERSION}) `);
  const v2 = await capture(V2);
  console.log("\n");

  let changed = 0;
  let stabilityGained = 0;
  let stabilityLost = 0;

  for (const [label] of CASES) {
    const a = v1.get(label)!;
    const b = v2.get(label)!;
    const diffs: string[] = [];

    for (const field of Object.keys(a)) {
      const ca = a[field];
      const cb = b[field];
      if (ca.majority !== cb.majority) {
        diffs.push(`  CHANGED ${field}: ${ca.majority} -> ${cb.majority}`);
        changed++;
      }
      if (ca.unstable && !cb.unstable) {
        diffs.push(`  stabilised ${field}: [${ca.values.join("/")}] -> ${cb.majority}`);
        stabilityGained++;
      } else if (!ca.unstable && cb.unstable) {
        diffs.push(`  DESTABILISED ${field}: ${ca.majority} -> [${cb.values.join("/")}]`);
        stabilityLost++;
      }
    }

    console.log(diffs.length ? `${label}\n${diffs.join("\n")}` : `${label}: no change`);
  }

  console.log(
    `\n=== ${changed} majority changes | ${stabilityGained} stabilised | ${stabilityLost} destabilised ` +
      `(${CASES.length} cases x ${RUNS} runs x 2 versions = ${CASES.length * RUNS * 2} calls) ===`,
  );
}

main();
