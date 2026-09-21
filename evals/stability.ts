/** Repeat-run stability probe. Same input, N times, report boolean variance. */
import { extractFacts } from "../lib/llm/extract";

const CASES: [string, string][] = [
  ["grease trap", "grease trap is backing up into the dish pit, smells awful"],
  ["cross-trade", "there's water all over the floor by the fryer"],
];
const N = 10;

async function runCase(label: string, TEXT: string) {
  console.log(`\n########## ${label} ##########`);
  const rows: Record<string, boolean>[] = [];
  let cost = 0;
  for (let i = 0; i < N; i++) {
    const r = await extractFacts(TEXT);
    const f = r.value;
    cost += r.costUsd;
    rows.push({
      safety_hazard: f.safetyHazard,
      service_blocking: f.serviceBlocking,
      loss_in_progress: f.lossInProgress,
      equipment_inoperable: f.equipmentInoperable,
      workaround_exists: f.workaroundExists,
    });
    process.stdout.write(
      `run ${String(i + 1).padStart(2)}: safety=${f.safetyHazard ? "Y" : "."} ` +
        `block=${f.serviceBlocking ? "Y" : "."} loss=${f.lossInProgress ? "Y" : "."} ` +
        `inop=${f.equipmentInoperable ? "Y" : "."} work=${f.workaroundExists ? "Y" : "."} ` +
        `| conf=${f.confidence} | uncertain=[${f.uncertainFields.join(",") || "-"}]\n`,
    );
  }
  console.log("\n=== split ===");
  for (const k of Object.keys(rows[0])) {
    const t = rows.filter((r) => r[k]).length;
    console.log(`${k.padEnd(22)} true ${t}/${N}   false ${N - t}/${N}${t !== 0 && t !== N ? "   <-- UNSTABLE" : ""}`);
  }
  console.log(`\ncost: $${cost.toFixed(4)}`);
}
async function main() {
  for (const [label, text] of CASES) await runCase(label, text);
}
main();
