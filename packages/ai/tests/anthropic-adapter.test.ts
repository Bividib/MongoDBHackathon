import { describe, expect, it, vi } from "vitest";

import {
  AnthropicModelRouter,
  type DraftMessageInput,
  type ReplyClassificationInput,
} from "../src/index.js";

/**
 * The adapter's contract under test: build the right Anthropic Messages
 * request body, parse the JSON content block through the real Zod
 * schemas, run the same evidence-ref + safety validators the mock runs,
 * and accumulate token usage. Real HTTP is never made — we inject a
 * fake `fetch` and assert request shape + response handling.
 *
 * Anything that depends on real model behaviour (JSON-only compliance,
 * adversarial robustness, eval scores) belongs in the eval suite, not
 * here. This file pins the wire contract only.
 */

const INPUT: ReplyClassificationInput = {
  today: "2026-05-05",
  customer_reply: "We'll pay tomorrow.",
  evidence_refs: [
    {
      kind: "communication_message",
      id: "msg-1",
      summary: "Customer said tomorrow.",
    },
  ],
  invoice_context: [
    {
      invoice_id: "inv-1",
      invoice_number: "RO-1",
      customer_name: "Northstar",
    },
  ],
};

function fakeFetchOk(jsonContent: unknown, usage = { input_tokens: 50, output_tokens: 30 }) {
  return vi.fn(async (..._args: Parameters<typeof fetch>) => {
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text: JSON.stringify(jsonContent) }],
        usage,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

function validReplyClassificationOutput() {
  return {
    classification: "firm_promise",
    confidence: 0.78,
    evidence_refs: [
      {
        kind: "communication_message",
        id: "msg-1",
        summary: "Customer said tomorrow.",
      },
    ],
    recommended_action: "record_promise",
    requires_approval: true,
    risk_reason: "Promise should be validated before forecast use.",
    uncertainty_reason: "Date inferred from 'tomorrow'.",
    safety_flags: [],
    promised_date: "2026-05-06",
    amount_minor: null,
    currency: null,
    condition_text: null,
    dispute_reason: null,
  };
}

describe("AnthropicModelRouter", () => {
  it("requires an apiKey", () => {
    expect(() => new AnthropicModelRouter({ apiKey: "" })).toThrow(/apiKey is required/);
  });

  it("posts to /v1/messages with the right headers + body shape", async () => {
    const fetchImpl = fakeFetchOk(validReplyClassificationOutput());
    const router = new AnthropicModelRouter({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await router.classifyReply(INPUT);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["content-type"]).toBe("application/json");

    const body = JSON.parse(init.body as string) as {
      model: string;
      system: string;
      messages: Array<{ role: string }>;
    };
    expect(body.model).toContain("claude");
    // System prompt must include the JSON-only directive — that's how
    // we coerce structured output without a native JSON mode.
    expect(body.system).toMatch(/Respond with ONLY a single JSON object/);
    // System messages from the prompt builder must NOT leak into
    // body.messages — Anthropic expects them in the `system` field.
    for (const m of body.messages) expect(m.role).not.toBe("system");
  });

  it("parses + validates the JSON content block through the schema", async () => {
    const fetchImpl = fakeFetchOk(validReplyClassificationOutput());
    const router = new AnthropicModelRouter({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await router.classifyReply(INPUT);
    expect(result.classification).toBe("firm_promise");
    expect(result.evidence_refs[0]?.id).toBe("msg-1");
  });

  it("strips ```json fences from the model response before parsing", async () => {
    const fenced = "```json\n" + JSON.stringify(validReplyClassificationOutput()) + "\n```";
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: fenced }],
          usage: { input_tokens: 50, output_tokens: 30 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const router = new AnthropicModelRouter({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await router.classifyReply(INPUT);
    expect(result.classification).toBe("firm_promise");
  });

  it("throws on non-200 responses with the body excerpt", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("rate limit exceeded", { status: 429 }),
    );
    const router = new AnthropicModelRouter({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(router.classifyReply(INPUT)).rejects.toThrow(/Anthropic API error 429/);
  });

  it("throws on non-JSON model output rather than silently returning garbage", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "I am not JSON, sorry." }],
          usage: { input_tokens: 5, output_tokens: 5 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const router = new AnthropicModelRouter({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(router.classifyReply(INPUT)).rejects.toThrow(/not valid JSON/);
  });

  it("rejects model-output evidence_refs that reference unknown ids", async () => {
    const hallucinated = {
      ...validReplyClassificationOutput(),
      evidence_refs: [
        { kind: "communication_message", id: "msg-DOES-NOT-EXIST", summary: "fake" },
      ],
    };
    const fetchImpl = fakeFetchOk(hallucinated);
    const router = new AnthropicModelRouter({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(router.classifyReply(INPUT)).rejects.toThrow(/unknown evidence ids/);
  });

  it("rejects drafts that contain forbidden outbound action language", async () => {
    const draftInput: DraftMessageInput = {
      action_type: "first_chase",
      customer_name: "Northstar",
      channel: "email",
      tone: "neutral",
      today: "2026-05-05",
      invoice_context: [
        { invoice_id: "inv-1", invoice_number: "RO-1" },
      ],
      evidence_refs: [
        { kind: "invoice", id: "inv-1", summary: "Overdue invoice" },
      ],
    };
    const unsafe = {
      classification: "customer_chaser_draft",
      channel: "email",
      tone: "neutral",
      subject: "Follow-up",
      body: "We will be taking legal action if not paid.",
      call_to_action: "Pay now.",
      approval_notes: null,
      confidence: 0.6,
      evidence_refs: [{ kind: "invoice", id: "inv-1", summary: "Overdue invoice" }],
      recommended_action: "draft_follow_up",
      requires_approval: true,
      risk_reason: "External communication.",
      uncertainty_reason: "Mocked.",
      safety_flags: [],
    };
    const fetchImpl = fakeFetchOk(unsafe);
    const router = new AnthropicModelRouter({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(router.draftMessage(draftInput)).rejects.toThrow(
      /forbidden outbound action/,
    );
  });

  it("accumulates usage across calls", async () => {
    const fetchImpl = fakeFetchOk(validReplyClassificationOutput(), {
      input_tokens: 100,
      output_tokens: 50,
    });
    const router = new AnthropicModelRouter({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await router.classifyReply(INPUT);
    await router.classifyReply(INPUT);
    expect(router.usage()).toEqual({ inputTokens: 200, outputTokens: 100 });
  });
});
