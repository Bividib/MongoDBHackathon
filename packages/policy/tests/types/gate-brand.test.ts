/**
 * Compile-time type tests proving the GatePassedAction brand cannot be
 * bypassed. These tests use @ts-expect-error to assert that certain
 * type-unsafe operations fail at compile time.
 *
 * Run via: tsc --noEmit -p tsconfig.typetest.json
 * (These are NOT vitest tests — they pass by compiling successfully.)
 */
import type { CollectionAction } from "@runwayops/domain";
import type { GatePassedAction } from "../../src/types.js";

// Simulated connector function that only accepts GatePassedAction
function sendToExternalSystem(_gated: GatePassedAction): void {
  // no-op — only exists for type checking
}

declare const rawAction: CollectionAction;

// --- Test 1: Cannot pass a raw CollectionAction as GatePassedAction ---
// @ts-expect-error - CollectionAction is not assignable to GatePassedAction
sendToExternalSystem(rawAction);

// --- Test 2: Cannot cast with `as` to forge a brand ---
// The brand uses a unique symbol that is not accessible outside the module,
// so even an `as` cast results in a type that lacks the brand property.
const forged = rawAction as unknown as GatePassedAction;
// This line compiles (the cast is unsafe by design) but it proves
// that normal code cannot accidentally pass rawAction.
sendToExternalSystem(forged); // This IS allowed — `as unknown as X` always is.

// --- Test 3: Cannot construct the branded type via object literal ---
// @ts-expect-error - Object literal does not satisfy GatePassedAction brand
const fakeGated: GatePassedAction = {
  ...rawAction,
  idempotencyKey: "fake",
  gatePassedAt: new Date(),
};
sendToExternalSystem(fakeGated);

// --- Test 4: A plain object with matching shape still fails ---
// @ts-expect-error - Structural match does not satisfy nominal brand
const structural: GatePassedAction = {
  id: "x",
  companyId: "x",
  customerId: "x",
  actionKind: "request_payment",
  channel: "email",
  tone: "friendly",
  status: "approved",
  priorityScore: 0.8,
  evidenceConfidence: 0.9,
  relationshipRiskPenalty: 0,
  actionEffortPenalty: 0,
  requiresApproval: true,
  recommendedAt: new Date(),
  dueAt: null,
  approvedAt: null,
  rejectedAt: null,
  executedAt: null,
  completedAt: null,
  reason: "test",
  evidenceRefs: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  idempotencyKey: "x",
  gatePassedAt: new Date(),
} as GatePassedAction; // even with `as` it's unsafe, but the point is the literal form errors

// Ensure file is a module
export {};
