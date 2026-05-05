/**
 * Real Claude-backed `ModelRouter`. Calls the Anthropic Messages API
 * directly via `fetch` — no SDK dependency, so the package stays small
 * and the testing surface is just an injectable `fetch` implementation.
 *
 * The adapter is intentionally thin: it builds the prompt with existing
 * prompt templates, asks the model for JSON-only output, and parses it
 * through the same Zod schema the mock uses. The same evidence-ref
 * validators run against the parsed output, so safety guarantees do not
 * depend on whether the router is mock or real.
 *
 * Construction is gated by `createModelRouter()` (factory). Production
 * code should not instantiate this class directly — go through the
 * factory so the env kill switch + budget guard layer apply.
 */
import { z } from "zod";

import {
  buildDraftMessagePrompt,
  buildPromiseExtractionPrompt,
  buildReplyClassificationPrompt,
} from "./prompts/index.js";
import type { ModelRouter } from "./model-router.js";
import {
  ActionRecommendationInputSchema,
  ActionRecommendationSchema,
  AuditExplanationSchema,
  AuditInputSchema,
  DraftMessageInputSchema,
  EvidenceSummaryInputSchema,
  EvidenceSummarySchema,
  MessageDraftSchema,
  PromiseExtractionInputSchema,
  PromiseExtractionSchema,
  ReplyClassificationInputSchema,
  ReplyClassificationSchema,
  type ActionRecommendation,
  type ActionRecommendationInput,
  type AuditExplanation,
  type AuditInput,
  type DraftMessageInput,
  type EvidenceSummary,
  type EvidenceSummaryInput,
  type MessageDraft,
  type PromiseExtraction,
  type PromiseExtractionInput,
  type PromptMessage,
  type ReplyClassification,
  type ReplyClassificationInput,
} from "./schemas/index.js";
import { containsForbiddenOutboundAction, validateEvidenceRefs } from "./validators/index.js";

const ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-5";
const MAX_OUTPUT_TOKENS = 1024;

const JSON_OUTPUT_INSTRUCTION =
  "Respond with ONLY a single JSON object matching the response schema. No prose, no code fences, no commentary.";

export interface AnthropicAdapterOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
}

interface MessagesResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export class AnthropicModelRouter implements ModelRouter {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private totalUsage: UsageRecord = { inputTokens: 0, outputTokens: 0 };

  constructor(opts: AnthropicAdapterOptions) {
    if (!opts.apiKey || opts.apiKey.trim().length === 0) {
      throw new Error("AnthropicModelRouter: apiKey is required");
    }
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.baseUrl = opts.baseUrl ?? ANTHROPIC_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * Cumulative input/output token counts across every call this instance
   * has issued. The factory's CostControlledRouter wrapper reads this to
   * enforce per-budget caps; callers can also use it for telemetry.
   */
  usage(): UsageRecord {
    return { ...this.totalUsage };
  }

  async classifyReply(rawInput: ReplyClassificationInput): Promise<ReplyClassification> {
    const input = ReplyClassificationInputSchema.parse(rawInput);
    const messages = buildReplyClassificationPrompt(input);
    const output = await this.callStructured(messages, ReplyClassificationSchema);
    validateEvidenceRefs(output.evidence_refs, input.evidence_refs);
    return output;
  }

  async extractPromise(rawInput: PromiseExtractionInput): Promise<PromiseExtraction> {
    const input = PromiseExtractionInputSchema.parse(rawInput);
    const messages = buildPromiseExtractionPrompt(input);
    const output = await this.callStructured(messages, PromiseExtractionSchema);
    validateEvidenceRefs(output.evidence_refs, input.evidence_refs);
    return output;
  }

  async summarizeEvidence(rawInput: EvidenceSummaryInput): Promise<EvidenceSummary> {
    const input = EvidenceSummaryInputSchema.parse(rawInput);
    // No prompt builder yet for evidence summaries — inline a minimal
    // system + user pair using the same untrusted-content discipline.
    const messages: PromptMessage[] = [
      {
        role: "system",
        content: "Summarize the supplied evidence refs. Cite each evidence_ref id you use. Do not invent new ids.",
      },
      { role: "user", content: JSON.stringify({ evidence_refs: input.evidence_refs }) },
    ];
    const output = await this.callStructured(messages, EvidenceSummarySchema);
    validateEvidenceRefs(output.evidence_refs, input.evidence_refs);
    return output;
  }

  async draftMessage(rawInput: DraftMessageInput): Promise<MessageDraft> {
    const input = DraftMessageInputSchema.parse(rawInput);
    const messages = buildDraftMessagePrompt(input);
    const output = await this.callStructured(messages, MessageDraftSchema);

    if (containsForbiddenOutboundAction(output.body)) {
      throw new Error("Draft contains a forbidden outbound action.");
    }
    validateEvidenceRefs(output.evidence_refs, input.evidence_refs);
    return output;
  }

  async generateAuditExplanation(rawInput: AuditInput): Promise<AuditExplanation> {
    const input = AuditInputSchema.parse(rawInput);
    const messages: PromptMessage[] = [
      {
        role: "system",
        content:
          "Generate a concise audit explanation for the given decision. Do not give legal, tax, or insolvency advice.",
      },
      {
        role: "user",
        content: JSON.stringify({
          event_name: input.event_name,
          decision: input.decision,
          policy_checks: input.policy_checks,
          evidence_refs: input.evidence_refs,
        }),
      },
    ];
    const output = await this.callStructured(messages, AuditExplanationSchema);
    validateEvidenceRefs(output.evidence_refs, input.evidence_refs);
    return output;
  }

  async recommendAction(rawInput: ActionRecommendationInput): Promise<ActionRecommendation> {
    const input = ActionRecommendationInputSchema.parse(rawInput);
    const messages: PromptMessage[] = [
      {
        role: "system",
        content:
          "Recommend the next collections action. Never propose initiating a payment, sending without approval, or claiming an obligation is safe. Cite evidence refs.",
      },
      {
        role: "user",
        content: JSON.stringify({
          today: input.today,
          invoice_context: input.invoice_context,
          evidence_refs: input.evidence_refs,
        }),
      },
    ];
    const output = await this.callStructured(messages, ActionRecommendationSchema);
    validateEvidenceRefs(output.evidence_refs, input.evidence_refs);
    return output;
  }

  /**
   * Call Anthropic, parse the response as JSON, and validate it through
   * `schema`. The system prompt is augmented with a JSON-only directive
   * because Claude does not have a native JSON mode the way OpenAI does.
   * Parse failures throw; the caller decides retry policy.
   *
   * Generic uses `ZodTypeAny` + `z.output<S>` so callers retain the
   * schema's full output inference (including `.default([])` produced
   * non-optional fields) — `z.ZodType<T>` collapses too much.
   */
  private async callStructured<S extends z.ZodTypeAny>(
    messages: PromptMessage[],
    schema: S,
  ): Promise<z.output<S>> {
    const systemPrompt = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .concat([JSON_OUTPUT_INSTRUCTION])
      .join("\n\n");

    const userMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const body = {
      model: this.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: userMessages,
    };

    const response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Anthropic API error ${response.status}: ${text.slice(0, 500)}`);
    }

    const json = (await response.json()) as MessagesResponse;
    if (json.usage) {
      this.totalUsage = {
        inputTokens: this.totalUsage.inputTokens + (json.usage.input_tokens ?? 0),
        outputTokens: this.totalUsage.outputTokens + (json.usage.output_tokens ?? 0),
      };
    }

    const text = extractTextContent(json);
    const parsed = parseJsonStrict(text);
    return schema.parse(parsed);
  }
}

function extractTextContent(json: MessagesResponse): string {
  if (!Array.isArray(json.content) || json.content.length === 0) {
    throw new Error("Anthropic response contained no content blocks.");
  }
  const textBlock = json.content.find((c) => c.type === "text" && typeof c.text === "string");
  if (!textBlock?.text) {
    throw new Error("Anthropic response contained no text content.");
  }
  return textBlock.text;
}

/**
 * Strip optional code fences and parse. Claude sometimes returns JSON
 * wrapped in ```json fences despite the JSON-only directive.
 */
function parseJsonStrict(raw: string): unknown {
  const trimmed = raw.trim();
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    throw new Error(
      `Anthropic response was not valid JSON (${reason}): ${stripped.slice(0, 200)}`,
    );
  }
}
