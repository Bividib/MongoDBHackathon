import { z } from "zod";

import {
  dateSchema,
  evidenceRefsSchema,
  idSchema,
  jsonRecordSchema,
  nullableDateSchema,
} from "./common.js";

export const messageDraftChannelSchema = z.enum([
  "email",
  "sms",
  "phone_task",
  "internal_note",
]);

export const messageDraftToneSchema = z.enum([
  "friendly",
  "firm",
  "urgent",
  "formal",
  "apologetic",
  "escalation",
  "supportive",
]);

export const messageDraftStatusSchema = z.enum([
  "draft",
  "awaiting_approval",
  "approved",
  "rejected",
  "sent",
  "failed",
]);

export const messageDraftGeneratedBySchema = z.enum(["ai", "user", "template"]);

export const messageDraftDeliveryResultSchema = z
  .object({
    deliveredAt: dateSchema.optional(),
    providerMessageId: z.string().trim().min(1).optional(),
    providerStatus: z.string().trim().min(1).optional(),
    error: z.string().trim().min(1).optional(),
  })
  .strict();

export const messageDraftSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    customerId: idSchema.optional(),
    channel: messageDraftChannelSchema,
    subject: z.string().trim().min(1).optional(),
    bodyText: z.string().trim().min(1),
    bodyHtml: z.string().min(1).optional(),
    tone: messageDraftToneSchema,
    relatedActionId: idSchema.optional(),
    relatedApprovalId: idSchema.optional(),
    generatedBy: messageDraftGeneratedBySchema,
    evidenceRefs: evidenceRefsSchema.default([]),
    status: messageDraftStatusSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema,
    approvedById: idSchema.optional(),
    approvedAt: nullableDateSchema,
    sentAt: nullableDateSchema,
    deliveryResult: messageDraftDeliveryResultSchema.optional(),
    metadata: jsonRecordSchema.optional(),
  })
  .strict()
  .refine(
    (draft) => draft.channel !== "email" || draft.subject !== undefined,
    "Email drafts must have a subject",
  );

export type MessageDraftChannel = z.infer<typeof messageDraftChannelSchema>;
export type MessageDraftTone = z.infer<typeof messageDraftToneSchema>;
export type MessageDraftStatus = z.infer<typeof messageDraftStatusSchema>;
export type MessageDraftGeneratedBy = z.infer<typeof messageDraftGeneratedBySchema>;
export type MessageDraftDeliveryResult = z.infer<typeof messageDraftDeliveryResultSchema>;
export type MessageDraft = z.infer<typeof messageDraftSchema>;
