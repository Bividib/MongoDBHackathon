import type { EvidenceRef, RecommendedAction, SafetyFlag } from "../schemas/index.js";

export type RefusalRule =
  | "rejectIfProposesPaymentInitiation"
  | "rejectIfClaimsObligationSafe"
  | "rejectIfMissingEvidence"
  | "rejectIfLegalAdvice"
  | "rejectIfTaxAdvice";

export type PolicyRefusal = {
  ok: false;
  rule: RefusalRule;
  reason: string;
};

export type PolicyPass = { ok: true };

export type PolicyResult = PolicyPass | PolicyRefusal;

/**
 * PolicyTarget is the normalized shape every validator inspects. Mappers
 * project AI structured outputs into this shape so the same validators
 * apply uniformly across reply classification, promise extraction,
 * draft generation, evidence summary, and audit explanations.
 */
export type PolicyTarget = {
  text?: string;
  classification?: string;
  recommendedAction?: RecommendedAction;
  safetyFlags?: readonly SafetyFlag[];
  evidenceRefs?: readonly EvidenceRef[];
};

const PAYMENT_INITIATION_PHRASES: readonly RegExp[] = [
  /\binitiate (a |the )?(payment|transfer|wire|ach|debit)\b/i,
  /\bsend (the )?(payment|funds|money|wire)\b/i,
  /\b(just )?take the money\b/i,
  /\bcharge (the|our|my|your) (card|account)\b/i,
  /\bauto[- ]?pay (the|this|us|yourself)\b/i,
  /\b(release|disburse) (the )?(funds|payment|money)\b/i,
  /\b(pay|settle) (it|the invoice) (yourself|automatically|on (my|our) behalf)\b/i,
  /\bwe (have|will) initiated? (the )?(payment|transfer)\b/i,
];

const OBLIGATION_SAFETY_PHRASES: readonly RegExp[] = [
  /\b(payroll|tax|rent|loan|supplier|obligation)s? (is|are|will be|should be|looks?) (safe|covered|fine|ok|okay|secured?|sorted|handled)\b/i,
  /\b(payroll|tax|rent|loan) (is|are) (covered|sorted|handled)\b/i,
  /\b(can confirm|i confirm|confirmed) (that )?(payroll|tax|rent|loan)\b/i,
  /\byou(r| are) (safe|covered|fine|ok|okay) (on|with|for) (payroll|tax|rent|loan)\b/i,
  /\bno need to worry about (payroll|tax|rent|loan|supplier)\b/i,
  /\b(payroll|tax|rent|loan) will be (paid|made|funded) (on time|in full)\b/i,
  /\bmark(ed)? (payroll|tax|rent|loan|supplier) (as )?safe\b/i,
];

const LEGAL_ADVICE_PHRASES: readonly RegExp[] = [
  /\b(you|they|the company) (have|do not have|don't have) (a )?(legal|valid) (claim|case|right|defense)\b/i,
  /\bunder (the )?(law|statute|act|regulations?)\b/i,
  /\bthis (is|constitutes|amounts to) (a )?(breach|fraud|tort|violation|misrepresentation)\b/i,
  /\bwe (advise|recommend) (you )?(file|sue|pursue|take legal|engage (a|an) (lawyer|solicitor|attorney))\b/i,
  /\b(should|can|must) (file|sue|pursue) (a |an )?(claim|lawsuit|writ|case)\b/i,
  /\b(claim|invoke) (the |a )?(late payment|interest|statutory)\b/i,
  /\binsolvency proceedings?\b/i,
  /\b(winding[- ]?up|wind up) (petition|order)\b/i,
  /\b(letter before action|statutory demand)\b/i,
  /\b(my|our|legal) opinion is\b/i,
  /\bin (my|our) legal opinion\b/i,
];

const TAX_ADVICE_PHRASES: readonly RegExp[] = [
  /\btax (advice|implications|liability|deductible|treatment|planning)\b/i,
  /\b(you should|you can) (claim|deduct|reclaim|offset) .{0,40}(tax|vat|hmrc|irs)\b/i,
  /\bunder (vat|hmrc|irs|gaap|ifrs) (rules?|regulations?|guidance)\b/i,
  /\b(reclaim|account for|recover) (vat|tax|input tax)\b/i,
  /\b(file|amend) (your|a) (tax|vat) return\b/i,
  /\bcorporation tax (relief|deduction|treatment)\b/i,
  /\bwriting (this )?off (for|as) (tax|vat)\b/i,
  /\b(s455|s.455|section 455)\b/i,
];

function joinedTextFromTarget(target: PolicyTarget): string {
  return [target.text ?? "", target.classification ?? "", target.recommendedAction ?? ""]
    .filter(Boolean)
    .join("\n");
}

function someMatch(patterns: readonly RegExp[], text: string): boolean {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

const PASS: PolicyPass = { ok: true };

/**
 * Why: RunwayOps does not initiate payments. Payment initiation is
 * out of MVP scope and out of the AI layer's bounded permission set.
 * Even if a customer or operator asks the AI to "just take the money",
 * the AI must never produce an output that proposes initiating a
 * payment, transfer, wire, ACH, or card charge.
 */
export function rejectIfProposesPaymentInitiation(target: PolicyTarget): PolicyResult {
  const text = joinedTextFromTarget(target);
  if (someMatch(PAYMENT_INITIATION_PHRASES, text)) {
    return {
      ok: false,
      rule: "rejectIfProposesPaymentInitiation",
      reason:
        "AI output proposes initiating a payment. Payment initiation is out of scope for the AI layer; route to a human and a payment workflow.",
    };
  }
  if (target.safetyFlags?.includes("payment_initiation_request")) {
    return {
      ok: false,
      rule: "rejectIfProposesPaymentInitiation",
      reason:
        "AI output carries payment_initiation_request safety flag. Reject and require human review.",
    };
  }
  return PASS;
}

/**
 * Why: The model is allowed to compute and present cash numbers, but it
 * is never allowed to make the safety call on payroll, tax, rent, or
 * any critical obligation. That decision must come from the
 * deterministic cash engine plus a human approver, not from the AI.
 */
export function rejectIfClaimsObligationSafe(target: PolicyTarget): PolicyResult {
  const text = joinedTextFromTarget(target);
  if (someMatch(OBLIGATION_SAFETY_PHRASES, text)) {
    return {
      ok: false,
      rule: "rejectIfClaimsObligationSafe",
      reason:
        "AI output asserts an obligation (payroll, tax, rent, loan, supplier) is safe/covered/fine. The AI is not allowed to make the safety call; only the deterministic engine plus a human can.",
    };
  }
  if (target.safetyFlags?.includes("payroll_safety_claim") || target.safetyFlags?.includes("obligation_safety_claim")) {
    return {
      ok: false,
      rule: "rejectIfClaimsObligationSafe",
      reason:
        "AI output carries an obligation_safety_claim or payroll_safety_claim safety flag.",
    };
  }
  return PASS;
}

/**
 * Why: Every AI proposal that could become a domain command must carry
 * at least one evidence ref pointing back to the trusted facts that
 * justify it. No evidence -> not auditable -> not safe to propose.
 */
export function rejectIfMissingEvidence(target: PolicyTarget, minCount: number = 1): PolicyResult {
  const refs = target.evidenceRefs ?? [];
  if (refs.length < minCount) {
    return {
      ok: false,
      rule: "rejectIfMissingEvidence",
      reason: `AI output has ${refs.length} evidence ref(s); at least ${minCount} required.`,
    };
  }
  return PASS;
}

/**
 * Why: RunwayOps is not a legal product. The AI must never give legal,
 * litigation, or insolvency advice. It may surface that a customer has
 * mentioned legal action (so a human can review), but it must not
 * advise the user on legal claims, breach, statutory demands, etc.
 */
export function rejectIfLegalAdvice(target: PolicyTarget): PolicyResult {
  const text = joinedTextFromTarget(target);
  if (someMatch(LEGAL_ADVICE_PHRASES, text)) {
    return {
      ok: false,
      rule: "rejectIfLegalAdvice",
      reason:
        "AI output contains legal advice. The AI must not advise on legal claims, breach, statutory demands, insolvency, or litigation strategy.",
    };
  }
  return PASS;
}

/**
 * Why: RunwayOps is not a tax product. The AI must never give tax,
 * VAT, or accounting-treatment advice. It may compute and present cash
 * impacts, but it must not advise on tax filing, VAT reclaim, deductions,
 * or accounting policy.
 */
export function rejectIfTaxAdvice(target: PolicyTarget): PolicyResult {
  const text = joinedTextFromTarget(target);
  if (someMatch(TAX_ADVICE_PHRASES, text)) {
    return {
      ok: false,
      rule: "rejectIfTaxAdvice",
      reason:
        "AI output contains tax or VAT advice. The AI must not advise on tax filing, VAT reclaim, deductions, or accounting treatment.",
    };
  }
  return PASS;
}

export const ALL_POLICY_VALIDATORS: ReadonlyArray<(target: PolicyTarget) => PolicyResult> = [
  rejectIfProposesPaymentInitiation,
  rejectIfClaimsObligationSafe,
  (target: PolicyTarget) => rejectIfMissingEvidence(target),
  rejectIfLegalAdvice,
  rejectIfTaxAdvice,
];

export function applyPolicyValidators(
  target: PolicyTarget,
  validators: ReadonlyArray<(target: PolicyTarget) => PolicyResult> = ALL_POLICY_VALIDATORS,
): PolicyResult {
  for (const validator of validators) {
    const result = validator(target);
    if (!result.ok) {
      return result;
    }
  }
  return PASS;
}
