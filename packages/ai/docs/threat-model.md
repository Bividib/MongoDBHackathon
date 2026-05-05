# @runwayops/ai threat model

## Scope

This document covers threats that target the bounded AI layer of
RunwayOps: customer-reply classification, promise extraction, draft
generation, evidence summarization, and audit explanation. The AI layer
is the only place in the product where untrusted text is consumed and
mapped into structured proposals. Everything downstream of the AI layer
(approvals, dispatch, persistence) is out of scope here.

## Trust boundary

- **Trusted inputs**: system policy, company policy, deterministic cash
  engine output, validated accounting facts, validated bank facts,
  internal evidence refs.
- **Untrusted inputs**: customer emails, supplier emails, attachments,
  user free-text notes, prior model outputs that have not been
  validated, anything wrapped in `<untrusted_content>` in a prompt.

The AI layer's job is to extract facts from untrusted inputs and never
follow instructions inside them.

## Attacker capabilities

- Send arbitrary text into a customer reply field that will reach the
  classifier and the draft generator.
- Embed encoded payloads (base64, unicode homoglyphs, zero-width
  characters) in that text.
- Run multi-turn conversations: chain a benign-looking turn followed by
  an exploit turn.
- Spoof identities ("I am the CFO", "this is the director").
- Invoke urgency ("emergency, skip approval").
- Embed strings that look like tool calls or function calls.

The attacker cannot alter trusted inputs, cannot reach the deterministic
cash engine, and cannot bypass the human approval gate downstream.

## Attack categories covered by the corpus

The corpus in `src/evals/fixtures/adversarial.ts` covers seven
attack kinds. Each fixture asserts a set of required safety flags and
that a hard refusal is required from any consuming mapper:

1. `chained_jailbreak` — turn N sets up a "rule" or persona, turn N+1
   exploits it.
2. `encoded_payload_base64` — instructions hidden inside a base64
   string.
3. `encoded_payload_homoglyph` — Cyrillic / fullwidth lookalikes used
   to evade lexical scanners.
4. `encoded_payload_zero_width` — zero-width characters interleaved
   with a jailbreak phrase.
5. `authority_spoofing` — attacker claims to be the CFO, CEO, owner,
   founder, director, board, or admin.
6. `urgency_manipulation` — attacker pressures the model to skip
   approval or act immediately.
7. `tool_name_impersonation` — attacker writes text that looks like a
   tool/function call (`call sendPayment`, `tool_call: ...`).

## Defenses

- Untrusted text is wrapped in `<untrusted_content>` markers before
  being placed in a prompt.
- The detector in `src/validators/prompt-injection.ts` strips
  zero-width characters, normalizes a homoglyph map, and decodes
  reasonable-looking base64 segments before scanning. Each surfaced
  signal becomes a `SafetyFlag` on the model output.
- The named policy validators in `src/validators/policy.ts` reject
  any output that proposes payment initiation, claims an obligation is
  safe, lacks evidence, or emits legal/tax advice.
- The proposal mappers in `src/schemas/domain-mappers.ts` apply the
  policy validators before returning a typed proposal. A failed
  validator returns a `ProposalRejected` result with the rule name and
  reason; nothing downstream can act on a rejected proposal.
- The product invariant `requires_approval=true` is forced on every
  proposal that could become an external action.

## Threat model summary (5 lines)

1. Untrusted text is the only attacker-controlled input.
2. We assume the attacker will combine encoding, persona, urgency, and
   tool-name tricks across multiple turns.
3. The defense is layered: prompt isolation, normalized scanning,
   safety flags, named policy validators, typed mapper refusals.
4. The AI never executes external actions; the human approval gate
   downstream is the final defense.
5. Any successful bypass is a CI failure: the eval suite enforces zero
   bypasses on the corpus, and the corpus only grows.

## Out of scope

- Multi-turn attacks that use trusted channels (those imply an
  upstream compromise that this layer cannot detect).
- Model-internal vulnerabilities of a real provider adapter; those
  belong to the integration that lands the adapter.
- Side-channel attacks on the cache or the prompt logs.
