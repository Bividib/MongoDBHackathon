import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { communicationThreads } from "./communications.js";
import {
  createdAt,
  deletedAt,
  evidenceRefs,
  id,
  jsonObject,
  nullableMoneyMinor,
  priorityScore,
  updatedAt,
} from "./common.js";
import { customers } from "./customers.js";
import { companies, users } from "./identity.js";
import { invoices } from "./invoices.js";
import { promiseToPayRecords } from "./promises.js";

/**
 * Persisted collection action. Mirrors @runwayops/domain CollectionAction
 * field-for-field. The action lifecycle is captured in the `status` field
 * and per-stage timestamps; orthogonal `actionKind` (intent), `channel`
 * (delivery), and `tone` (register) replace the pre-Round-2.5 single
 * `action_type` field that conflated channel and intent.
 */
export const collectionActions = pgTable(
  "collection_actions",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    promiseId: uuid("promise_id").references(() => promiseToPayRecords.id, {
      onDelete: "set null",
    }),
    actionKind: text("action_kind").notNull(),
    channel: text("channel").notNull(),
    tone: text("tone"),
    status: text("status").notNull(),
    priorityScore: priorityScore("priority_score"),
    expectedCashImpactMinor: nullableMoneyMinor("expected_cash_impact_minor"),
    currency: char("currency", { length: 3 }),
    probabilityOfPayment: numeric("probability_of_payment", { precision: 5, scale: 4 }),
    evidenceConfidence: numeric("evidence_confidence", { precision: 5, scale: 4 }).notNull(),
    relationshipRiskPenalty: numeric("relationship_risk_penalty", { precision: 12, scale: 4 })
      .notNull()
      .default("0"),
    actionEffortPenalty: numeric("action_effort_penalty", { precision: 12, scale: 4 })
      .notNull()
      .default("0"),
    requiresApproval: boolean("requires_approval").notNull().default(true),
    approvalId: uuid("approval_id"),
    reason: text("reason").notNull(),
    draftMessageId: uuid("draft_message_id"),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    evidenceRefs: evidenceRefs(),
    rankingSnapshot: jsonObject("ranking_snapshot"),
    metadata: jsonObject("metadata"),
    recommendedAt: timestamp("recommended_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    dueDate: date("due_date", { mode: "string" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("collection_actions_company_status_priority_idx").on(
      table.companyId,
      table.status,
      table.priorityScore,
    ),
    index("collection_actions_company_status_due_at_idx").on(
      table.companyId,
      table.status,
      table.dueAt,
    ),
    index("collection_actions_company_customer_idx").on(table.companyId, table.customerId),
    check(
      "collection_actions_action_kind_check",
      sql`${table.actionKind} IN ('request_payment','request_partial_payment','confirm_promise','resolve_dispute','manual_review_paid_claim','founder_escalation','propose_payment_plan','request_supplier_timing','no_action')`,
    ),
    check(
      "collection_actions_channel_check",
      sql`${table.channel} IN ('email','sms','phone_task','letter','portal','in_app','internal')`,
    ),
    check(
      "collection_actions_status_check",
      sql`${table.status} IN ('proposed','awaiting_approval','approved','rejected','executing','completed','cancelled','failed','expired')`,
    ),
    check(
      "collection_actions_internal_only_for_no_action",
      sql`${table.channel} <> 'internal' OR ${table.actionKind} = 'no_action'`,
    ),
    check(
      "collection_actions_evidence_confidence_range",
      sql`${table.evidenceConfidence} >= 0 AND ${table.evidenceConfidence} <= 1`,
    ),
    check(
      "collection_actions_probability_range",
      sql`${table.probabilityOfPayment} IS NULL OR (${table.probabilityOfPayment} >= 0 AND ${table.probabilityOfPayment} <= 1)`,
    ),
    check(
      "collection_actions_expected_cash_nonnegative",
      sql`${table.expectedCashImpactMinor} IS NULL OR ${table.expectedCashImpactMinor} >= 0`,
    ),
  ],
);

/**
 * Append-only per-attempt dispatch outcome. Multiple results may exist for a
 * single action under retry/resend. The (action_id, idempotency_key) unique
 * constraint prevents double-dispatch on retry.
 */
export const collectionActionResults = pgTable(
  "collection_action_results",
  {
    id: id(),
    createdAt: createdAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    actionId: uuid("action_id")
      .notNull()
      .references(() => collectionActions.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }).notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    outcome: text("outcome").notNull(),
    externalMessageId: text("external_message_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    errorMessage: text("error_message"),
    metadata: jsonObject("metadata"),
  },
  (table) => [
    index("collection_action_results_company_action_idx").on(
      table.companyId,
      table.actionId,
      table.attemptNumber,
    ),
    uniqueIndex("collection_action_results_action_idem_unique").on(
      table.actionId,
      table.idempotencyKey,
    ),
    check("collection_action_results_attempt_positive", sql`${table.attemptNumber} >= 1`),
    check(
      "collection_action_results_outcome_check",
      sql`${table.outcome} IN ('delivered','bounced','opened','replied','failed','errored','no_op')`,
    ),
  ],
);

export const messageDrafts = pgTable(
  "message_drafts",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    actionId: uuid("action_id")
      .notNull()
      .references(() => collectionActions.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => communicationThreads.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    editedByUserId: uuid("edited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("draft"),
    channel: text("channel").notNull(),
    subject: text("subject"),
    bodyText: text("body_text").notNull(),
    version: integer("version").notNull().default(1),
    modelTraceId: text("model_trace_id"),
    evidenceRefs: evidenceRefs(),
  },
  (table) => [
    index("message_drafts_company_action_idx").on(table.companyId, table.actionId),
    check("message_drafts_version_positive", sql`${table.version} > 0`),
  ],
);
