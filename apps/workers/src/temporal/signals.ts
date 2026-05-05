import { defineSignal } from "@temporalio/workflow";

import type {
  ApprovalDecisionPayload,
  BankTransactionPostedPayload,
  CaseCloseRequestPayload,
  CaseResolutionEvidencePayload,
  CustomerReplyReceivedPayload,
  HumanOverridePayload,
  ObligationDueSoonPayload,
  PaymentReceivedPayload,
  PromiseDueDateChangedPayload,
  PromiseSupersededPayload,
  PromiseVoidedPayload
} from "./signal-types.js";

// Approval lifecycle. Used by every workflow that creates approval requests.
export const approvalGrantedSignal = defineSignal<[ApprovalDecisionPayload]>("approval_granted");
export const approvalRejectedSignal = defineSignal<[ApprovalDecisionPayload]>("approval_rejected");
export const approvalEditedSignal = defineSignal<[ApprovalDecisionPayload]>("approval_edited");

// External evidence signals. Used by case and monitoring workflows.
export const customerReplyReceivedSignal = defineSignal<[CustomerReplyReceivedPayload]>(
  "customer_reply_received"
);
export const bankTransactionPostedSignal = defineSignal<[BankTransactionPostedPayload]>(
  "bank_transaction_posted"
);
export const paymentReceivedSignal = defineSignal<[PaymentReceivedPayload]>("payment_received");
export const obligationDueSoonSignal = defineSignal<[ObligationDueSoonPayload]>("obligation_due_soon");

// Promise lifecycle signals.
export const promiseSupersededSignal = defineSignal<[PromiseSupersededPayload]>(
  "promise_superseded"
);
export const promiseVoidedSignal = defineSignal<[PromiseVoidedPayload]>("promise_voided");
export const promiseDueDateChangedSignal = defineSignal<[PromiseDueDateChangedPayload]>(
  "promise_due_date_changed"
);

// Human override of AI classification or extraction.
export const humanOverrideSignal = defineSignal<[HumanOverridePayload]>("human_override");

// Critical-obligation case closure pair. The case only closes when BOTH have arrived.
export const caseResolutionEvidenceSignal = defineSignal<[CaseResolutionEvidencePayload]>(
  "case_resolution_evidence_received"
);
export const caseCloseRequestSignal = defineSignal<[CaseCloseRequestPayload]>("case_close_request");

// Cycle cancellation (operator hard-stops a daily cycle).
export const cycleCancelSignal = defineSignal<[{ reason: string }]>("cycle_cancel");
