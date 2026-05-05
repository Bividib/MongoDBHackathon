import { compareDateAsc, daysUntil, isOnOrBefore } from "./dates.ts";
import {
  addMoney,
  clampMoneyToZero,
  compareMoney,
  maxMoney,
  subtractMoney,
  sumMoney,
  zeroMoney
} from "./money.ts";
import { classifyConfidence, resolvePolicy } from "./policy.ts";
import type {
  CashEnginePolicy,
  EvidenceRef,
  ForecastCashFlow,
  Money,
  ObligationRisk,
  RiskStatus
} from "./types.ts";

export type AssessRiskInput = {
  asOfDate: Date | string;
  cashBalance: Money;
  expectedInflows: ForecastCashFlow[];
  expectedOutflows: ForecastCashFlow[];
  policy?: Partial<CashEnginePolicy> | undefined;
};

export type RiskAssessment = {
  riskStatus: RiskStatus;
  shortfallAmount?: Money | undefined;
  obligationRisks: ObligationRisk[];
};

const RISK_SEVERITY: Record<RiskStatus, number> = {
  safe: 0,
  watch: 1,
  high: 2,
  critical: 3
};

export function maxRiskStatus(statuses: RiskStatus[]): RiskStatus {
  return statuses.reduce<RiskStatus>((current, next) => (RISK_SEVERITY[next] > RISK_SEVERITY[current] ? next : current), "safe");
}

export function assessForecastRisk(input: AssessRiskInput): RiskAssessment {
  const policy = resolvePolicy(input.policy);
  const obligationOutflows = input.expectedOutflows
    .filter((flow) => flow.kind === "critical_obligation" || flow.kind === "supplier_bill")
    .sort((left, right) => compareDateAsc(left.date, right.date) || left.id.localeCompare(right.id));

  if (obligationOutflows.length === 0) {
    return { riskStatus: "safe", obligationRisks: [] };
  }

  const obligationRisks = obligationOutflows.map((obligation) =>
    assessObligationCoverage({
      asOfDate: input.asOfDate,
      obligation,
      cashBalance: input.cashBalance,
      expectedInflows: input.expectedInflows,
      expectedOutflows: obligationOutflows,
      policy
    })
  );

  const inWindowRisks = obligationRisks.filter((risk) => daysUntil(input.asOfDate, risk.dueDate) <= policy.watchObligationWindowDays);
  const consideredRisks = inWindowRisks.length > 0 ? inWindowRisks : obligationRisks;
  const riskStatus = maxRiskStatus(consideredRisks.map((risk) => risk.riskStatus));
  const shortfallAmount = largestShortfall(consideredRisks.map((risk) => risk.shortfallAmount).filter((amount): amount is Money => Boolean(amount)));

  return {
    riskStatus,
    shortfallAmount,
    obligationRisks
  };
}

function assessObligationCoverage(input: {
  asOfDate: Date | string;
  obligation: ForecastCashFlow;
  cashBalance: Money;
  expectedInflows: ForecastCashFlow[];
  expectedOutflows: ForecastCashFlow[];
  policy: CashEnginePolicy;
}): ObligationRisk {
  const outflowsDueByDate = input.expectedOutflows.filter((flow) => isOnOrBefore(flow.date, input.obligation.date));
  const cumulativeOutflow = sumMoney(outflowsDueByDate.map((flow) => flow.amount), input.cashBalance.currency);
  const inflowsDueByDate = input.expectedInflows.filter((flow) => isOnOrBefore(flow.date, input.obligation.date));
  const highInflows = inflowsDueByDate.filter((flow) => classifyConfidence(flow.confidence, input.policy) === "high");
  const mediumInflows = inflowsDueByDate.filter((flow) => classifyConfidence(flow.confidence, input.policy) === "medium");

  const actualBalanceAfterOutflows = subtractMoney(input.cashBalance, cumulativeOutflow);
  if (compareMoney(actualBalanceAfterOutflows, zeroMoney(input.cashBalance.currency)) >= 0) {
    return obligationRisk(input, "safe", "covered_by_actual", undefined, []);
  }

  const highAvailable = addMoney(input.cashBalance, sumMoney(highInflows.map((flow) => flow.amount), input.cashBalance.currency));
  const highBalanceAfterOutflows = subtractMoney(highAvailable, cumulativeOutflow);
  if (compareMoney(highBalanceAfterOutflows, zeroMoney(input.cashBalance.currency)) >= 0) {
    return obligationRisk(input, "safe", "covered_by_high_confidence", undefined, highInflows);
  }

  const mediumAvailable = addMoney(highAvailable, sumMoney(mediumInflows.map((flow) => flow.amount), input.cashBalance.currency));
  const mediumBalanceAfterOutflows = subtractMoney(mediumAvailable, cumulativeOutflow);
  if (compareMoney(mediumBalanceAfterOutflows, zeroMoney(input.cashBalance.currency)) >= 0) {
    return obligationRisk(input, "watch", "dependent_on_medium_confidence", undefined, [...highInflows, ...mediumInflows]);
  }

  const allAvailable = addMoney(input.cashBalance, sumMoney(inflowsDueByDate.map((flow) => flow.amount), input.cashBalance.currency));
  const allBalanceAfterOutflows = subtractMoney(allAvailable, cumulativeOutflow);
  const mediumShortfallAmount = clampMoneyToZero(subtractMoney(zeroMoney(input.cashBalance.currency), mediumBalanceAfterOutflows));
  const allShortfallAmount = clampMoneyToZero(subtractMoney(zeroMoney(input.cashBalance.currency), allBalanceAfterOutflows));
  const daysToObligation = daysUntil(input.asOfDate, input.obligation.date);

  if (compareMoney(allBalanceAfterOutflows, zeroMoney(input.cashBalance.currency)) >= 0 && daysToObligation > input.policy.immediateInterventionWindowDays) {
    return obligationRisk(input, "high", "shortfall_actionable", mediumShortfallAmount, inflowsDueByDate);
  }

  const status = daysToObligation <= input.policy.immediateInterventionWindowDays ? "critical" : "high";
  const coverageStatus = status === "critical" ? "shortfall_unavoidable" : "shortfall_actionable";
  const shortfallAmount = allShortfallAmount.amountMinor > 0n ? allShortfallAmount : mediumShortfallAmount;
  return obligationRisk(input, status, coverageStatus, shortfallAmount, inflowsDueByDate);
}

function obligationRisk(
  input: {
    obligation: ForecastCashFlow;
    expectedOutflows: ForecastCashFlow[];
  },
  riskStatus: RiskStatus,
  coverageStatus: ObligationRisk["coverageStatus"],
  shortfallAmount: Money | undefined,
  dependentInflows: ForecastCashFlow[]
): ObligationRisk {
  return {
    obligationId: input.obligation.obligationId ?? input.obligation.sourceId,
    dueDate: input.obligation.date,
    amount: input.obligation.amount,
    riskStatus,
    coverageStatus,
    shortfallAmount,
    dependentInflowIds: dependentInflows.map((flow) => flow.id),
    evidenceRefs: [...input.obligation.evidenceRefs, ...evidenceRefsFromFlows(dependentInflows)]
  };
}

function evidenceRefsFromFlows(flows: ForecastCashFlow[]): EvidenceRef[] {
  return flows.flatMap((flow) => flow.evidenceRefs);
}

function largestShortfall(shortfalls: Money[]): Money | undefined {
  if (shortfalls.length === 0) return undefined;
  return shortfalls.reduce((largest, current) => maxMoney(largest, current));
}
