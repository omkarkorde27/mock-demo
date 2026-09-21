/** Quick behavioural smoke test for the extraction call. Not the eval harness. */
import { extractFacts } from "../lib/llm/extract";

const CASES = [
  ["refrigeration / specific", "walk in has been at 52 since last night, food is gonna spoil, we open at 11"],
  ["refrigeration / generic", "the fridge is at 52, food is gonna spoil, we open at 11"],
  ["fryer", "fryer won't heat up, we open in an hour"],
  ["grease trap", "grease trap is backing up into the dish pit, smells awful"],
  ["POS network", "card reader won't connect, we can't take any payments at all"],
  ["plumbing", "no hot water in the dish pit and the health inspector is coming thursday"],
  ["cross-trade", "there's water all over the floor by the fryer"],
  ["vague", "something's wrong in the back"],
  ["out of scope", "what time does the mail usually come"],
  ["cosmetic / should be P4", "the handle on the walk in door is loose, not urgent"],
];

const b = (v: boolean) => (v ? "Y" : ".");

async function main() {
  let totalCost = 0;
  let totalMs = 0;

  for (const [label, text] of CASES) {
    try {
      const r = await extractFacts(text);
      const f = r.value;
      totalCost += r.costUsd;
      totalMs += r.ms;
      const flags = `safety=${b(f.safetyHazard)} block=${b(f.serviceBlocking)} loss=${b(f.lossInProgress)} inop=${b(f.equipmentInoperable)} workaround=${b(f.workaroundExists)}`;
      console.log(`\n--- ${label} ---`);
      console.log(`  "${text}"`);
      console.log(`  maintenance : ${f.isMaintenanceRequest}${f.outOfScopeReason ? ` (${f.outOfScopeReason})` : ""}`);
      console.log(`  trades      : ${f.tradeCandidates.map((t) => `${t.trade}@${t.confidence}`).join(", ") || "(none)"}`);
      console.log(`  descriptor  : ${f.assetDescriptor ?? "(null)"}`);
      console.log(`  symptoms    : ${f.symptoms.map((s) => s.code).join(", ") || "(none)"}`);
      if (f.unknownSymptomTexts.length) console.log(`  unknown     : ${JSON.stringify(f.unknownSymptomTexts)}`);
      console.log(`  booleans    : ${flags}`);
      console.log(`  deadline    : ${f.deadline.kind}${f.deadline.at ? ` @${f.deadline.at}` : ""}${f.deadline.statedAs ? ` ("${f.deadline.statedAs}")` : ""}`);
      console.log(`  uncertain   : ${f.uncertainFields.join(", ") || "(none)"}`);
      console.log(`  confidence  : ${f.confidence}`);
      console.log(`  cost/ms     : $${r.costUsd.toFixed(5)} / ${r.ms}ms  (in ${r.usage.inputTokens} out ${r.usage.outputTokens} cacheR ${r.usage.cacheReadTokens} cacheW ${r.usage.cacheWriteTokens})`);
    } catch (err) {
      console.log(`\n--- ${label} --- ERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n=== total: $${totalCost.toFixed(4)} over ${CASES.length} calls, avg ${Math.round(totalMs / CASES.length)}ms ===`);
}

main();
