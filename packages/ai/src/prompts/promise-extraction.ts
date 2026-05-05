import type { PromiseExtractionInput, PromptMessage } from "../schemas/index.js";
import { RUNWAYOPS_SYSTEM_POLICY, wrapUntrustedContent } from "./policy.js";

export function buildPromiseExtractionPrompt(input: PromiseExtractionInput): PromptMessage[] {
  return [
    {
      role: "system",
      content: `${RUNWAYOPS_SYSTEM_POLICY}\nTask: extract only explicit promise-to-pay facts from the untrusted reply.`,
    },
    {
      role: "user",
      content: JSON.stringify({
        today: input.today,
        reply_classification: input.reply_classification ?? null,
        invoice_context: input.invoice_context,
        evidence_refs: input.evidence_refs,
        customer_reply: wrapUntrustedContent("customer_reply", input.customer_reply),
      }),
    },
  ];
}
