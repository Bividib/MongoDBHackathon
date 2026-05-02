# RunwayOps Voice Agent Setup

Outbound voice calls are part of the main demo, but they are never automatic.

## Responsibility Split

LangGraph or the TypeScript orchestrator may recommend a customer call and create an approval task. It must not call ElevenLabs directly.

The approved execution path is:

```text
collections agent recommends call
-> MongoDB task is marked approval_required
-> human approves in UI or demo operator flow
-> POST /api/voice/outbound-call
-> ElevenLabs outbound call is submitted only when send === true
```

## API Route

```text
POST /api/voice/outbound-call
```

Required body fields:

```json
{
  "toNumber": "+447000000000",
  "customerName": "Northstar Studio",
  "invoiceNumber": "INV-1042",
  "amountGbp": 4800,
  "purpose": "Confirm payment timing and whether any blocker exists."
}
```

`purpose` should come from the collections agent recommendation. If omitted, the route can derive it from an existing `collection_drafts` document when `collectionDraftId`, `customerId`, or `invoiceId` is supplied.

Dry run is the default. To place one approved call, include:

```json
{
  "send": true,
  "approvedBy": "usr_emma_marlow"
}
```

Approved sends should include either `approvedBy` or `approvalTaskId`.

## Safety Rules

- Calls are never placed unless `send === true`.
- Raw phone numbers are not written to MongoDB or logs.
- The ElevenLabs prompt identifies the call as a controlled RunwayOps demo/test call if asked.
- The agent asks only for payment timing and blockers.
- The agent must not collect card details, bank details, or payments.
- The agent must not claim legal, debt-collection, accounting, banking, or regulated financial authority.
- The agent ends politely if the call is inconvenient.

## MongoDB Writes

Dry run writes:

```text
events: voice_call.recommended
agent_runs: voice_outreach_agent
decision_log: human-approved outbound voice action, approved=false
artifacts: voice_call_metadata, dry_run=true
```

Approved send writes:

```text
events: voice_call.recommended
events: voice_call.approved
events: voice_call.submitted
agent_runs: voice_outreach_agent
decision_log: human-approved outbound voice action, approved=true
artifacts: voice_call_metadata with conversation_id/callSid when returned
```

If `approvalTaskId` is supplied on an approved send, the route marks that task as `approved_executed`.

## Adaptive Channel Recommendation

The route reads customer contact metadata when available:

```text
customers.contact_response_profile.phone_pickup_rate
customers.contact_response_profile.email_reply_rate
customers.preferred_contact_channels
customers.phone_contact_consent
```

If response-pattern data is missing, the route records `contact_response_profile.status = needs_more_signal` on the customer document and still requires human approval before any call. Email-preferred customers receive an email draft in the route internals, but this route does not send email.

## Runtime Override Finding

Live diagnostics showed this boundary:

```text
minimal outbound payload: connects
first_message + dynamic_variables override: connects
full prompt.prompt override: can fail before ElevenLabs accepts the call
```

For the live demo, keep the API route to first-message and dynamic variable overrides only. Configure the ElevenLabs agent prompt in the ElevenLabs dashboard to use:

```text
{{customer_name}}
{{invoice_number}}
{{amount_gbp}}
{{call_purpose}}
```

The dashboard prompt should include the safety rules above. This gives the agent the right call context without using the runtime `prompt.prompt` override that caused failed call handoffs in testing.
