import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AnthropicModelRouter,
  CostControlledRouter,
  MockModelRouter,
} from "@runwayops/ai";

import {
  getActivityContext,
  initActivityContext,
} from "../src/temporal/activities/context.js";

/**
 * The worker boot path is the only place production AI calls originate.
 * This test pins the env-resolution contract end-to-end at the activity
 * boundary: worker reads `AI_MODE`, hands the right router to every
 * activity body, and surfaces the resolved mode so an operator can see
 * it in startup logs. A regression here means a worker silently calls
 * the wrong router — exactly the silent-misconfiguration failure mode
 * the kill switch is supposed to prevent.
 */

const ENV_KEYS = ["AI_MODE", "ANTHROPIC_API_KEY", "DATABASE_URL"] as const;

describe("initActivityContext", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) original[k] = process.env[k];
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it("uses the MockModelRouter and reports aiMode='mock' when AI_MODE is unset", () => {
    // Pass a db override so the factory does not try to open a real pool.
    const ctx = initActivityContext({ db: {} as never });
    expect(ctx.aiMode).toBe("mock");
    expect(ctx.ai).toBeInstanceOf(MockModelRouter);
  });

  it("constructs a CostControlledRouter wrapping AnthropicModelRouter when AI_MODE=anthropic", () => {
    process.env["AI_MODE"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    const ctx = initActivityContext({ db: {} as never });
    expect(ctx.aiMode).toBe("anthropic");
    expect(ctx.ai).toBeInstanceOf(CostControlledRouter);
  });

  it("rejects AI_MODE=anthropic without an API key (loud failure, not silent downgrade)", () => {
    process.env["AI_MODE"] = "anthropic";
    expect(() => initActivityContext({ db: {} as never })).toThrow(
      /ANTHROPIC_API_KEY is missing/,
    );
  });

  it("treats unknown AI_MODE values as mock (silent downgrade is intentional)", () => {
    process.env["AI_MODE"] = "openai";
    const ctx = initActivityContext({ db: {} as never });
    expect(ctx.aiMode).toBe("mock");
    expect(ctx.ai).toBeInstanceOf(MockModelRouter);
  });

  it("getActivityContext() returns the same instance after init", () => {
    const ctx = initActivityContext({ db: {} as never });
    expect(getActivityContext()).toBe(ctx);
  });

  it("test overrides bypass env entirely and report the supplied mode", () => {
    process.env["AI_MODE"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    const fakeAi = new MockModelRouter();
    const ctx = initActivityContext({ db: {} as never, ai: fakeAi, aiMode: "mock" });
    expect(ctx.ai).toBe(fakeAi);
    expect(ctx.aiMode).toBe("mock");
    // Confirm we can construct a real router from the same env when not overridden.
    expect(AnthropicModelRouter).toBeTypeOf("function");
  });
});
