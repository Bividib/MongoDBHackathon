import type { DraftMessageInput, PromptMessage } from "../schemas/index.js";
import { RUNWAYOPS_SYSTEM_POLICY, wrapUntrustedContent } from "./policy.js";

export function buildDraftMessagePrompt(input: DraftMessageInput): PromptMessage[] {
  return [
    {
      role: "system",
      content: `${RUNWAYOPS_SYSTEM_POLICY}\nTask: draft an approval-ready customer communication. The draft must be editable and must not claim it has been sent.`,
    },
    {
      role: "user",
      content: JSON.stringify({
        action_type: input.action_type,
        customer_name: input.customer_name,
        company_name: input.company_name ?? null,
        channel: input.channel,
        tone: input.tone,
        today: input.today,
        company_policy: input.company_policy ?? null,
        invoice_context: input.invoice_context,
        evidence_refs: input.evidence_refs,
        latest_untrusted_reply: input.latest_untrusted_reply
          ? wrapUntrustedContent("latest_customer_reply", input.latest_untrusted_reply)
          : null,
      }),
    },
  ];
}
