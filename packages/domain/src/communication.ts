import { z } from "zod";

import {
  dateSchema,
  evidenceRefsSchema,
  idSchema,
  jsonRecordSchema,
  nullableDateSchema,
} from "./common.js";

export const communicationChannelSchema = z.enum([
  "email",
  "sms",
  "phone",
  "in_person",
  "letter",
  "portal",
  "other",
]);

export const communicationDirectionSchema = z.enum(["inbound", "outbound"]);

export const communicationSenderTypeSchema = z.enum([
  "customer",
  "user",
  "system",
  "ai",
  "integration",
]);

export const communicationAttachmentSchema = z
  .object({
    id: idSchema,
    fileName: z.string().trim().min(1),
    contentType: z.string().trim().min(1),
    sizeBytes: z.number().int().min(0),
    storageUri: z.string().trim().min(1),
    sha256: z.string().trim().length(64).optional(),
  })
  .strict();

export const communicationThreadSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    customerId: idSchema,
    channel: communicationChannelSchema,
    subject: z.string().trim().min(1).optional(),
    externalThreadId: z.string().trim().min(1).optional(),
    isOpen: z.boolean(),
    messageCount: z.number().int().min(0),
    firstMessageAt: dateSchema,
    lastMessageAt: dateSchema,
    createdAt: dateSchema,
    updatedAt: dateSchema,
    metadata: jsonRecordSchema.optional(),
  })
  .strict();

export const communicationMessageSchema = z
  .object({
    id: idSchema,
    companyId: idSchema,
    threadId: idSchema,
    customerId: idSchema,
    direction: communicationDirectionSchema,
    channel: communicationChannelSchema,
    senderType: communicationSenderTypeSchema,
    senderId: idSchema.optional(),
    subject: z.string().trim().min(1).optional(),
    bodyText: z.string().min(1),
    bodyHtml: z.string().min(1).optional(),
    externalMessageId: z.string().trim().min(1).optional(),
    occurredAt: dateSchema,
    receivedAt: nullableDateSchema,
    sentAt: nullableDateSchema,
    attachments: z.array(communicationAttachmentSchema).default([]),
    evidenceRefs: evidenceRefsSchema.default([]),
    safetyFlags: z.array(z.string().trim().min(1)).default([]),
    relatedDraftId: idSchema.optional(),
    metadata: jsonRecordSchema.optional(),
  })
  .strict()
  .refine(
    (msg) =>
      msg.direction === "inbound"
        ? msg.receivedAt !== undefined && msg.receivedAt !== null
        : msg.sentAt !== undefined && msg.sentAt !== null,
    "Inbound messages require receivedAt; outbound messages require sentAt",
  );

export type CommunicationChannel = z.infer<typeof communicationChannelSchema>;
export type CommunicationDirection = z.infer<typeof communicationDirectionSchema>;
export type CommunicationSenderType = z.infer<typeof communicationSenderTypeSchema>;
export type CommunicationAttachment = z.infer<typeof communicationAttachmentSchema>;
export type CommunicationThread = z.infer<typeof communicationThreadSchema>;
export type CommunicationMessage = z.infer<typeof communicationMessageSchema>;
