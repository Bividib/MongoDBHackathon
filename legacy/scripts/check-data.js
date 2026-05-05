const { listJsonFiles, readJson } = require("./lib/data-pack");

const requiredFiles = [
  "data/fixtures/company.json",
  "data/fixtures/users.json",
  "data/fixtures/customers.json",
  "data/fixtures/invoices.json",
  "data/fixtures/customer_payment_history.json",
  "data/fixtures/supplier_bills.json",
  "data/fixtures/supplier_terms.json",
  "data/fixtures/payroll_obligations.json",
  "data/fixtures/recurring_payments.json",
  "data/fixtures/bank_transactions_open_banking_style.json",
  "data/fixtures/email_threads.json",
  "data/fixtures/source_files.json",
  "data/fixtures/evidence_chunks_seed.json",
  "data/fixtures/memory_cards_seed.json",
  "data/fixtures/past_cash_squeeze_cases.json",
  "data/fixtures/baseline_payroll_case.json",
  "data/fixtures/baseline_case_events.json",
  "data/fixtures/baseline_collection_drafts.json",
  "data/fixtures/baseline_payment_run_plan.json",
  "data/events/01_scheduler_payroll_scan.json",
  "data/events/02_customer_a_conditional_reply.json",
  "data/events/03_harbour_labs_retainer_posted.json",
  "data/events/04_customer_b_no_response_tick.json",
  "data/events/05_user_approves_northstar_confirmation.json",
  "data/events/06_user_approves_supplier_x_conditional_hold.json",
  "data/events/07_customer_a_dispute_backup.json",
  "data/expected_outputs/forecast_v1_baseline.json",
  "data/expected_outputs/forecast_v2_after_customer_a_reply.json",
  "data/expected_outputs/forecast_v3_after_harbour_labs_retainer.json",
  "data/expected_outputs/payment_plan_v1_baseline.json",
  "data/expected_outputs/payment_plan_v2_after_customer_reply.json",
  "data/expected_outputs/payment_plan_v3_after_bank_transaction.json",
  "data/expected_outputs/decision_log_expected.json",
  "data/expected_outputs/founder_briefing_expected.json",
  "data/expected_outputs/memory_card_expected.json",
  "data/expected_outputs/retrieval_attempts_expected.json",
  "data/expected_outputs/agent_runs_expected.json",
];

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function main() {
  const allJsonFiles = [
    ...listJsonFiles("fixtures"),
    ...listJsonFiles("events"),
    ...listJsonFiles("expected_outputs"),
  ];

  for (const requiredFile of requiredFiles) {
    if (!allJsonFiles.includes(requiredFile)) {
      throw new Error(`Missing required data file: ${requiredFile}`);
    }
  }

  for (const file of allJsonFiles) {
    readJson(file);
  }

  const forecastV1 = readJson("data/expected_outputs/forecast_v1_baseline.json");
  const forecastV2 = readJson("data/expected_outputs/forecast_v2_after_customer_a_reply.json");
  const forecastV3 = readJson("data/expected_outputs/forecast_v3_after_harbour_labs_retainer.json");

  assertEqual(forecastV1.scenarios[0].friday_position_gbp, -5200, "v1 supplier paid gap");
  assertEqual(forecastV1.scenarios[1].friday_position_gbp, -2800, "v1 supplier held gap");
  assertEqual(forecastV2.scenarios[0].friday_position_gbp, 2000, "v2 Northstar pays");
  assertEqual(forecastV2.scenarios[1].friday_position_gbp, -2800, "v2 Northstar slips");
  assertEqual(forecastV3.scenarios[0].friday_position_gbp, -1600, "v3 Northstar slips");
  assertEqual(forecastV3.scenarios[1].friday_position_gbp, 800, "v3 Northstar pays");

  console.log(`Data pack OK: ${allJsonFiles.length} JSON files validated`);
}

try {
  main();
} catch (error) {
  console.error(`Data pack check failed: ${error.message}`);
  process.exit(1);
}
