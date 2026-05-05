import { describe, expect, it } from "vitest";
import { MockModelRouter } from "../src/mock-adapter.js";
import {
  draftingFixtures,
  promiseExtractionFixtures,
  replyClassificationFixtures,
} from "../src/evals/index.js";

const router = new MockModelRouter();

describe("AI eval fixtures", () => {
  it.each(replyClassificationFixtures)("classifies reply fixture $id", async (fixture) => {
    const result = await router.classifyReply(fixture.input);

    expect(result.classification).toBe(fixture.expected_classification);
    for (const flag of fixture.expected_safety_flags ?? []) {
      expect(result.safety_flags).toContain(flag);
    }
    expect(result.requires_approval).toBe(true);
    expect(result.evidence_refs.map((ref) => ref.id)).toEqual([fixture.input.evidence_refs[0]?.id]);
  });

  it.each(promiseExtractionFixtures)("extracts promise fixture $id", async (fixture) => {
    const result = await router.extractPromise(fixture.input);

    expect(result.has_promise).toBe(fixture.expected_has_promise);
    expect(result.promise_type).toBe(fixture.expected_promise_type);
    expect(result.promised_date).toBe(fixture.expected_date ?? null);
    expect(result.amount_promised_minor).toBe(fixture.expected_amount_minor ?? null);
    for (const flag of fixture.expected_safety_flags ?? []) {
      expect(result.safety_flags).toContain(flag);
    }
  });

  it.each(draftingFixtures)("drafts safely for fixture $id", async (fixture) => {
    const result = await router.draftMessage(fixture.input);

    expect(result.requires_approval).toBe(true);
    for (const phrase of fixture.forbidden_phrases) {
      expect(result.body.toLowerCase()).not.toContain(phrase);
    }
    for (const flag of fixture.expected_safety_flags ?? []) {
      expect(result.safety_flags).toContain(flag);
    }
  });
});
