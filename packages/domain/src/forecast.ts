import { z } from "zod";

import {
  confidenceScoreSchema,
  dateSchema,
  idSchema,
  nonNegativeMoneySchema,
  requiredEvidenceRefsSchema
} from "./common.js";

export const riskStatusSchema = z.enum(["safe", "watch", "high", "critical"]);

export const forecastHorizonDaysSchema = z.union([
  z.literal(7),
  z.literal(14),
  z.literal(30),
  z.literal(90)
]);

export const forecastCashFlowKindSchema = z.enum([
  "invoice",
  "payment",
  "promise_to_pay",
  "bank_transaction",
  "obligation",
  "supplier_bill",
  "manual_adjustment"
]);

export const forecastCashFlowDirectionSchema = z.enum(["inflow", "outflow"]);

/**
 * Canonical cash-flow shape persisted in forecasts and consumed by API/UI.
 *
 * Cash-engine produces native runtime cash flows (deterministic, no zod
 * validation) and exposes a `toDomainForecastCashFlow` mapper to project
 * them into this shape at the boundary. Denormalized convenience fields
 * (customerId/invoiceId/promiseId/obligationId/label) are optional and
 * always reachable via evidenceRefs as the source of truth.
 */
export const forecastCashFlowSchema = z
  .object({
    id: idSchema,
    direction: forecastCashFlowDirectionSchema,
    kind: forecastCashFlowKindSchema,
    sourceId: idSchema.optional(),
    expectedDate: dateSchema,
    amount: nonNegativeMoneySchema,
    probability: confidenceScoreSchema,
    confidence: confidenceScoreSchema,
    customerId: idSchema.optional(),
    invoiceId: idSchema.optional(),
    promiseId: idSchema.optional(),
    obligationId: idSchema.optional(),
    label: z.string().trim().min(1).optional(),
    evidenceRefs: requiredEvidenceRefsSchema
  })
  .strict();

export const confidenceBandSchema = z
  .object({
    id: idSchema,
    label: z.string().trim().min(1),
    lowerBound: nonNegativeMoneySchema,
    upperBound: nonNegativeMoneySchema,
    confidenceLevel: confidenceScoreSchema
  })
  .strict()
  .refine((band) => band.lowerBound.currency === band.upperBound.currency, {
    message: "Confidence band bounds must use the same currency",
    path: ["upperBound", "currency"]
  })
  .refine((band) => band.upperBound.amountMinor >= band.lowerBound.amountMinor, {
    message: "Confidence band upper bound must be greater than or equal to lower bound",
    path: ["upperBound", "amountMinor"]
  });

export const obligationRiskSchema = z
  .object({
    obligationId: idSchema,
    dueDate: dateSchema,
    amount: nonNegativeMoneySchema,
    riskStatus: riskStatusSchema,
    coverageAmount: nonNegativeMoneySchema.optional(),
    shortfallAmount: nonNegativeMoneySchema.optional(),
    reason: z.string().trim().min(1),
    evidenceRefs: requiredEvidenceRefsSchema
  })
  .strict()
  .refine(
    (risk) => !risk.coverageAmount || risk.coverageAmount.currency === risk.amount.currency,
    {
      message: "Obligation risk coverage must use the obligation currency",
      path: ["coverageAmount", "currency"]
    }
  )
  .refine(
    (risk) => !risk.shortfallAmount || risk.shortfallAmount.currency === risk.amount.currency,
    {
      message: "Obligation risk shortfall must use the obligation currency",
      path: ["shortfallAmount", "currency"]
    }
  );

export const forecastScenarioSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1),
    riskStatus: riskStatusSchema,
    cashBalance: nonNegativeMoneySchema,
    shortfallAmount: nonNegativeMoneySchema.optional(),
    evidenceRefs: requiredEvidenceRefsSchema
  })
  .strict()
  .refine(
    (scenario) =>
      !scenario.shortfallAmount ||
      scenario.shortfallAmount.currency === scenario.cashBalance.currency,
    {
      message: "Scenario shortfall must use the cash balance currency",
      path: ["shortfallAmount", "currency"]
    }
  );

export const cashForecastSchema = z
  .object({
    forecastId: idSchema,
    companyId: idSchema,
    generatedAt: dateSchema,
    asOfDate: dateSchema,
    horizonDays: forecastHorizonDaysSchema,
    triggerEventIds: z.array(idSchema),
    cashBalance: nonNegativeMoneySchema,
    expectedInflows: z.array(forecastCashFlowSchema),
    confidenceWeightedInflows: z.array(forecastCashFlowSchema),
    expectedOutflows: z.array(forecastCashFlowSchema),
    riskStatus: riskStatusSchema,
    scenarios: z.array(forecastScenarioSchema),
    confidenceBands: z.array(confidenceBandSchema),
    shortfallAmount: nonNegativeMoneySchema.optional(),
    obligationRisks: z.array(obligationRiskSchema),
    evidenceRefs: requiredEvidenceRefsSchema
  })
  .strict()
  .refine(
    (forecast) =>
      !forecast.shortfallAmount ||
      forecast.shortfallAmount.currency === forecast.cashBalance.currency,
    {
      message: "Forecast shortfall must use the cash balance currency",
      path: ["shortfallAmount", "currency"]
    }
  );

export type RiskStatus = z.infer<typeof riskStatusSchema>;
export type ForecastHorizonDays = z.infer<typeof forecastHorizonDaysSchema>;
export type ForecastCashFlowKind = z.infer<typeof forecastCashFlowKindSchema>;
export type ForecastCashFlowDirection = z.infer<typeof forecastCashFlowDirectionSchema>;
export type ForecastCashFlow = z.infer<typeof forecastCashFlowSchema>;
export type ConfidenceBand = z.infer<typeof confidenceBandSchema>;
export type ObligationRisk = z.infer<typeof obligationRiskSchema>;
export type ForecastScenario = z.infer<typeof forecastScenarioSchema>;
export type CashForecast = z.infer<typeof cashForecastSchema>;
