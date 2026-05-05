import type { EvidenceRef, SafetyFlag } from "../schemas/index.js";

const PROMPT_INJECTION_PATTERNS: readonly RegExp[] = [
  /\bignore (all )?(previous|prior|above|system|developer) (instructions|messages|prompts)\b/i,
  /\bignore (all )?(previous|prior|above) (system|developer) (instructions|messages|prompts)\b/i,
  /\bignore (the )?(system|developer) (policy|instructions|message|prompt)\b/i,
  /\bdisregard (all )?(previous|prior|above|system|developer) (instructions|messages|prompts)\b/i,
  /\bdisregard (all )?(previous|prior|above) (system|developer) (instructions|messages|prompts)\b/i,
  /\breveal (the )?(system|developer) (prompt|message|instructions)\b/i,
  /\byou are now\b/i,
  /\bact as\b/i,
  /\bbypass (approval|policy|controls?)\b/i,
  /\boverride (approval|policy|controls?)\b/i,
  /\bnew instructions:/i,
  /\bforget (all|your|the) (previous|prior|above)\b/i,
  /\b(jailbreak|dan mode|developer mode)\b/i,
];

const SENSITIVE_ACTION_PATTERNS: readonly RegExp[] = [
  /\bsend (the )?(email|message|payment|money|funds?|wire)\b/i,
  /\binitiate (a |the )?(payment|transfer|wire|ach|debit)\b/i,
  /\bmark (payroll|rent|tax|loan|supplier) (as )?safe\b/i,
  /\bdelete (records?|data|audit|invoice|message)\b/i,
  /\bchange (payment terms|access|permissions)\b/i,
  /\b(just )?take the money\b/i,
  /\bauto[- ]?pay (the|this|us|yourself)\b/i,
  /\bcharge (the|our|my|your) (card|account)\b/i,
];

const PAYMENT_INITIATION_PATTERNS: readonly RegExp[] = [
  /\binitiate (a |the )?(payment|transfer|wire|ach|debit)\b/i,
  /\bsend (the )?payment\b/i,
  /\bsend (the )?(money|funds|wire)\b/i,
  /\b(just )?take the money\b/i,
  /\bauto[- ]?pay (the|this|us|yourself)\b/i,
  /\bcharge (the|our|my|your) (card|account)\b/i,
  /\b(pay|settle) (it|the invoice) (yourself|automatically|on (my|our) behalf)\b/i,
  /\b(release|disburse) (the )?(funds|payment|money)\b/i,
];

const LEGAL_THREAT_PATTERNS: readonly RegExp[] = [
  /\blegal action\b/i,
  /\blegal threat\b/i,
  /\bdebt collector\b/i,
  /\bcollections agency\b/i,
  /\bcourt action\b/i,
  /\bstatutory demand\b/i,
  /\b(consulting|consult|spoke (to|with)|hired|engaged|talking to) (our|my|the) (lawyers?|solicitors?|attorneys?|legal team|counsel)\b/i,
  /\bsee you in court\b/i,
  /\bissue (a )?(claim|lawsuit|writ)\b/i,
];

const PAYROLL_SAFETY_PATTERNS: readonly RegExp[] = [
  /\bmark (payroll|rent|tax|loan|supplier) (as )?safe\b/i,
  /\bconfirm (that )?payroll (is|will be) (safe|covered|fine|ok|okay)\b/i,
  /\bcan you (confirm|tell me|say) (that )?payroll (is|will be) safe\b/i,
  /\bis payroll safe\??/i,
  /\bpayroll (is|are|will be) (safe|covered|fine|ok|okay)\b/i,
  /\b(rent|tax|loan|supplier) (is|are|will be) (safe|covered|fine|ok|okay)\b/i,
];

const AUTHORITY_SPOOFING_PATTERNS: readonly RegExp[] = [
  /\bi am (the |your )?(cfo|ceo|owner|founder|director|admin|administrator|finance manager)\b/i,
  /\bthis is (the |your )?(cfo|ceo|owner|founder|director|admin|finance manager)\b/i,
  /\b(speaking|writing) as (the |your )?(cfo|ceo|owner|founder|director)\b/i,
  /\bon behalf of (the )?(cfo|ceo|owner|founder|director|board)\b/i,
  /\bauthori[sz]ed by (the )?(cfo|ceo|owner|founder|director|board)\b/i,
];

const URGENCY_MANIPULATION_PATTERNS: readonly RegExp[] = [
  /\bskip (the )?(approval|review|checks?)\b/i,
  /\bno time (for|to) (review|approve|approval|checks?)\b/i,
  /\b(this is (an? )?)?emergency.*?(skip|bypass|without|override|no review)\b/i,
  /\b(urgent|asap|right now|immediately).{0,40}(skip|bypass|without (an? )?(approval|review|check))\b/i,
  /\b(approval|review) (not )?(needed|required|necessary)\b/i,
  /\bjust do (it|this) (now|immediately)\b/i,
];

const TOOL_IMPERSONATION_PATTERNS: readonly RegExp[] = [
  /\b(call|invoke|execute|run|trigger) (the )?(send[_\- ]?payment|sendpayment|wire[_\- ]?money|mark[_\- ]?payroll[_\- ]?safe|approve[_\- ]?action|skip[_\- ]?approval|delete[_\- ]?audit)\b/i,
  /\b(call|invoke|execute|run|trigger) (the )?tool [a-z_]+\(/i,
  /\btool[_\- ]?call:\s*[a-z_]+/i,
  /<tool_use[\s>]/i,
  /\bfunction[_\- ]?call:\s*[a-z_]+/i,
];

const DATA_EXFIL_PATTERNS: readonly RegExp[] = [
  /\bshow me (customer|bank|invoice|system) data\b/i,
  /\bexport all\b/i,
  /\b(dump|leak|share) (the )?(customer|bank|invoice|database|secrets?|credentials?)\b/i,
];

const ZERO_WIDTH_REGEX = /[​‌‍⁠﻿]/g;

const HOMOGLYPH_MAP: Readonly<Record<string, string>> = {
  "а": "a",
  "е": "e",
  "о": "o",
  "р": "p",
  "с": "c",
  "х": "x",
  "ѕ": "s",
  "і": "i",
  "ї": "i",
  "ӏ": "l",
  "ԁ": "d",
  "ԛ": "q",
  "ԝ": "w",
  "ҫ": "c",
  "ѳ": "v",
  "һ": "h",
  "ʂ": "f",
  "ס": "o",
  "Ι": "i",
  "Α": "a",
  "Β": "b",
  "Ε": "e",
  "Η": "h",
  "Κ": "k",
  "Μ": "m",
  "Ν": "n",
  "Ο": "o",
  "Ρ": "p",
  "Τ": "t",
  "Υ": "y",
  "Χ": "x",
  "΢": "s",
  "Ӣ": "i",
  "Ａ": "a",
  "ｅ": "e",
  "ｉ": "i",
  "ｏ": "o",
};

const BASE64_CANDIDATE_REGEX = /[A-Za-z0-9+/]{16,}={0,2}/g;

function stripZeroWidth(text: string): string {
  return text.replace(ZERO_WIDTH_REGEX, "");
}

function normalizeHomoglyphs(text: string): string {
  let normalized = "";
  for (const char of text) {
    normalized += HOMOGLYPH_MAP[char] ?? char;
  }
  return normalized.normalize("NFKC");
}

function decodeBase64Segments(text: string): string[] {
  const decoded: string[] = [];
  for (const match of text.matchAll(BASE64_CANDIDATE_REGEX)) {
    const segment = match[0];
    if (segment.length % 4 !== 0) {
      continue;
    }
    try {
      const buf = Buffer.from(segment, "base64");
      const out = buf.toString("utf8");
      if (!out) {
        continue;
      }
      // require that the decoded value contains mostly printable characters
      let printable = 0;
      for (const ch of out) {
        const code = ch.charCodeAt(0);
        if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)) {
          printable++;
        }
      }
      if (printable / out.length >= 0.8 && out.length >= 8) {
        decoded.push(out);
      }
    } catch {
      // ignore decode failures
    }
  }
  return decoded;
}

export type NormalizedTextResult = {
  normalized: string;
  hasZeroWidth: boolean;
  hasHomoglyph: boolean;
  decodedSegments: string[];
};

export function normalizeForInjectionScan(text: string): NormalizedTextResult {
  const hasZeroWidth = ZERO_WIDTH_REGEX.test(text);
  const stripped = stripZeroWidth(text);
  let hasHomoglyph = false;
  for (const ch of stripped) {
    if (HOMOGLYPH_MAP[ch] !== undefined) {
      hasHomoglyph = true;
      break;
    }
  }
  const normalized = normalizeHomoglyphs(stripped);
  const decodedSegments = decodeBase64Segments(stripped);
  return { normalized, hasZeroWidth, hasHomoglyph, decodedSegments };
}

function anyPatternMatches(patterns: readonly RegExp[], texts: readonly string[]): boolean {
  for (const text of texts) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
  }
  return false;
}

export function detectPromptInjectionSignals(text: string): SafetyFlag[] {
  const flags = new Set<SafetyFlag>();
  const norm = normalizeForInjectionScan(text);
  const scanTexts = [norm.normalized, ...norm.decodedSegments];

  if (norm.hasZeroWidth || norm.hasHomoglyph || norm.decodedSegments.length > 0) {
    flags.add("encoded_payload");
  }

  if (anyPatternMatches(PROMPT_INJECTION_PATTERNS, scanTexts)) {
    flags.add("prompt_injection");
    flags.add("untrusted_instruction");
  }

  if (anyPatternMatches(SENSITIVE_ACTION_PATTERNS, scanTexts)) {
    flags.add("sensitive_action_request");
  }

  if (anyPatternMatches([/\b(bypass|override|ignore) (the )?(policy|approval|controls?)\b/i], scanTexts)) {
    flags.add("policy_override_request");
  }

  if (anyPatternMatches(LEGAL_THREAT_PATTERNS, scanTexts)) {
    flags.add("legal_threat_request");
  }

  if (anyPatternMatches(PAYMENT_INITIATION_PATTERNS, scanTexts)) {
    flags.add("payment_initiation_request");
  }

  if (anyPatternMatches(PAYROLL_SAFETY_PATTERNS, scanTexts)) {
    flags.add("payroll_safety_claim");
  }

  if (anyPatternMatches(DATA_EXFIL_PATTERNS, scanTexts)) {
    flags.add("data_access_request");
  }

  if (anyPatternMatches(AUTHORITY_SPOOFING_PATTERNS, scanTexts)) {
    flags.add("authority_spoofing");
  }

  if (anyPatternMatches(URGENCY_MANIPULATION_PATTERNS, scanTexts)) {
    flags.add("urgency_manipulation");
  }

  if (anyPatternMatches(TOOL_IMPERSONATION_PATTERNS, scanTexts)) {
    flags.add("tool_impersonation");
  }

  return [...flags];
}

export function mergeSafetyFlags(...flagSets: Array<readonly SafetyFlag[] | undefined>): SafetyFlag[] {
  const merged = new Set<SafetyFlag>();

  for (const flags of flagSets) {
    for (const flag of flags ?? []) {
      if (flag !== "none") {
        merged.add(flag);
      }
    }
  }

  return merged.size > 0 ? [...merged] : [];
}

export function validateEvidenceRefs(outputRefs: EvidenceRef[], allowedRefs: EvidenceRef[]): void {
  const allowed = new Set(allowedRefs.map((ref) => ref.id));
  const invalid = outputRefs.filter((ref) => !allowed.has(ref.id));

  if (invalid.length > 0) {
    throw new Error(`Model output referenced unknown evidence ids: ${invalid.map((ref) => ref.id).join(", ")}`);
  }
}

export function containsForbiddenOutboundAction(text: string): boolean {
  return [
    /\blegal action\b/i,
    /\bdebt collector\b/i,
    /\bcourt action\b/i,
    /\bstatutory demand\b/i,
    /\bwe have marked payroll safe\b/i,
    /\bpayment has been initiated\b/i,
    /\bmessage has been sent\b/i,
  ].some((pattern) => pattern.test(text));
}
