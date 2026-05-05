import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePromiseConfidence,
  classifyConfidence,
  computeCashForecast,
  dedupeBankTransactions,
  rankNextBestActions,
  rankPaymentMatchCandidates
} from "../src/index.ts";
import { goldenFixtures } from "./fixtures/golden/phase3-fixtures.ts";

test("normal overdue invoice without obligation risk forecasts safe and still ranks an action", () => {
  const forecast = computeCashForecast(goldenFixtures.normalOverdueNoRisk);
  assert.equal(forecast.riskStatus, "safe");
  assert.equal(forecast.shortfallAmount, undefined);
  assert.equal(forecast.expectedInflows.length, 1);

  const actions = rankNextBestActions({
    companyId: goldenFixtures.companyId,
    asOfDate: goldenFixtures.asOfDate,
    invoices: goldenFixtures.normalOverdueNoRisk.invoices,
    customerStats: goldenFixtures.normalOverdueNoRisk.customerStats,
    forecast
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0]!.kind, "send_payment_reminder");
  assert.ok(actions[0]!.priorityScore > 0);
});

test("payroll due in five days with conditional promise is watch risk", () => {
  const forecast = computeCashForecast(goldenFixtures.payrollConditionalPromise);
  assert.equal(forecast.riskStatus, "watch");
  assert.equal(forecast.obligationRisks[0]!.coverageStatus, "dependent_on_medium_confidence");

  const promise = goldenFixtures.payrollConditionalPromise.promises![0]!;
  const confidence = calculatePromiseConfidence(
    promise,
    goldenFixtures.payrollConditionalPromise.customerStats![0],
    goldenFixtures.asOfDate
  ).finalConfidence;
  assert.equal(classifyConfidence(confidence), "medium");
});

test("already-paid claim without bank event stays low confidence and high risk", () => {
  const forecast = computeCashForecast(goldenFixtures.alreadyPaidClaimBankAbsent);
  assert.equal(forecast.riskStatus, "high");

  const promise = goldenFixtures.alreadyPaidClaimBankAbsent.promises![0]!;
  const confidence = calculatePromiseConfidence(
    promise,
    goldenFixtures.alreadyPaidClaimBankAbsent.customerStats![0],
    goldenFixtures.asOfDate
  ).finalConfidence;
  assert.equal(classifyConfidence(confidence), "low");
});

test("partial late payment match returns manual-review candidate", () => {
  const candidates = rankPaymentMatchCandidates(goldenFixtures.partialLatePaymentMatch);
  assert.equal(candidates[0]!.invoiceId, "inv_partial");
  assert.equal(candidates[0]!.promiseId, "ptp_partial");
  assert.ok(candidates[0]!.matchingFactors.includes("partial_amount"));
  assert.equal(candidates[0]!.requiresManualReview, true);
});

test("high historical reliability turns firm promise into high-confidence safe coverage", () => {
  const forecast = computeCashForecast(goldenFixtures.highHistoricalReliability);
  assert.equal(forecast.riskStatus, "safe");
  assert.equal(forecast.obligationRisks[0]!.coverageStatus, "covered_by_high_confidence");

  const confidence = calculatePromiseConfidence(
    goldenFixtures.highHistoricalReliability.promises![0]!,
    goldenFixtures.highHistoricalReliability.customerStats![0],
    goldenFixtures.asOfDate
  ).finalConfidence;
  assert.equal(classifyConfidence(confidence), "high");
});

test("broken conditional promise remains high risk despite nominal expected cash", () => {
  const forecast = computeCashForecast(goldenFixtures.brokenConditionalPromises);
  assert.equal(forecast.riskStatus, "high");
  assert.equal(forecast.obligationRisks[0]!.coverageStatus, "shortfall_actionable");
  assert.equal(forecast.shortfallAmount?.amountMinor, 500_000n);
});

test("supplier bill can create actionable shortfall", () => {
  const forecast = computeCashForecast(goldenFixtures.supplierBillCreatesShortfall);
  assert.equal(forecast.riskStatus, "high");
  assert.equal(forecast.expectedOutflows[0]!.kind, "supplier_bill");
  assert.equal(forecast.shortfallAmount?.amountMinor, 600_000n);
});

test("immediate unavoidable shortfall is critical", () => {
  const forecast = computeCashForecast(goldenFixtures.immediateUnavoidableShortfall);
  assert.equal(forecast.riskStatus, "critical");
  assert.equal(forecast.shortfallAmount?.amountMinor, 400_000n);
});

test("bank event landing closes risk and remains forecast evidence", () => {
  const forecast = computeCashForecast(goldenFixtures.bankEventLandsAndClosesRisk);
  assert.equal(forecast.riskStatus, "safe");
  assert.ok(forecast.evidenceRefs.some((ref) => ref.kind === "bank_transaction" && ref.id === "bank_landed"));
});

test("duplicate bank events are collapsed by idempotency key", () => {
  const deduped = dedupeBankTransactions(goldenFixtures.duplicatePaymentEvents);
  assert.equal(deduped.unique.length, 1);
  assert.equal(deduped.duplicates.length, 1);
  assert.equal(deduped.duplicates[0]!.id, "bank_duplicate_b");
});

test("timezone boundary promise is included using UTC date-only comparison", () => {
  const forecast = computeCashForecast(goldenFixtures.timezoneBoundaryPromise);
  assert.equal(forecast.expectedInflows.length, 1);
  assert.equal(forecast.expectedInflows[0]!.promiseId, "ptp_timezone");
});

test("next-best-action ranking uses shortfall-capped impact instead of largest invoice only", () => {
  const actions = rankNextBestActions(goldenFixtures.rankingInput);
  assert.equal(actions[0]!.invoiceId, "inv_small_urgent");
  assert.equal(actions[0]!.expectedCashImpact.amountMinor, 300_000n);
  assert.equal(actions[1]!.expectedCashImpact.amountMinor, 300_000n);
});

test("next-best-action scoring caps huge money values before converting to numeric score", () => {
  const actions = rankNextBestActions(goldenFixtures.hugeInvoiceRankingInput);
  assert.equal(actions.length, 1);
  assert.equal(Number.isFinite(actions[0]!.priorityScore), true);
  assert.ok(actions[0]!.priorityScore > 0);
});
