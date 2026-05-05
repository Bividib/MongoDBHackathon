/**
 * Wrap a `ModelRouter` to enforce per-budget token caps and surface
 * usage telemetry. Used at the boundary between an activity and the
 * underlying router so a runaway prompt loop can't burn unbounded
 * tokens against a real provider.
 *
 * Budget keys are arbitrary strings — typical pattern is
 * `${companyId}:${yyyy-mm-dd}` so caps reset daily per tenant. The
 * caller threads the budget key in via an explicit `withBudget(...)`
 * scope rather than implicit context, so behaviour stays deterministic
 * inside Temporal activities.
 */
import type {
  ActionRecommendation,
  ActionRecommendationInput,
  AuditExplanation,
  AuditInput,
  DraftMessageInput,
  EvidenceSummary,
  EvidenceSummaryInput,
  MessageDraft,
  PromiseExtraction,
  PromiseExtractionInput,
  ReplyClassification,
  ReplyClassificationInput,
} from "./schemas/index.js";
import type { ModelRouter } from "./model-router.js";
import type { UsageRecord } from "./anthropic-adapter.js";

export interface BudgetReader {
  usage(): UsageRecord;
}

export interface CostControlledRouterOptions {
  inner: ModelRouter & Partial<BudgetReader>;
  /**
   * Hard cap on cumulative output tokens for this wrapper instance.
   * The wrapper checks BEFORE every call and refuses to dispatch if the
   * inner router has already produced more than this. This is the
   * cheapest backstop that still bounds runaway behaviour.
   */
  maxOutputTokens: number;
  /**
   * Optional cap on input tokens. Defaults to no input-side limit
   * because input cost is dominated by retrieval, which is already
   * bounded by the activity's evidence set.
   */
  maxInputTokens?: number;
  /**
   * Identifier surfaced in errors and telemetry. Free-form, e.g.
   * `${companyId}:${yyyy-mm-dd}`.
   */
  budgetKey: string;
}

export class BudgetExceededError extends Error {
  readonly budgetKey: string;
  readonly usage: UsageRecord;

  constructor(budgetKey: string, usage: UsageRecord, message: string) {
    super(message);
    this.name = "BudgetExceededError";
    this.budgetKey = budgetKey;
    this.usage = usage;
  }
}

/**
 * The wrapper delegates each method to the inner router and re-checks
 * the budget after each call. Every method shares the same guard, so
 * we factor through a private `guard` helper that runs the call inside
 * the cap check.
 */
export class CostControlledRouter implements ModelRouter {
  private readonly inner: ModelRouter & Partial<BudgetReader>;
  private readonly maxOutputTokens: number;
  private readonly maxInputTokens: number | undefined;
  private readonly budgetKey: string;

  constructor(opts: CostControlledRouterOptions) {
    this.inner = opts.inner;
    this.maxOutputTokens = opts.maxOutputTokens;
    if (opts.maxInputTokens !== undefined) this.maxInputTokens = opts.maxInputTokens;
    this.budgetKey = opts.budgetKey;
  }

  classifyReply(input: ReplyClassificationInput): Promise<ReplyClassification> {
    return this.guard(() => this.inner.classifyReply(input));
  }
  extractPromise(input: PromiseExtractionInput): Promise<PromiseExtraction> {
    return this.guard(() => this.inner.extractPromise(input));
  }
  summarizeEvidence(input: EvidenceSummaryInput): Promise<EvidenceSummary> {
    return this.guard(() => this.inner.summarizeEvidence(input));
  }
  draftMessage(input: DraftMessageInput): Promise<MessageDraft> {
    return this.guard(() => this.inner.draftMessage(input));
  }
  generateAuditExplanation(input: AuditInput): Promise<AuditExplanation> {
    return this.guard(() => this.inner.generateAuditExplanation(input));
  }
  recommendAction(input: ActionRecommendationInput): Promise<ActionRecommendation> {
    return this.guard(() => this.inner.recommendAction(input));
  }

  /** Snapshot of the inner router's cumulative usage, if it exposes one. */
  usage(): UsageRecord {
    return this.inner.usage?.() ?? { inputTokens: 0, outputTokens: 0 };
  }

  private async guard<T>(call: () => Promise<T>): Promise<T> {
    this.checkBudget();
    const result = await call();
    this.checkBudget();
    return result;
  }

  private checkBudget(): void {
    const u = this.usage();
    if (u.outputTokens >= this.maxOutputTokens) {
      throw new BudgetExceededError(
        this.budgetKey,
        u,
        `Output token budget exhausted for ${this.budgetKey}: ${u.outputTokens} >= ${this.maxOutputTokens}`,
      );
    }
    if (this.maxInputTokens !== undefined && u.inputTokens >= this.maxInputTokens) {
      throw new BudgetExceededError(
        this.budgetKey,
        u,
        `Input token budget exhausted for ${this.budgetKey}: ${u.inputTokens} >= ${this.maxInputTokens}`,
      );
    }
  }
}
