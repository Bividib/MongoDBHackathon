CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION runwayops_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  display_name text NOT NULL,
  legal_name text,
  slug text NOT NULL,
  base_currency char(3) NOT NULL DEFAULT 'GBP',
  country_code text NOT NULL DEFAULT 'GB',
  timezone text NOT NULL DEFAULT 'Europe/London',
  status text NOT NULL DEFAULT 'active',
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX companies_slug_unique ON companies (slug);
--> statement-breakpoint
CREATE INDEX companies_status_idx ON companies (status);
--> statement-breakpoint
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  email text NOT NULL,
  display_name text NOT NULL,
  auth_provider text,
  auth_provider_user_id text,
  status text NOT NULL DEFAULT 'active',
  last_login_at timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX users_email_unique ON users (email);
--> statement-breakpoint
CREATE UNIQUE INDEX users_auth_provider_subject_unique ON users (auth_provider, auth_provider_user_id);
--> statement-breakpoint
CREATE INDEX users_status_idx ON users (status);
--> statement-breakpoint
CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE cascade,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  invited_by_user_id uuid REFERENCES users(id) ON DELETE set null,
  joined_at timestamptz,
  CONSTRAINT memberships_role_check CHECK (
    role IN ('owner', 'admin', 'finance_manager', 'bookkeeper', 'approver', 'viewer')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX memberships_company_user_unique ON memberships (company_id, user_id);
--> statement-breakpoint
CREATE INDEX memberships_company_role_idx ON memberships (company_id, role);
--> statement-breakpoint
CREATE TABLE company_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  policy_key text NOT NULL,
  policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  effective_from timestamptz NOT NULL DEFAULT now(),
  requires_founder_approval boolean NOT NULL DEFAULT false
);
--> statement-breakpoint
CREATE UNIQUE INDEX company_policies_company_key_unique ON company_policies (company_id, policy_key);
--> statement-breakpoint
CREATE INDEX company_policies_company_status_idx ON company_policies (company_id, status);
--> statement-breakpoint
CREATE TABLE source_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  provider text NOT NULL,
  provider_object_type text NOT NULL,
  provider_object_id text NOT NULL,
  source_updated_at timestamptz,
  raw_payload jsonb NOT NULL,
  raw_payload_hash text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX source_objects_provider_identity_unique
  ON source_objects (company_id, provider, provider_object_type, provider_object_id);
--> statement-breakpoint
CREATE INDEX source_objects_company_provider_idx ON source_objects (company_id, provider);
--> statement-breakpoint
CREATE TABLE integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  provider text NOT NULL,
  status text NOT NULL,
  display_name text,
  connected_by_user_id uuid REFERENCES users(id) ON DELETE set null,
  granted_scopes text[],
  token_expires_at timestamptz,
  consent_expires_at timestamptz,
  last_successful_sync_at timestamptz,
  last_failed_sync_at timestamptz,
  reconnect_required boolean NOT NULL DEFAULT false,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX integration_connections_company_provider_idx
  ON integration_connections (company_id, provider);
--> statement-breakpoint
CREATE INDEX integration_connections_company_status_idx
  ON integration_connections (company_id, status);
--> statement-breakpoint
CREATE TABLE integration_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE cascade,
  token_type text NOT NULL,
  encrypted_token text NOT NULL,
  key_id text NOT NULL,
  expires_at timestamptz,
  rotated_at timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX integration_tokens_connection_type_unique
  ON integration_tokens (connection_id, token_type);
--> statement-breakpoint
CREATE TABLE sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  connection_id uuid REFERENCES integration_connections(id) ON DELETE set null,
  provider text NOT NULL,
  sync_type text NOT NULL,
  status text NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  cursor_before text,
  cursor_after text,
  records_processed integer NOT NULL DEFAULT 0,
  error_message text,
  error_json jsonb,
  CONSTRAINT sync_jobs_records_processed_nonnegative CHECK (records_processed >= 0)
);
--> statement-breakpoint
CREATE INDEX sync_jobs_company_provider_status_idx
  ON sync_jobs (company_id, provider, status);
--> statement-breakpoint
CREATE TABLE sync_cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE cascade,
  provider text NOT NULL,
  resource_type text NOT NULL,
  cursor_value text,
  cursor_version integer NOT NULL DEFAULT 1,
  last_successful_sync_at timestamptz,
  last_event_at timestamptz
);
--> statement-breakpoint
CREATE UNIQUE INDEX sync_cursors_connection_resource_unique
  ON sync_cursors (connection_id, resource_type);
--> statement-breakpoint
CREATE INDEX sync_cursors_company_provider_idx ON sync_cursors (company_id, provider);
--> statement-breakpoint
CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  connection_id uuid REFERENCES integration_connections(id) ON DELETE set null,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX webhook_events_provider_event_unique
  ON webhook_events (provider, provider_event_id);
--> statement-breakpoint
CREATE INDEX webhook_events_company_status_idx ON webhook_events (company_id, status);
--> statement-breakpoint
CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  scope text NOT NULL,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_json jsonb,
  status_code integer,
  expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX idempotency_keys_company_scope_key_unique
  ON idempotency_keys (company_id, scope, key);
--> statement-breakpoint
CREATE INDEX idempotency_keys_expires_at_idx ON idempotency_keys (expires_at);
--> statement-breakpoint
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  source_object_id uuid REFERENCES source_objects(id) ON DELETE set null,
  display_name text NOT NULL,
  legal_name text,
  external_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  relationship_tier text NOT NULL DEFAULT 'standard',
  default_contact_id uuid,
  status text NOT NULL DEFAULT 'active',
  notes text
);
--> statement-breakpoint
CREATE INDEX customers_company_status_idx ON customers (company_id, status);
--> statement-breakpoint
CREATE INDEX customers_company_relationship_tier_idx
  ON customers (company_id, relationship_tier);
--> statement-breakpoint
CREATE TABLE customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE cascade,
  source_object_id uuid REFERENCES source_objects(id) ON DELETE set null,
  name text NOT NULL,
  email text,
  phone text,
  role_title text,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
);
--> statement-breakpoint
CREATE INDEX customer_contacts_company_customer_idx
  ON customer_contacts (company_id, customer_id);
--> statement-breakpoint
CREATE UNIQUE INDEX customer_contacts_customer_email_unique
  ON customer_contacts (customer_id, email);
--> statement-breakpoint
CREATE TABLE bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  connection_id uuid REFERENCES integration_connections(id) ON DELETE set null,
  source_object_id uuid REFERENCES source_objects(id) ON DELETE set null,
  provider text NOT NULL,
  account_name text NOT NULL,
  institution_name text,
  account_type text NOT NULL DEFAULT 'business_current',
  currency char(3) NOT NULL,
  current_balance_minor bigint,
  available_balance_minor bigint,
  balance_as_of timestamptz,
  consent_expires_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  external_refs jsonb NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX bank_accounts_company_status_idx ON bank_accounts (company_id, status);
--> statement-breakpoint
CREATE INDEX bank_accounts_company_provider_idx ON bank_accounts (company_id, provider);
--> statement-breakpoint
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE restrict,
  source_object_id uuid REFERENCES source_objects(id) ON DELETE set null,
  invoice_number text NOT NULL,
  issue_date date,
  due_date date,
  status text NOT NULL,
  amount_total_minor bigint NOT NULL,
  amount_due_minor bigint NOT NULL,
  amount_paid_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  last_source_updated_at timestamptz,
  CONSTRAINT invoices_amount_total_nonnegative CHECK (amount_total_minor >= 0),
  CONSTRAINT invoices_amount_due_nonnegative CHECK (amount_due_minor >= 0),
  CONSTRAINT invoices_amount_paid_nonnegative CHECK (amount_paid_minor >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX invoices_company_invoice_number_unique
  ON invoices (company_id, invoice_number);
--> statement-breakpoint
CREATE INDEX invoices_company_customer_idx ON invoices (company_id, customer_id);
--> statement-breakpoint
CREATE INDEX invoices_company_due_date_idx ON invoices (company_id, due_date);
--> statement-breakpoint
CREATE INDEX invoices_company_status_idx ON invoices (company_id, status);
--> statement-breakpoint
CREATE TABLE invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE cascade,
  source_object_id uuid REFERENCES source_objects(id) ON DELETE set null,
  description text NOT NULL,
  quantity numeric(12,4) NOT NULL DEFAULT 1,
  unit_amount_minor bigint NOT NULL,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  tax_rate numeric(6,4),
  account_code text,
  CONSTRAINT invoice_line_items_amount_nonnegative CHECK (amount_minor >= 0)
);
--> statement-breakpoint
CREATE INDEX invoice_line_items_company_invoice_idx
  ON invoice_line_items (company_id, invoice_id);
--> statement-breakpoint
CREATE TABLE bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  bank_account_id uuid NOT NULL REFERENCES bank_accounts(id) ON DELETE cascade,
  source_object_id uuid REFERENCES source_objects(id) ON DELETE set null,
  provider_transaction_id text NOT NULL,
  posted_at timestamptz NOT NULL,
  booking_date date,
  value_date date,
  direction text NOT NULL,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  description text NOT NULL,
  counterparty_name text,
  counterparty_account_ref text,
  running_balance_minor bigint,
  status text NOT NULL DEFAULT 'posted',
  matched_invoice_id uuid REFERENCES invoices(id) ON DELETE set null,
  match_confidence text,
  raw_category text,
  CONSTRAINT bank_transactions_amount_nonnegative CHECK (amount_minor >= 0),
  CONSTRAINT bank_transactions_direction_check CHECK (direction IN ('credit', 'debit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX bank_transactions_provider_transaction_unique
  ON bank_transactions (bank_account_id, provider_transaction_id);
--> statement-breakpoint
CREATE INDEX bank_transactions_company_posted_at_idx
  ON bank_transactions (company_id, posted_at);
--> statement-breakpoint
CREATE INDEX bank_transactions_company_direction_idx
  ON bank_transactions (company_id, direction);
--> statement-breakpoint
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  customer_id uuid REFERENCES customers(id) ON DELETE set null,
  invoice_id uuid REFERENCES invoices(id) ON DELETE set null,
  source_object_id uuid REFERENCES source_objects(id) ON DELETE set null,
  bank_transaction_id uuid REFERENCES bank_transactions(id) ON DELETE set null,
  payment_date date NOT NULL,
  posted_at timestamptz,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  provider_status text NOT NULL,
  payment_method text,
  reference text,
  CONSTRAINT payments_amount_nonnegative CHECK (amount_minor >= 0)
);
--> statement-breakpoint
CREATE INDEX payments_company_customer_idx ON payments (company_id, customer_id);
--> statement-breakpoint
CREATE INDEX payments_company_invoice_idx ON payments (company_id, invoice_id);
--> statement-breakpoint
CREATE INDEX payments_company_payment_date_idx ON payments (company_id, payment_date);
--> statement-breakpoint
CREATE TABLE critical_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  source_object_id uuid REFERENCES source_objects(id) ON DELETE set null,
  obligation_type text NOT NULL,
  counterparty_name text NOT NULL,
  due_date date NOT NULL,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  criticality text NOT NULL,
  recurrence_rule text,
  manual_or_source text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  paid_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  CONSTRAINT critical_obligations_amount_nonnegative CHECK (amount_minor >= 0),
  CONSTRAINT critical_obligations_manual_or_source_check CHECK (manual_or_source IN ('manual', 'source'))
);
--> statement-breakpoint
CREATE INDEX critical_obligations_company_due_date_idx
  ON critical_obligations (company_id, due_date);
--> statement-breakpoint
CREATE INDEX critical_obligations_company_status_idx
  ON critical_obligations (company_id, status);
--> statement-breakpoint
CREATE TABLE communication_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  customer_id uuid REFERENCES customers(id) ON DELETE set null,
  source_object_id uuid REFERENCES source_objects(id) ON DELETE set null,
  channel text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'open',
  external_refs jsonb NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX communication_threads_company_customer_idx
  ON communication_threads (company_id, customer_id);
--> statement-breakpoint
CREATE INDEX communication_threads_company_status_idx
  ON communication_threads (company_id, status);
--> statement-breakpoint
CREATE TABLE communication_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  thread_id uuid NOT NULL REFERENCES communication_threads(id) ON DELETE cascade,
  customer_id uuid REFERENCES customers(id) ON DELETE set null,
  source_object_id uuid REFERENCES source_objects(id) ON DELETE set null,
  provider_message_id text,
  direction text NOT NULL,
  sent_at timestamptz NOT NULL,
  from_address text,
  to_addresses text[] NOT NULL,
  subject text,
  body_text text NOT NULL,
  body_hash text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX communication_messages_company_thread_idx
  ON communication_messages (company_id, thread_id);
--> statement-breakpoint
CREATE INDEX communication_messages_company_sent_at_idx
  ON communication_messages (company_id, sent_at);
--> statement-breakpoint
CREATE TABLE promise_to_pay_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE cascade,
  invoice_id uuid REFERENCES invoices(id) ON DELETE set null,
  source_message_id uuid REFERENCES communication_messages(id) ON DELETE set null,
  amount_promised_minor bigint,
  currency char(3) NOT NULL DEFAULT 'GBP',
  promised_date date,
  promise_type text NOT NULL,
  condition_text text,
  extracted_text text NOT NULL,
  confidence_at_creation numeric(5,4) NOT NULL,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text NOT NULL DEFAULT 'pending',
  actual_payment_date date,
  actual_amount_received_minor bigint,
  actual_payment_id uuid REFERENCES payments(id) ON DELETE set null,
  created_by text NOT NULL,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE set null,
  CONSTRAINT promise_to_pay_records_confidence_range CHECK (
    confidence_at_creation >= 0 AND confidence_at_creation <= 1
  ),
  CONSTRAINT promise_to_pay_records_promise_type_check CHECK (
    promise_type IN ('firm', 'conditional', 'vague', 'partial', 'disputed', 'cannot_pay', 'already_paid_claim')
  ),
  CONSTRAINT promise_to_pay_records_outcome_check CHECK (
    outcome IN ('pending', 'kept', 'partially_kept', 'late', 'broken', 'superseded', 'disputed')
  ),
  CONSTRAINT promise_to_pay_records_created_by_check CHECK (created_by IN ('ai', 'human'))
);
--> statement-breakpoint
CREATE INDEX promise_to_pay_records_company_customer_idx
  ON promise_to_pay_records (company_id, customer_id);
--> statement-breakpoint
CREATE INDEX promise_to_pay_records_company_promised_date_idx
  ON promise_to_pay_records (company_id, promised_date);
--> statement-breakpoint
CREATE INDEX promise_to_pay_records_company_outcome_idx
  ON promise_to_pay_records (company_id, outcome);
--> statement-breakpoint
CREATE TABLE cash_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  generated_at timestamptz NOT NULL DEFAULT now(),
  as_of_date date NOT NULL,
  horizon_days integer NOT NULL,
  trigger_event_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  cash_balance_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  risk_status text NOT NULL,
  shortfall_amount_minor bigint,
  forecast_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT cash_forecasts_horizon_days_positive CHECK (horizon_days > 0)
);
--> statement-breakpoint
CREATE INDEX cash_forecasts_company_generated_at_idx
  ON cash_forecasts (company_id, generated_at);
--> statement-breakpoint
CREATE INDEX cash_forecasts_company_risk_status_idx
  ON cash_forecasts (company_id, risk_status);
--> statement-breakpoint
CREATE TABLE forecast_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  forecast_id uuid NOT NULL REFERENCES cash_forecasts(id) ON DELETE cascade,
  scenario_name text NOT NULL,
  risk_status text NOT NULL,
  shortfall_amount_minor bigint,
  scenario_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE INDEX forecast_scenarios_company_forecast_idx
  ON forecast_scenarios (company_id, forecast_id);
--> statement-breakpoint
-- Collection actions: persisted entities mutated across the lifecycle via
-- the status field. Distinct from cash-engine's RankedCollectionActionCandidate
-- (ephemeral, recomputed each tick) and from collection_action_results
-- (per-attempt dispatch outcome).
--
-- action_kind  = INTENT (request_payment, confirm_promise, ...)
-- channel      = DELIVERY (email, sms, phone_task, letter, portal, in_app, internal)
-- tone         = REGISTER (friendly, neutral, firm, urgent, formal, apologetic, supportive)
-- These three dimensions are orthogonal; conflating them produced the
-- pre-Round-2.5 single `action_type` field that mixed channel and intent.
CREATE TABLE collection_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  customer_id uuid REFERENCES customers(id) ON DELETE cascade,
  invoice_id uuid REFERENCES invoices(id) ON DELETE set null,
  promise_id uuid REFERENCES promise_to_pay_records(id) ON DELETE set null,
  action_kind text NOT NULL CHECK (action_kind IN (
    'request_payment','request_partial_payment','confirm_promise',
    'resolve_dispute','manual_review_paid_claim','founder_escalation',
    'propose_payment_plan','request_supplier_timing','no_action'
  )),
  channel text NOT NULL CHECK (channel IN (
    'email','sms','phone_task','letter','portal','in_app','internal'
  )),
  tone text CHECK (tone IS NULL OR tone IN (
    'friendly','neutral','firm','urgent','formal','apologetic','supportive'
  )),
  status text NOT NULL CHECK (status IN (
    'proposed','awaiting_approval','approved','rejected','executing',
    'completed','cancelled','failed','expired'
  )),
  priority_score numeric(12,4) NOT NULL,
  expected_cash_impact_minor bigint,
  currency char(3),
  probability_of_payment numeric(5,4),
  evidence_confidence numeric(5,4) NOT NULL,
  relationship_risk_penalty numeric(12,4) NOT NULL DEFAULT 0,
  action_effort_penalty numeric(12,4) NOT NULL DEFAULT 0,
  requires_approval boolean NOT NULL DEFAULT true,
  approval_id uuid,
  reason text NOT NULL,
  draft_message_id uuid,
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE set null,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ranking_snapshot jsonb,
  metadata jsonb,
  recommended_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  due_date date,
  approved_at timestamptz,
  rejected_at timestamptz,
  executed_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT collection_actions_probability_range CHECK (
    probability_of_payment IS NULL OR (probability_of_payment >= 0 AND probability_of_payment <= 1)
  ),
  CONSTRAINT collection_actions_evidence_confidence_range CHECK (
    evidence_confidence >= 0 AND evidence_confidence <= 1
  ),
  CONSTRAINT collection_actions_expected_cash_nonnegative CHECK (
    expected_cash_impact_minor IS NULL OR expected_cash_impact_minor >= 0
  ),
  CONSTRAINT collection_actions_internal_only_for_no_action CHECK (
    channel <> 'internal' OR action_kind = 'no_action'
  )
);
--> statement-breakpoint
CREATE INDEX collection_actions_company_status_priority_idx
  ON collection_actions (company_id, status, priority_score);
--> statement-breakpoint
CREATE INDEX collection_actions_company_customer_idx
  ON collection_actions (company_id, customer_id);
--> statement-breakpoint
-- Append-only per-attempt dispatch outcome. One action may have many
-- results under retry/resend; idempotency_key prevents double-dispatch.
CREATE TABLE collection_action_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  action_id uuid NOT NULL REFERENCES collection_actions(id) ON DELETE cascade,
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  dispatched_at timestamptz NOT NULL,
  delivered_at timestamptz,
  outcome text NOT NULL CHECK (outcome IN (
    'delivered','bounced','opened','replied','failed','errored','no_op'
  )),
  external_message_id text,
  idempotency_key text NOT NULL,
  error_message text,
  metadata jsonb,
  CONSTRAINT collection_action_results_action_idem_unique UNIQUE (action_id, idempotency_key)
);
--> statement-breakpoint
CREATE INDEX collection_action_results_company_action_idx
  ON collection_action_results (company_id, action_id, attempt_number);
--> statement-breakpoint
CREATE TABLE message_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  action_id uuid NOT NULL REFERENCES collection_actions(id) ON DELETE cascade,
  thread_id uuid REFERENCES communication_threads(id) ON DELETE set null,
  created_by_user_id uuid REFERENCES users(id) ON DELETE set null,
  edited_by_user_id uuid REFERENCES users(id) ON DELETE set null,
  status text NOT NULL DEFAULT 'draft',
  channel text NOT NULL,
  subject text,
  body_text text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  model_trace_id text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT message_drafts_version_positive CHECK (version > 0)
);
--> statement-breakpoint
CREATE INDEX message_drafts_company_action_idx ON message_drafts (company_id, action_id);
--> statement-breakpoint
-- Approval requests: human-in-the-loop gate before any external action.
-- Polymorphic over `subject_kind` / `subject_id` because approvals span
-- collection_actions, message_drafts, payment_plans, and external messages.
-- The decision (and edited payload, if any) is captured inline plus appended
-- as an audit row for tamper-evident history.
CREATE TABLE approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  subject_kind text NOT NULL CHECK (subject_kind IN (
    'collection_action','message_draft','payment_plan','supplier_timing',
    'accounting_writeback','external_message'
  )),
  subject_id uuid NOT NULL,
  action_id uuid REFERENCES collection_actions(id) ON DELETE set null,
  requested_by_user_id uuid REFERENCES users(id) ON DELETE set null,
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE set null,
  status text NOT NULL CHECK (status IN (
    'pending','approved','rejected','edited','cancelled','expired'
  )),
  risk_level text NOT NULL DEFAULT 'medium',
  risk_summary text,
  content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision_kind text CHECK (decision_kind IS NULL OR decision_kind IN ('approved','rejected','edited')),
  decided_by_user_id uuid REFERENCES users(id) ON DELETE set null,
  decided_at timestamptz,
  decision_note text,
  decision_edited_payload jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  due_at timestamptz,
  CONSTRAINT approval_requests_decision_required_when_terminal CHECK (
    status = 'pending' OR decision_kind IS NOT NULL
  ),
  CONSTRAINT approval_requests_edited_requires_payload CHECK (
    decision_kind IS DISTINCT FROM 'edited' OR decision_edited_payload IS NOT NULL
  )
);
--> statement-breakpoint
CREATE INDEX approval_requests_company_status_idx
  ON approval_requests (company_id, status);
--> statement-breakpoint
CREATE INDEX approval_requests_company_assignee_idx
  ON approval_requests (company_id, assigned_to_user_id);
--> statement-breakpoint
CREATE TABLE approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  approval_request_id uuid NOT NULL REFERENCES approval_requests(id) ON DELETE cascade,
  decided_by_user_id uuid REFERENCES users(id) ON DELETE set null,
  decision text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  edited_content jsonb
);
--> statement-breakpoint
CREATE INDEX approval_decisions_company_request_idx
  ON approval_decisions (company_id, approval_request_id);
--> statement-breakpoint
-- Audit log: append-only WHO-DID-WHAT-WHEN-WHY-WITH-WHAT-EVIDENCE record.
-- Mirrors @runwayops/domain auditEventSchema field-for-field. Distinct from
-- outbox_events (which is the transactional outbox for domain events about
-- aggregates). The two surfaces solve different problems and should NOT be
-- conflated under "event sourcing" terminology.
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  actor_type text NOT NULL CHECK (actor_type IN ('system','user','ai','integration','workflow')),
  actor_id text,
  action text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN (
    'company','customer','invoice','payment','bank_transaction','obligation',
    'promise_to_pay','forecast','collection_action','approval','message_draft',
    'integration','domain_event'
  )),
  target_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  correlation_id uuid,
  causation_event_id uuid
);
--> statement-breakpoint
CREATE INDEX audit_events_company_occurred_at_idx
  ON audit_events (company_id, occurred_at);
--> statement-breakpoint
CREATE INDEX audit_events_company_target_idx
  ON audit_events (company_id, target_kind, target_id);
--> statement-breakpoint
CREATE INDEX audit_events_company_action_idx
  ON audit_events (company_id, action);
--> statement-breakpoint
CREATE INDEX audit_events_correlation_id_idx
  ON audit_events (correlation_id) WHERE correlation_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE cascade,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  last_error text,
  audit_event_id uuid REFERENCES audit_events(id) ON DELETE set null,
  CONSTRAINT outbox_events_attempts_nonnegative CHECK (attempts >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX outbox_events_idempotency_key_unique ON outbox_events (idempotency_key);
--> statement-breakpoint
CREATE INDEX outbox_events_status_available_at_idx ON outbox_events (status, available_at);
--> statement-breakpoint
CREATE INDEX outbox_events_company_aggregate_idx
  ON outbox_events (company_id, aggregate_type, aggregate_id);
--> statement-breakpoint
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'companies',
    'users',
    'memberships',
    'company_policies',
    'source_objects',
    'integration_connections',
    'integration_tokens',
    'sync_jobs',
    'sync_cursors',
    'webhook_events',
    'idempotency_keys',
    'customers',
    'customer_contacts',
    'bank_accounts',
    'invoices',
    'invoice_line_items',
    'bank_transactions',
    'payments',
    'critical_obligations',
    'communication_threads',
    'communication_messages',
    'promise_to_pay_records',
    'cash_forecasts',
    'forecast_scenarios',
    'collection_actions',
    'message_drafts',
    'approval_requests',
    'approval_decisions',
    'outbox_events'
  ]
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION runwayops_set_updated_at()', table_name || '_set_updated_at', table_name);
  END LOOP;
END $$;
