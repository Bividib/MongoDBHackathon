import { z } from "zod";

import {
  confidenceScoreSchema,
  dateSchema,
  idSchema,
  jsonRecordSchema,
  nonNegativeMoneySchema,
  nonNegativeScoreSchema,
  nullableDateSchema,
  requiredEvidenceRefsSchema,
} from "./common.js";

/**
 * A collection action's INTENT — what we are trying to accomplish, orthogonal
 * to the delivery channel. Pairs with `collectionActionChannelSchema` (how
 * we communicate). Internal "no_action" means the deterministic engine
 * decided not to act, e.g. because all options are blocked by policy.
 */
export const collectionActionKindSchema = z.enum([
  "request_payment",
  "request_partial_payment",
  "confirm_promise",
  "resolve_dispute",
  "manual_review_paid_claim",
  "founder_escalation",
  "propose_payment_plan",
  "request_supplier_timing",
  "no_action",
]);

/**
 * Delivery CHANNEL — how the action reaches the customer (or stays internal).
 * Mirrors messageDraftChannelSchema where overlapping; adds letter/portal/
 * in_app/internal for non-message-draft surfaces.
 */
export const collectionActionChannelSchema = z.enum([
  "email",
  "sms",
  "phone_task",
  "letter",
  "portal",
  "in_app",
  "internal",
]);

export const collectionActionToneSchema = z.enum([
  "friendly",
  "neutral",
  "firm",
  "urgent",
  "formal",
  "apologetic",
  "supportive",
]);

export const collectionActionStatusSchema = z.enum([
  "proposed",
  "awaiting_approval",
  "approved",
  "rejected",
  "executing",
  "completed",
  "cancelled",
  "failed",
  "expired",
]);

/**
 * Opaque snapshot of cash-engine ranking inputs at the moment a candidate
 * was selected for persistence. Stored alongside the persisted action so
 * the audit drawer can show *why* the engine ranked it without coupling
 * the persisted shape to ranking internals. Kept as a string-keyed record
 * intentionally — consumers should treat this as read-only history.
 */
export const rankingSnapshotSchema = z
  .object({
    kind: z.string().trim().min(1),
    priorityScore: nonNegativeScoreSchema,
    expectedCashImpactMinor: z.string().trim().min(1),
    probabilityOfPayment: confidenceScoreSchema,
    obligationUrgency: z.number(),
    actionEffectiveness: z.number(),
    evidenceConfidence: confidenceScoreSchema,
    relationshipRiskPenalty: nonNegativeScoreSchema,
    actionEffortPenalty: nonNegativeScoreSchema,
    explanation: z.string().trim().min(1),
    recordedAt: z.string().trim().min(1),
  })
  .strict();

/**
 * Persisted collection action. Mutated in-place across the lifecycle via
 * the status field (proposed → awaiting_approval → approved/rejected →
 * executing → completed/failed). Distinct from:
 *   - cash-engine's `RankedCollectionActionCandidate` (ephemeral ranking
 *     output, no id, recomputed each tick)
 *   - `CollectionActionExecutionResult` (per-attempt dispatch outcome)
 */
export const collectionActionSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    customerId: idSchema.optional(),
    invoiceId: idSchema.optional(),
    promiseToPayId: idSchema.optional(),

    actionKind: collectionActionKindSchema,
    channel: collectionActionChannelSchema,
    tone: collectionActionToneSchema.optional(),

    status: collectionActionStatusSchema,

    priorityScore: nonNegativeScoreSchema,
    expectedCashImpact: nonNegativeMoneySchema.optional(),
    probabilityOfPayment: confidenceScoreSchema.optional(),
    evidenceConfidence: confidenceScoreSchema,
    relationshipRiskPenalty: nonNegativeScoreSchema.default(0),
    actionEffortPenalty: nonNegativeScoreSchema.default(0),

    requiresApproval: z.boolean(),
    approvalId: idSchema.optional(),

    recommendedAt: dateSchema,
    dueAt: nullableDateSchema,
    approvedAt: nullableDateSchema,
    rejectedAt: nullableDateSchema,
    executedAt: nullableDateSchema,
    completedAt: nullableDateSchema,

    reason: z.string().trim().min(1),
    draftMessageId: idSchema.optional(),
    assignedToUserId: idSchema.optional(),
    evidenceRefs: requiredEvidenceRefsSchema,

    rankingSnapshot: rankingSnapshotSchema.optional(),
    metadata: jsonRecordSchema.optional(),

    createdAt: dateSchema,
    updatedAt: dateSchema,
  })
  .strict()
  .refine(
    (action) =>
      action.actionKind === "no_action" ||
      Boolean(action.customerId) ||
      Boolean(action.invoiceId),
    {
      message: "Collection actions need a customer or invoice target unless they are no_action",
      path: ["customerId"],
    },
  )
  .refine(
    (action) =>
      action.actionKind === "no_action" || action.channel !== "internal",
    {
      message: "Only no_action collection actions may use the internal channel",
      path: ["channel"],
    },
  );

/**
 * Outcome of a single dispatch attempt. Append-only; multiple results may
 * exist for one action under retry/resend.
 */
export const collectionActionExecutionOutcomeSchema = z.enum([
  "delivered",
  "bounced",
  "opened",
  "replied",
  "failed",
  "errored",
  "no_op",
]);

export const collectionActionExecutionResultSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    actionId: idSchema,
    attemptNumber: z.number().int().min(1),
    dispatchedAt: dateSchema,
    deliveredAt: nullableDateSchema,
    outcome: collectionActionExecutionOutcomeSchema,
    externalMessageId: z.string().trim().min(1).optional(),
    idempotencyKey: z.string().trim().min(1),
    errorMessage: z.string().trim().min(1).optional(),
    metadata: jsonRecordSchema.optional(),
    createdAt: dateSchema,
  })
  .strict();

export type CollectionActionKind = z.infer<typeof collectionActionKindSchema>;
export type CollectionActionChannel = z.infer<typeof collectionActionChannelSchema>;
export type CollectionActionTone = z.infer<typeof collectionActionToneSchema>;
export type CollectionActionStatus = z.infer<typeof collectionActionStatusSchema>;
export type RankingSnapshot = z.infer<typeof rankingSnapshotSchema>;
export type CollectionAction = z.infer<typeof collectionActionSchema>;
export type CollectionActionExecutionOutcome = z.infer<
  typeof collectionActionExecutionOutcomeSchema
>;
export type CollectionActionExecutionResult = z.infer<
  typeof collectionActionExecutionResultSchema
>;
