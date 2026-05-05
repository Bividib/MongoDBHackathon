import { describe, expect, it } from "vitest";

import {
  BudgetExceededError,
  CostControlledRouter,
  MockModelRouter,
  type ReplyClassificationInput,
} from "../src/index.js";

/**
 * The wrapper's contract: refuse to dispatch once cumulative output
 * tokens cross the cap, surface a typed error, expose usage so callers
 * can log + alert. The mock router does no real I/O so we drive usage
 * via a tiny stub that exposes a controllable counter.
 */

const buildInput = (): ReplyClassificationInput => ({
  today: "2026-05-05",
  customer_reply: "We will pay tomorrow.",
  evidence_refs: [
    {
      kind: "communication_message",
      id: "msg-1",
      summary: "Customer said tomorrow.",
    },
  ],
  invoice_context: [
    { invoice_id: "inv-1", invoice_number: "RO-1", customer_name: "Co" },
  ],
});

class CountingMock extends MockModelRouter {
  outputTokens = 0;
  inputTokens = 0;
  perCall = 100;

  usage() {
    return { inputTokens: this.inputTokens, outputTokens: this.outputTokens };
  }

  override async classifyReply(input: ReplyClassificationInput) {
    this.inputTokens += this.perCall;
    this.outputTokens += this.perCall;
    return super.classifyReply(input);
  }
}

describe("CostControlledRouter", () => {
  it("delegates calls to the inner router under the cap", async () => {
    const inner = new CountingMock();
    const wrapper = new CostControlledRouter({
      inner,
      maxOutputTokens: 1000,
      budgetKey: "co-1:2026-05-05",
    });

    const result = await wrapper.classifyReply(buildInput());
    expect(result.classification).toBeDefined();
    expect(wrapper.usage().outputTokens).toBe(100);
  });

  it("throws BudgetExceededError when cumulative output exceeds the cap", async () => {
    const inner = new CountingMock();
    inner.perCall = 600;
    const wrapper = new CostControlledRouter({
      inner,
      maxOutputTokens: 1000,
      budgetKey: "co-1:2026-05-05",
    });

    await wrapper.classifyReply(buildInput()); // 600 used → still under
    await expect(wrapper.classifyReply(buildInput())).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
  });

  it("BudgetExceededError carries the budget key + usage snapshot", async () => {
    const inner = new CountingMock();
    inner.outputTokens = 5000; // pre-exhausted
    const wrapper = new CostControlledRouter({
      inner,
      maxOutputTokens: 1000,
      budgetKey: "co-7:2026-05-05",
    });

    await expect(wrapper.classifyReply(buildInput())).rejects.toMatchObject({
      name: "BudgetExceededError",
      budgetKey: "co-7:2026-05-05",
      usage: { outputTokens: 5000 },
    });
  });

  it("checks the input cap when configured", async () => {
    const inner = new CountingMock();
    inner.inputTokens = 9000;
    const wrapper = new CostControlledRouter({
      inner,
      maxOutputTokens: 99_999,
      maxInputTokens: 5000,
      budgetKey: "co-1:2026-05-05",
    });

    await expect(wrapper.classifyReply(buildInput())).rejects.toMatchObject({
      name: "BudgetExceededError",
      usage: { inputTokens: 9000 },
    });
  });

  it("usage() returns zero when the inner router has no usage tracker", async () => {
    // A vanilla MockModelRouter does not expose usage().
    const inner = new MockModelRouter();
    const wrapper = new CostControlledRouter({
      inner,
      maxOutputTokens: 1000,
      budgetKey: "co-1:2026-05-05",
    });
    expect(wrapper.usage()).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
