/**
 * Pick a `ModelRouter` based on env. Production code should always go
 * through this factory rather than instantiating an adapter directly,
 * so the kill switch and budget guard apply uniformly.
 *
 * Env contract:
 *   AI_MODE = "mock"      → MockModelRouter (default; CI + dev safe).
 *   AI_MODE = "anthropic" → AnthropicModelRouter wrapped in
 *                            CostControlledRouter. Requires
 *                            ANTHROPIC_API_KEY.
 *
 * Anything else is treated as "mock". This is deliberate — production
 * must explicitly opt in to a real model. Misconfiguration silently
 * downgrading to mock is preferable to silently calling a real API.
 */
import { MockModelRouter } from "./mock-adapter.js";
import { AnthropicModelRouter } from "./anthropic-adapter.js";
import { CostControlledRouter } from "./cost-controlled-router.js";
import type { ModelRouter } from "./model-router.js";

export type AiMode = "mock" | "anthropic";

export interface CreateModelRouterOptions {
  /** Override env-detected mode. Useful in tests. */
  mode?: AiMode;
  /** Override env-detected API key. */
  apiKey?: string;
  /** Anthropic model id. Default `claude-sonnet-4-5`. */
  model?: string;
  /** Override base URL — used by tests with a mocked fetch. */
  baseUrl?: string;
  /** Injected fetch — used by tests. */
  fetchImpl?: typeof fetch;
  /**
   * Wrap the resulting router in a CostControlledRouter. Defaults to
   * true for the `anthropic` mode and false for `mock`. Pass an explicit
   * options object to customise caps; pass `false` to skip wrapping
   * even in real mode (not recommended outside tests).
   */
  budget?:
    | false
    | {
        budgetKey: string;
        maxOutputTokens: number;
        maxInputTokens?: number;
      };
}

const DEFAULT_BUDGET_MAX_OUTPUT_TOKENS = 25_000;

export function createModelRouter(opts: CreateModelRouterOptions = {}): ModelRouter {
  const mode = resolveMode(opts.mode ?? process.env["AI_MODE"]);

  if (mode === "mock") {
    return new MockModelRouter();
  }

  const apiKey = opts.apiKey ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "createModelRouter: AI_MODE=anthropic but ANTHROPIC_API_KEY is missing.",
    );
  }

  const adapterOpts: ConstructorParameters<typeof AnthropicModelRouter>[0] = {
    apiKey,
  };
  if (opts.model !== undefined) adapterOpts.model = opts.model;
  if (opts.baseUrl !== undefined) adapterOpts.baseUrl = opts.baseUrl;
  if (opts.fetchImpl !== undefined) adapterOpts.fetchImpl = opts.fetchImpl;

  const inner = new AnthropicModelRouter(adapterOpts);

  if (opts.budget === false) return inner;

  const budget = opts.budget ?? {
    budgetKey: "default",
    maxOutputTokens: DEFAULT_BUDGET_MAX_OUTPUT_TOKENS,
  };

  const wrapperOpts: ConstructorParameters<typeof CostControlledRouter>[0] = {
    inner,
    budgetKey: budget.budgetKey,
    maxOutputTokens: budget.maxOutputTokens,
  };
  if (budget.maxInputTokens !== undefined) wrapperOpts.maxInputTokens = budget.maxInputTokens;

  return new CostControlledRouter(wrapperOpts);
}

function resolveMode(raw: string | undefined): AiMode {
  if (raw === "anthropic") return "anthropic";
  return "mock";
}
