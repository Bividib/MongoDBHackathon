import type { PromptMessage, ReplyClassificationInput } from "../schemas/index.js";
import { RUNWAYOPS_SYSTEM_POLICY, wrapUntrustedContent } from "./policy.js";

export function buildReplyClassificationPrompt(input: ReplyClassificationInput): PromptMessage[] {
  return [
    {
      role: "system",
      content: `${RUNWAYOPS_SYSTEM_POLICY}\nTask: classify a customer reply and identify whether it contains a promise-to-pay signal.`,
    },
    {
      role: "user",
      content: JSON.stringify({
        today: input.today,
        company_policy: input.company_policy ?? null,
        invoice_context: input.invoice_context,
        evidence_refs: input.evidence_refs,
        customer_reply: wrapUntrustedContent("customer_reply", input.customer_reply),
      }),
    },
  ];
}
