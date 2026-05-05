import type {
  ApprovalRequestSummary,
  CreateApprovalRequestsInput
} from "./types.js";

export async function createApprovalRequests(
  input: CreateApprovalRequestsInput
): Promise<ApprovalRequestSummary[]> {
  return input.subjects.map((subject) => ({
    approvalRequestId: `${input.idempotencyKey}:approval:${subject.subjectId}`,
    subjectKind: subject.subjectKind,
    subjectId: subject.subjectId
  }));
}

export async function createApprovalRequest(
  input: CreateApprovalRequestsInput
): Promise<ApprovalRequestSummary> {
  const all = await createApprovalRequests(input);
  const first = all[0];
  if (!first) {
    throw new Error("createApprovalRequest: no subjects provided");
  }
  return first;
}
