import {
  HarbourLabsBankEvent,
  NorthstarReplyEvent,
  invokeRunwayOpsGraph,
  summarizeWritePlan,
  type WritePlanItem,
} from "./runwayops-graph.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function countCollection(writePlan: WritePlanItem[], collection: WritePlanItem["collection"]) {
  return writePlan.filter((item) => item.collection === collection).length;
}

const northstar = await invokeRunwayOpsGraph(NorthstarReplyEvent);
const northstarSummary = summarizeWritePlan(northstar.writePlan);

assert(northstar.classification === "conditional_promise", "Northstar reply should be conditional_promise");
assert(northstar.classificationConfidence === 0.48, "Northstar confidence should be 0.48");
assert(northstar.riskLevel === "HIGH", "Northstar reply should keep risk HIGH");
assert(northstar.forecastVersion === 2, "Northstar reply should create forecast v2");
assert(northstar.paymentPlanVersion === 2, "Northstar reply should create payment plan v2");
assert(countCollection(northstar.writePlan, "retrieval_attempts") === 1, "Northstar reply should write retrieval_attempts");
assert(countCollection(northstar.writePlan, "agent_runs") === 6, "Northstar reply should write six agent_runs");

const harbour = await invokeRunwayOpsGraph(HarbourLabsBankEvent);
const harbourSummary = summarizeWritePlan(harbour.writePlan);

assert(harbour.riskLevel === "WATCH", "Harbour Labs bank event should move risk to WATCH");
assert(harbour.forecastVersion === 3, "Harbour Labs bank event should create forecast v3");
assert(harbour.paymentPlanVersion === 3, "Harbour Labs bank event should create payment plan v3");
assert(countCollection(harbour.writePlan, "cashflow_forecasts") === 1, "Harbour Labs should write cashflow_forecasts");
assert(countCollection(harbour.writePlan, "payment_run_plans") === 1, "Harbour Labs should write payment_run_plans");
assert(countCollection(harbour.writePlan, "agent_runs") === 6, "Harbour Labs should write six agent_runs");

console.log("LangGraph spike assertions passed");
console.log("northstar=", JSON.stringify(northstarSummary));
console.log("harbour=", JSON.stringify(harbourSummary));
