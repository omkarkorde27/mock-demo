import type { SuppressedQuestion, SuppressionProof } from "@/lib/dispatch/askGate";

const PROOF_LABEL: Record<SuppressionProof, { tag: string; title: string }> = {
  diff_empty: { tag: "diff empty", title: "Every candidate value was run through the dispatch function and the result was byte-identical." },
  already_known: { tag: "already known", title: "The asset record answers this already." },
  not_an_input: { tag: "not an input", title: "No dispatch decision reads this field." },
};

/**
 * Showing what it declined to ask, and why. A form cannot do this -- which is
 * the whole point of putting it on the page rather than in a write-up.
 */
export function SuppressedQuestions({ items }: { items: SuppressedQuestion[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-semibold">Not asked</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        A form would ask all of these. Each was checked and declined, with the reason kept.
      </p>
      <ul className="mt-3 space-y-3">
        {items.map((s) => (
          <li key={s.field} className="border-l-2 border-[var(--border)] pl-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium">{s.question}</span>
              <span title={PROOF_LABEL[s.proof].title}
                className="rounded bg-[var(--chip)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                {PROOF_LABEL[s.proof].tag}
              </span>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">{s.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
