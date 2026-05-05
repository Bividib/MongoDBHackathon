import { createHash } from "node:crypto";

import type { JsonValue } from "@runwayops/domain";

/**
 * Canonical JSON serialization: object keys sorted lexicographically,
 * arrays preserved in order. SourceObject dedup hashes are computed over
 * this canonical form so that two semantically-equal payloads produced by
 * different code paths (or provider SDK versions that reorder keys) hash
 * identically. The dedup index in `source_objects` keys on this hash.
 */
export function canonicalJsonStringify(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonicalJsonStringify: non-finite number");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonStringify).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalJsonStringify(value[key]!)}`,
  );
  return `{${parts.join(",")}}`;
}

/**
 * sha256 over the canonical JSON form. 64 hex chars — matches the schema's
 * `contentHash` constraint in the domain SourceObject schema.
 */
export function sha256OfJson(value: JsonValue): string {
  return createHash("sha256").update(canonicalJsonStringify(value)).digest("hex");
}
