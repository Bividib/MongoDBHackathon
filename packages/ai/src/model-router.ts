import type {
  ActionRecommendation,
  ActionRecommendationInput,
  AuditExplanation,
  AuditInput,
  DraftMessageInput,
  EvidenceSummary,
  EvidenceSummaryInput,
  MessageDraft,
  PromiseExtraction,
  PromiseExtractionInput,
  ReplyClassification,
  ReplyClassificationInput,
} from "./schemas/index.js";

export interface ModelRouter {
  classifyReply(input: ReplyClassificationInput): Promise<ReplyClassification>;
  extractPromise(input: PromiseExtractionInput): Promise<PromiseExtraction>;
  summarizeEvidence(input: EvidenceSummaryInput): Promise<EvidenceSummary>;
  draftMessage(input: DraftMessageInput): Promise<MessageDraft>;
  generateAuditExplanation(input: AuditInput): Promise<AuditExplanation>;
  recommendAction(input: ActionRecommendationInput): Promise<ActionRecommendation>;
}
