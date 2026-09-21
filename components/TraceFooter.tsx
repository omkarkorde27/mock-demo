import type { IntakeResponse } from "@/lib/intakeTypes";

export function TraceFooter({ trace }: { trace: IntakeResponse["trace"] }) {
  const cached = trace.usage.cacheReadTokens > 0;
  const items = [
    `${trace.modelCalls} model call`,
    `${(trace.modelMs / 1000).toFixed(1)}s`,
    `$${trace.costUsd.toFixed(4)}`,
    `${trace.usage.inputTokens} in / ${trace.usage.outputTokens} out${cached ? ` / ${trace.usage.cacheReadTokens} cached` : ""}`,
    trace.model,
    trace.promptVersion,
  ];
  return (
    <p className="mt-6 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted)]">
      {items.join(" · ")}
      <span className="block mt-1">
        Everything after the model call is pure TypeScript — no second call to
        resolve the asset, pick the tier, or decide what to ask.
      </span>
    </p>
  );
}
