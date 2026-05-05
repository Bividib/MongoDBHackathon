import { z } from "zod";

import {
  dateSchema,
  idSchema,
  jsonRecordSchema,
  requiredEvidenceRefsSchema
} from "./common.js";

export const approvalSubjectKindSchema = z.enum([
  "collection_action",
  "message_draft",
  "payment_plan",
  "supplier_timing",
  "accounting_writeback",
  "external_message"
]);

export const approvalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "edited",
  "cancelled",
  "expired"
]);

export const approvalDecisionKindSchema = z.enum(["approved", "rejected", "edited"]);

export const approvalDecisionSchema = z
  .object({
    decision: approvalDecisionKindSchema,
    decidedByUserId: idSchema,
    decidedAt: dateSchema,
    note: z.string().trim().min(1).optional(),
    editedPayload: jsonRecordSchema.optional()
  })
  .strict()
  .refine((decision) => decision.decision !== "edited" || Boolean(decision.editedPayload), {
    message: "Edited approvals require an edited payload",
    path: ["editedPayload"]
  });

export const approvalRequestSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    subjectKind: approvalSubjectKindSchema,
    subjectId: idSchema,
    status: approvalStatusSchema,
    requestedByUserId: idSchema.optional(),
    assignedApproverId: idSchema.optional(),
    requestedAt: dateSchema,
    expiresAt: dateSchema.optional(),
    decision: approvalDecisionSchema.optional(),
    riskSummary: z.string().trim().min(1).optional(),
    evidenceRefs: requiredEvidenceRefsSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema
  })
  .strict()
  .refine((request) => request.status === "pending" || Boolean(request.decision), {
    message: "Non-pending approvals require a decision",
    path: ["decision"]
  });

export const approvalSchema = approvalRequestSchema;

export type ApprovalSubjectKind = z.infer<typeof approvalSubjectKindSchema>;
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;
export type ApprovalDecisionKind = z.infer<typeof approvalDecisionKindSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type Approval = ApprovalRequest;
