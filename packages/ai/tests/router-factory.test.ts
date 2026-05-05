import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AnthropicModelRouter,
  CostControlledRouter,
  MockModelRouter,
  createModelRouter,
} from "../src/index.js";

/**
 * Factory contract: production code only ever calls `createModelRouter()`,
 * so this is the single chokepoint that must keep the kill switch and
 * budget guard honest. Misconfiguration must downgrade to mock — never
 * silently call a real provider.
 */

const ENV_KEYS = ["AI_MODE", "ANTHROPIC_API_KEY"] as const;

describe("createModelRouter", () => {
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

  it("returns a MockModelRouter when AI_MODE is unset", () => {
    const router = createModelRouter();
    expect(router).toBeInstanceOf(MockModelRouter);
  });

  it("returns a MockModelRouter for unknown AI_MODE values (silent downgrade)", () => {
    process.env["AI_MODE"] = "openai";
    const router = createModelRouter();
    expect(router).toBeInstanceOf(MockModelRouter);
  });

  it("throws when AI_MODE=anthropic but ANTHROPIC_API_KEY is missing", () => {
    process.env["AI_MODE"] = "anthropic";
    expect(() => createModelRouter()).toThrow(/ANTHROPIC_API_KEY is missing/);
  });

  it("returns a CostControlledRouter wrapping AnthropicModelRouter when AI_MODE=anthropic + key present", () => {
    process.env["AI_MODE"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "sk-test";
    const router = createModelRouter();
    expect(router).toBeInstanceOf(CostControlledRouter);
  });

  it("skips the cost-control wrapper when budget=false (test-only)", () => {
    const router = createModelRouter({
      mode: "anthropic",
      apiKey: "sk-test",
      budget: false,
    });
    expect(router).toBeInstanceOf(AnthropicModelRouter);
    expect(router).not.toBeInstanceOf(CostControlledRouter);
  });

  it("uses explicit budget options when provided", () => {
    const router = createModelRouter({
      mode: "anthropic",
      apiKey: "sk-test",
      budget: { budgetKey: "co-1:2026-05-05", maxOutputTokens: 5000 },
    });
    expect(router).toBeInstanceOf(CostControlledRouter);
  });
});
