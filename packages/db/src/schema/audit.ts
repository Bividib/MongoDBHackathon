import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { evidenceRefs, id, jsonObject } from "./common.js";
import { companies } from "./identity.js";

/**
 * Audit log: append-only WHO-DID-WHAT-WHEN-WHY-WITH-WHAT-EVIDENCE record.
 *
 * Mirrors @runwayops/domain auditEventSchema field-for-field. Distinct from
 * outbox_events (transactional outbox for domain events about aggregates).
 * The two surfaces solve different problems and are NOT conflated.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetKind: text("target_kind").notNull(),
    targetId: uuid("target_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    summary: text("summary").notNull(),
    beforeJson: jsonObject("before_json"),
    afterJson: jsonObject("after_json"),
    evidenceRefs: evidenceRefs(),
    correlationId: uuid("correlation_id"),
    causationEventId: uuid("causation_event_id"),
  },
  (table) => [
    check(
      "audit_events_actor_type_check",
      sql`${table.actorType} IN ('system','user','ai','integration','workflow')`,
    ),
    check(
      "audit_events_target_kind_check",
      sql`${table.targetKind} IN (
        'company','customer','invoice','payment','bank_transaction','obligation',
        'promise_to_pay','forecast','collection_action','approval','message_draft',
        'integration','domain_event'
      )`,
    ),
    index("audit_events_company_occurred_at_idx").on(table.companyId, table.occurredAt),
    index("audit_events_company_target_idx").on(
      table.companyId,
      table.targetKind,
      table.targetId,
    ),
    index("audit_events_company_target_occurred_at_idx").on(
      table.companyId,
      table.targetKind,
      table.targetId,
      table.occurredAt,
    ),
    index("audit_events_company_action_idx").on(table.companyId, table.action),
  ],
);
