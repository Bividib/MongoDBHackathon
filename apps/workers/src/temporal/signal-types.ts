// Signal payload types.
//
// Defined separately from signals.ts so workflow code, activities, and tests
// can import the types without importing the signal definitions (which carry
// a workflow-runtime dependency).

import type { ApprovalDecisionKind, ApprovalSubjectKind, PromiseType } from "@runwayops/domain";

export interface ApprovalDecisionPayload {
  approvalRequestId: string;
  subjectKind: ApprovalSubjectKind;
  subjectId: string;
  decision: ApprovalDecisionKind;
  decidedByUserId: string;
  decidedAtIso: string;
  note?: string;
  editedPayload?: Record<string, unknown>;
}

export interface CustomerReplyReceivedPayload {
  messageEventId: string;
  receivedAtIso: string;
}

export interface BankTransactionPostedPayload {
  bankTransactionId: string;
  postedAtIso: string;
  amountMinor: number;
  currency: string;
  counterpartyName?: string;
  reference?: string;
}

export interface PaymentReceivedPayload {
  paymentId: string;
  customerId?: string;
  invoiceId?: string;
  amountMinor: number;
  currency: string;
  paymentDateIso: string;
}

export interface ObligationDueSoonPayload {
  obligationId: string;
  dueDateIso: string;
  daysAhead: number;
}

export interface PromiseSupersededPayload {
  newPromiseId: string;
  reason: string;
}

export interface PromiseVoidedPayload {
  reason: string;
}

export interface PromiseDueDateChangedPayload {
  newDueDateIso: string;
  reason: string;
}

export interface HumanOverridePayload {
  /**
   * "discard" — drop the AI output and treat the reply as no-op.
   * "reclassify" — replace the AI classification with operator-provided values.
   */
  action: "discard" | "reclassify";
  classification?: string;
  promiseType?: PromiseType;
  conditionText?: string;
  notes?: string;
  decidedByUserId: string;
}

export interface CaseResolutionEvidencePayload {
  evidenceId: string;
  description: string;
  sourceKind: "bank_transaction" | "payment" | "supplier_confirmation" | "manual_attestation";
  receivedAtIso: string;
}

export interface CaseCloseRequestPayload {
  requestedByUserId: string;
  resolutionSummary: string;
}
