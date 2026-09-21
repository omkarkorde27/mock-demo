/**
 * The in-flight state.
 *
 * Deliberately does not fake progress through the deterministic steps. There
 * is exactly one thing to wait for -- the model call -- and the rest completes
 * in under a millisecond. Animating a fake five-stage progress bar would
 * misrepresent the architecture the page is arguing for.
 */
export function PipelineTrace() {
  return (
    <section
      aria-busy="true"
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[var(--warn)]" />
        <p className="text-sm font-medium">Reading the intake…</p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
        One model call, extracting facts into a closed vocabulary. Resolving the
        asset, computing the tier and respond-by, diffing every candidate answer
        against the dispatch — all of that happens after this returns, and takes
        under a millisecond.
      </p>
    </section>
  );
}
