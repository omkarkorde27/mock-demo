import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod";

/**
 * The swappable file.
 *
 * Everything above this line in the chain is provider-specific; everything
 * below it is pure TypeScript. Changing model vendor means reimplementing
 * this interface and nothing else -- which is the point of stating it as an
 * interface rather than calling the SDK from inside the extractor.
 */

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type LlmCall<T> = {
  value: T;
  usage: Usage;
  costUsd: number;
  ms: number;
  model: string;
};

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  extract<T>(args: {
    system: string;
    user: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
    effort?: Effort;
  }): Promise<LlmCall<T>>;
}

/** Raised when the model answered but not in a shape we can use. */
export class ExtractionUnusableError extends Error {
  constructor(
    message: string,
    readonly reason: "unparseable" | "refusal" | "truncated",
  ) {
    super(message);
    this.name = "ExtractionUnusableError";
  }
}

/** USD per 1M tokens. Cache read ~0.1x input, cache write ~1.25x input. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
};

function costOf(model: string, u: Usage): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheReadTokens * p.input * 0.1 +
      u.cacheWriteTokens * p.input * 1.25) /
    1_000_000
  );
}

export class ClaudeProvider implements LlmProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(readonly model = "claude-sonnet-5") {
    // Resolves ANTHROPIC_API_KEY from the environment.
    this.client = new Anthropic();
  }

  async extract<T>({
    system,
    user,
    schema,
    maxTokens = 8000,
    effort = "medium",
  }: {
    system: string;
    user: string;
    schema: z.ZodType<T>;
    maxTokens?: number;
    effort?: Effort;
  }): Promise<LlmCall<T>> {
    const startedAt = Date.now();

    let response;
    try {
      response = await this.client.messages.parse({
        model: this.model,
        max_tokens: maxTokens,
        // The system prompt is byte-identical on every intake and is by far
        // the largest part of the request. Caching it turns ~2.9k input tokens
        // from full price into 0.1x on every call after the first.
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: user }],
        thinking: { type: "adaptive" },
        output_config: {
          effort,
          format: zodOutputFormat(schema),
        },
      });
    } catch (err) {
      // Most specific first. Never string-match error messages.
      if (err instanceof Anthropic.AuthenticationError) {
        throw new Error("Anthropic rejected the API key.");
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new Error("Rate limited by Anthropic. Try again shortly.");
      }
      if (err instanceof Anthropic.BadRequestError) {
        throw new Error(`Malformed request to Anthropic: ${err.message}`);
      }
      if (err instanceof Anthropic.APIError) {
        throw new Error(`Anthropic API error ${err.status}: ${err.message}`);
      }
      throw err;
    }

    const ms = Date.now() - startedAt;

    // stop_details is populated ONLY on refusal -- guard before reading it.
    if (response.stop_reason === "refusal") {
      throw new ExtractionUnusableError(
        `Model declined: ${response.stop_details?.explanation ?? "no reason given"}`,
        "refusal",
      );
    }
    if (response.stop_reason === "max_tokens") {
      throw new ExtractionUnusableError(
        "Model hit the output cap before finishing the extraction.",
        "truncated",
      );
    }
    if (response.parsed_output == null) {
      throw new ExtractionUnusableError(
        "Model returned output that did not match the extraction schema.",
        "unparseable",
      );
    }

    const usage: Usage = {
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    };

    return {
      value: response.parsed_output as T,
      usage,
      costUsd: costOf(this.model, usage),
      ms,
      model: this.model,
    };
  }
}

let cached: LlmProvider | null = null;
export function getProvider(): LlmProvider {
  if (!cached) cached = new ClaudeProvider();
  return cached;
}
