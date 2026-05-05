import { sql } from "drizzle-orm";
import {
  bigint as pgBigint,
  char,
  integer,
  jsonb,
  numeric,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { EvidenceKind, EvidenceRef as DomainEvidenceRef } from "@runwayops/domain";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/**
 * Wire-format evidence ref as stored in jsonb columns. Mirrors the domain
 * `EvidenceRef` shape but with `sourceTimestamp` serialized as ISO string
 * (because jsonb does not preserve Date objects). Repository mappers
 * project to/from the domain type at the boundary via the helpers below.
 */
export type EvidenceRef = {
  kind: EvidenceKind;
  id: string;
  summary?: string;
  sourceProvider?: string;
  sourceTimestamp?: string;
};

export function serializeEvidenceRef(ref: DomainEvidenceRef): EvidenceRef {
  const out: EvidenceRef = { kind: ref.kind, id: ref.id };
  if (ref.summary !== undefined) out.summary = ref.summary;
  if (ref.sourceProvider !== undefined) out.sourceProvider = ref.sourceProvider;
  if (ref.sourceTimestamp !== undefined)
    out.sourceTimestamp = ref.sourceTimestamp.toISOString();
  return out;
}

export function serializeEvidenceRefs(refs: readonly DomainEvidenceRef[]): EvidenceRef[] {
  return refs.map(serializeEvidenceRef);
}

export function deserializeEvidenceRef(ref: EvidenceRef): DomainEvidenceRef {
  const out: DomainEvidenceRef = { kind: ref.kind, id: ref.id };
  if (ref.summary !== undefined) out.summary = ref.summary;
  if (ref.sourceProvider !== undefined) out.sourceProvider = ref.sourceProvider;
  if (ref.sourceTimestamp !== undefined) out.sourceTimestamp = new Date(ref.sourceTimestamp);
  return out;
}

export function deserializeEvidenceRefs(refs: readonly EvidenceRef[]): DomainEvidenceRef[] {
  return refs.map(deserializeEvidenceRef);
}

export const id = () => uuid("id").primaryKey().defaultRandom();

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const deletedAt = () => timestamp("deleted_at", { withTimezone: true });

export const currency = (name = "currency") => char(name, { length: 3 }).notNull();

export const moneyMinor = (name: string) => pgBigint(name, { mode: "bigint" }).notNull();

export const nullableMoneyMinor = (name: string) => pgBigint(name, { mode: "bigint" });

export const confidence = (name: string) => numeric(name, { precision: 5, scale: 4 }).notNull();

export const priorityScore = (name: string) =>
  numeric(name, { precision: 12, scale: 4 }).notNull();

export const jsonObject = (name: string) =>
  jsonb(name).$type<JsonObject>().notNull().default(sql`'{}'::jsonb`);

export const nullableJsonObject = (name: string) => jsonb(name).$type<JsonObject>();

export const jsonValue = (name: string) => jsonb(name).$type<JsonValue>().notNull();

export const evidenceRefs = (name = "evidence_refs") =>
  jsonb(name).$type<EvidenceRef[]>().notNull().default(sql`'[]'::jsonb`);

export const positiveInteger = (name: string) => integer(name).notNull();
