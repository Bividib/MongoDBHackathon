import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { collectionActions } from "./actions.js";
import {
  createdAt,
  deletedAt,
  evidenceRefs,
  id,
  jsonObject,
  nullableJsonObject,
  updatedAt,
} from "./common.js";
import { companies, users } from "./identity.js";

/**
 * Approval requests: human-in-the-loop gate before any external action.
 * Polymorphic over `subjectKind` / `subjectId`. Mirrors @runwayops/domain
 * approvalRequestSchema.
 */
export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    subjectKind: text("subject_kind").notNull(),
    subjectId: uuid("subject_id").notNull(),
    actionId: uuid("action_id").references(() => collectionActions.id, {
      onDelete: "set null",
    }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull(),
    riskLevel: text("risk_level").notNull().default("medium"),
    riskSummary: text("risk_summary"),
    contentSnapshot: jsonObject("content_snapshot"),
    policyChecks: jsonObject("policy_checks"),
    evidenceRefs: evidenceRefs(),
    decisionKind: text("decision_kind"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    decisionEditedPayload: nullableJsonObject("decision_edited_payload"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
  },
  (table) => [
    index("approval_requests_company_status_idx").on(table.companyId, table.status),
    index("approval_requests_company_assignee_idx").on(table.companyId, table.assignedToUserId),
    index("approval_requests_company_subject_idx").on(
      table.companyId,
      table.subjectKind,
      table.subjectId,
    ),
    check(
      "approval_requests_subject_kind_check",
      sql`${table.subjectKind} IN ('collection_action','message_draft','payment_plan','supplier_timing','accounting_writeback','external_message')`,
    ),
    check(
      "approval_requests_status_check",
      sql`${table.status} IN ('pending','approved','rejected','edited','cancelled','expired')`,
    ),
    check(
      "approval_requests_decision_kind_check",
      sql`${table.decisionKind} IS NULL OR ${table.decisionKind} IN ('approved','rejected','edited')`,
    ),
    check(
      "approval_requests_decision_required_when_terminal",
      sql`${table.status} = 'pending' OR ${table.decisionKind} IS NOT NULL`,
    ),
    check(
      "approval_requests_edited_requires_payload",
      sql`${table.decisionKind} IS DISTINCT FROM 'edited' OR ${table.decisionEditedPayload} IS NOT NULL`,
    ),
  ],
);

/**
 * Append-only decision history. Although the latest decision lives inline
 * on `approval_requests` for hot-path queries, this table preserves the
 * full sequence for tamper-evident audit (multi-step edits, reversals).
 */
export const approvalDecisions = pgTable(
  "approval_decisions",
  {
    id: id(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    approvalRequestId: uuid("approval_request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decision: text("decision").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason"),
    editedContent: nullableJsonObject("edited_content"),
  },
  (table) => [
    index("approval_decisions_company_request_idx").on(
      table.companyId,
      table.approvalRequestId,
    ),
  ],
);
