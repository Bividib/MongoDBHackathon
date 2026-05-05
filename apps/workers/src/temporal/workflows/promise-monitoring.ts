import { condition, setHandler, sleep } from "@temporalio/workflow";

import {
  bankTransactionPostedSignal,
  paymentReceivedSignal,
  promiseDueDateChangedSignal,
  promiseSupersededSignal,
  promiseVoidedSignal
} from "../signals.js";
import type {
  BankTransactionPostedPayload,
  PaymentReceivedPayload,
  PromiseDueDateChangedPayload,
  PromiseSupersededPayload,
  PromiseVoidedPayload
} from "../signal-types.js";
import { getPromiseStateQuery } from "../queries.js";
import type { PromiseState, WorkflowPhase } from "../query-types.js";

import { acts } from "./activity-proxies.js";

export interface PromiseMonitoringInput {
  companyId: string;
  promiseId: string;
}

export interface PromiseMonitoringResult {
  cycleKey: string;
  promiseId: string;
  outcome: "kept" | "partially_kept" | "late" | "broken" | "superseded" | "voided";
  followUpEventId?: string | undefined;
}

export async function PromiseMonitoringWorkflow(
  input: PromiseMonitoringInput
): Promise<PromiseMonitoringResult> {
  const cycleKey = `promise:${input.promiseId}`;
  let phase: WorkflowPhase = "initializing";
  let wakeRound = 0;
  let scheduledWakeIso: string | undefined;
  let superseded: PromiseSupersededPayload | undefined;
  let voided: PromiseVoidedPayload | undefined;
  let dueDateChange: PromiseDueDateChangedPayload | undefined;
  let earlyPayment: PaymentReceivedPayload | BankTransactionPostedPayload | undefined;

  setHandler(getPromiseStateQuery, (): PromiseState => ({
    cycleKey,
    promiseId: input.promiseId,
    phase,
    scheduledWakeIso,
    wakeRound
  }));

  setHandler(promiseSupersededSignal, (payload) => {
    superseded = payload;
  });
  setHandler(promiseVoidedSignal, (payload) => {
    voided = payload;
  });
  setHandler(promiseDueDateChangedSignal, (payload) => {
    dueDateChange = payload;
  });
  setHandler(paymentReceivedSignal, (payload) => {
    earlyPayment = payload;
  });
  setHandler(bankTransactionPostedSignal, (payload) => {
    earlyPayment = payload;
  });

  // 1. load promise
  phase = "loading";
  let promise = await acts.loadPromise({
    companyId: input.companyId,
    promiseId: input.promiseId
  });
  scheduledWakeIso = promise.graceUntilIso;

  // 2. durable wait until grace deadline, woken early by signals.
  // Re-arm if `promise_due_date_changed` arrives.
  while (true) {
    phase = "awaiting_signal";
    const sleepMs = computeSleepMs(promise.graceUntilIso);
    if (sleepMs > 0) {
      await Promise.race([
        sleep(sleepMs),
        condition(
          () =>
            superseded !== undefined ||
            voided !== undefined ||
            earlyPayment !== undefined ||
            dueDateChange !== undefined
        )
      ]);
    }

    if (dueDateChange !== undefined) {
      // Re-arm against the new due date and continue.
      promise = {
        ...promise,
        promisedDateIso: dueDateChange.newDueDateIso,
        graceUntilIso: dueDateChange.newDueDateIso
      };
      scheduledWakeIso = promise.graceUntilIso;
      dueDateChange = undefined;
      wakeRound += 1;
      continue;
    }

    break;
  }

  // 3. terminal lifecycle signals
  if (voided !== undefined) {
    await acts.writeMemoryAndAudit({
      companyId: input.companyId,
      idempotencyKey: `${cycleKey}:audit:voided`,
      action: "promise.voided",
      targetKind: "promise_to_pay",
      targetId: input.promiseId,
      summary: `Promise voided: ${voided.reason}`
    });
    return { cycleKey, promiseId: input.promiseId, outcome: "voided" };
  }
  if (superseded !== undefined) {
    await acts.writeMemoryAndAudit({
      companyId: input.companyId,
      idempotencyKey: `${cycleKey}:audit:superseded`,
      action: "promise.superseded",
      targetKind: "promise_to_pay",
      targetId: input.promiseId,
      summary: `Promise superseded by ${superseded.newPromiseId}`
    });
    return { cycleKey, promiseId: input.promiseId, outcome: "superseded" };
  }

  // 4. classify outcome
  phase = "computing";
  const round = wakeRound + 1;
  const match = await acts.checkPaymentMatch({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:match:${round}`,
    promiseId: input.promiseId
  });
  const outcome = await acts.classifyPromiseOutcome({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:outcome:${round}`,
    promiseId: input.promiseId,
    match
  });

  // 5. update reliability + forecast
  await acts.updateCustomerReliability({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:reliability:${round}`,
    customerId: promise.customerId,
    promiseId: input.promiseId,
    outcome
  });
  await acts.recomputeCashForecast({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:forecast:${round}`,
    asOfDate: promise.graceUntilIso.slice(0, 10),
    horizonDays: 30,
    triggerEventIds: [`promise:${input.promiseId}`]
  });

  // 6. escalation if broken
  let followUpEventId: string | undefined;
  if (outcome.outcome === "broken" || outcome.outcome === "partially_kept") {
    phase = "executing";
    const escalation = await acts.emitDomainEvent({
      companyId: input.companyId,
      idempotencyKey: `${cycleKey}:escalation:${round}`,
      type: "obligation.due_soon",
      aggregateKind: "obligation",
      aggregateId: input.promiseId,
      payload: {
        reason: "broken_promise",
        promiseId: input.promiseId,
        shortfallMinor: outcome.shortfallMinor ?? 0,
        currency: outcome.currency ?? promise.currency ?? "GBP"
      }
    });
    followUpEventId = escalation.eventId;
  }

  // 7. final audit
  phase = "closing";
  await acts.writeMemoryAndAudit({
    companyId: input.companyId,
    idempotencyKey: `${cycleKey}:audit:complete:${round}`,
    action: "promise.outcome_classified",
    targetKind: "promise_to_pay",
    targetId: input.promiseId,
    summary: `Promise outcome: ${outcome.outcome}`
  });

  phase = "completed";
  return {
    cycleKey,
    promiseId: input.promiseId,
    outcome: outcome.outcome,
    followUpEventId
  };
}

function computeSleepMs(graceUntilIso: string): number {
  // Workflow code cannot call Date.now(); we derive the wake time as a
  // fixed offset from the workflow start when available. For the scaffold,
  // the orchestrator passes a graceUntilIso that is *relative* to the
  // workflow start time and is converted to a number-of-ms value here. In
  // production the activity returning the promise will already provide a
  // millisecond delta; for now we keep this conservative by using a
  // bounded constant.
  //
  // We avoid `new Date(graceUntilIso).getTime() - Date.now()` precisely
  // because it would sample a wall clock inside workflow code.
  if (graceUntilIso.length === 0) return 0;
  return 24 * 60 * 60 * 1000;
}
