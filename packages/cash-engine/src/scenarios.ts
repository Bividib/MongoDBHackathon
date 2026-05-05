import { assessForecastRisk } from "./risk.ts";
import { addMoney, subtractMoney, sumMoney } from "./money.ts";
import { classifyConfidence, resolvePolicy } from "./policy.ts";
import type {
  CashEnginePolicy,
  ForecastCashFlow,
  ForecastScenario,
  Money,
  RiskStatus
} from "./types.ts";

export function buildForecastScenarios(input: {
  asOfDate: Date | string;
  cashBalance: Money;
  expectedInflows: ForecastCashFlow[];
  confidenceWeightedInflows: ForecastCashFlow[];
  expectedOutflows: ForecastCashFlow[];
  policy?: Partial<CashEnginePolicy>;
}): ForecastScenario[] {
  const policy = resolvePolicy(input.policy);
  const expectedOutflows = sumMoney(input.expectedOutflows.map((flow) => flow.amount), input.cashBalance.currency);
  const conservativeInflows = sumMoney(
    input.expectedInflows.filter((flow) => classifyConfidence(flow.confidence, policy) === "high").map((flow) => flow.amount),
    input.cashBalance.currency
  );
  const baseInflows = sumMoney(input.confidenceWeightedInflows.map((flow) => flow.amount), input.cashBalance.currency);
  const optimisticInflows = sumMoney(input.expectedInflows.map((flow) => flow.amount), input.cashBalance.currency);

  return [
    buildScenario("conservative", input, conservativeInflows, expectedOutflows),
    buildScenario("base", input, baseInflows, expectedOutflows),
    buildScenario("optimistic", input, optimisticInflows, expectedOutflows)
  ];
}

function buildScenario(
  name: ForecastScenario["name"],
  input: {
    asOfDate: Date | string;
    cashBalance: Money;
    expectedInflows: ForecastCashFlow[];
    expectedOutflows: ForecastCashFlow[];
    policy?: Partial<CashEnginePolicy>;
  },
  expectedInflows: Money,
  expectedOutflows: Money
): ForecastScenario {
  const endingCash = subtractMoney(addMoney(input.cashBalance, expectedInflows), expectedOutflows);
  const risk = riskFromEndingCash(endingCash);
  const assessedRisk = assessForecastRisk({
    asOfDate: input.asOfDate,
    cashBalance: input.cashBalance,
    expectedInflows: scenarioInflows(name, input.expectedInflows),
    expectedOutflows: input.expectedOutflows,
    policy: input.policy
  });

  return {
    name,
    startingCash: input.cashBalance,
    expectedInflows,
    expectedOutflows,
    endingCash,
    riskStatus: maxScenarioRisk(risk, assessedRisk.riskStatus),
    shortfallAmount: assessedRisk.shortfallAmount
  };
}

function scenarioInflows(name: ForecastScenario["name"], inflows: ForecastCashFlow[]): ForecastCashFlow[] {
  if (name === "optimistic") return inflows;
  if (name === "base") return inflows.filter((flow) => flow.confidence > 0);
  return inflows.filter((flow) => flow.confidence >= 0.8);
}

function riskFromEndingCash(endingCash: Money): RiskStatus {
  return endingCash.amountMinor < 0n ? "high" : "safe";
}

function maxScenarioRisk(left: RiskStatus, right: RiskStatus): RiskStatus {
  const severity: Record<RiskStatus, number> = { safe: 0, watch: 1, high: 2, critical: 3 };
  return severity[left] >= severity[right] ? left : right;
}
