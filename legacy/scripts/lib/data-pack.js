const fs = require("node:fs");
const path = require("node:path");

const dataRoot = path.join(process.cwd(), "data");

const demoCollections = [
  "companies",
  "users",
  "customers",
  "invoices",
  "customer_payment_history",
  "supplier_bills",
  "supplier_terms",
  "payroll_obligations",
  "recurring_payments",
  "bank_transactions_ts",
  "email_threads",
  "source_files",
  "memory_chunks",
  "memory_cards",
  "past_cash_squeeze_cases",
  "cases",
  "events",
  "event_inbox",
  "collection_drafts",
  "payment_run_plans",
  "cashflow_forecasts",
  "decision_log",
  "founder_briefings",
  "retrieval_attempts",
  "agent_runs",
  "tasks",
  "artifacts",
  "checkpoints",
  "agent_scratch",
  "retrieval_cache",
];

const fixtureLoads = [
  ["data/fixtures/company.json", "companies"],
  ["data/fixtures/users.json", "users"],
  ["data/fixtures/customers.json", "customers"],
  ["data/fixtures/invoices.json", "invoices"],
  ["data/fixtures/customer_payment_history.json", "customer_payment_history"],
  ["data/fixtures/supplier_bills.json", "supplier_bills"],
  ["data/fixtures/supplier_terms.json", "supplier_terms"],
  ["data/fixtures/payroll_obligations.json", "payroll_obligations"],
  ["data/fixtures/recurring_payments.json", "recurring_payments"],
  ["data/fixtures/bank_transactions_open_banking_style.json", "bank_transactions_ts"],
  ["data/fixtures/email_threads.json", "email_threads"],
  ["data/fixtures/source_files.json", "source_files"],
  ["data/fixtures/evidence_chunks_seed.json", "memory_chunks"],
  ["data/fixtures/memory_cards_seed.json", "memory_cards"],
  ["data/fixtures/past_cash_squeeze_cases.json", "past_cash_squeeze_cases"],
  ["data/fixtures/baseline_payroll_case.json", "cases"],
  ["data/fixtures/baseline_case_events.json", "events"],
  ["data/events/01_scheduler_payroll_scan.json", "event_inbox"],
  ["data/fixtures/baseline_collection_drafts.json", "collection_drafts"],
  ["data/fixtures/baseline_payment_run_plan.json", "payment_run_plans"],
  ["data/expected_outputs/forecast_v1_baseline.json", "cashflow_forecasts"],
];

function readJson(relativePath) {
  const fullPath = path.join(process.cwd(), relativePath);
  const contents = fs.readFileSync(fullPath, "utf8");

  return JSON.parse(contents);
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function listJsonFiles(dir) {
  const fullDir = path.join(dataRoot, dir);

  if (!fs.existsSync(fullDir)) {
    return [];
  }

  return fs
    .readdirSync(fullDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join("data", dir, file).replace(/\\/g, "/"));
}

module.exports = {
  asArray,
  demoCollections,
  fixtureLoads,
  listJsonFiles,
  readJson,
};
