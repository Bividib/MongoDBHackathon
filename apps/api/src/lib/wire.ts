/**
 * HTTP wire serialization helpers.
 *
 * The domain types use bigint for `Money.amountMinor` (precision-safe
 * arithmetic), but JSON.stringify throws TypeError on bigint. The DB
 * layer already serializes Money for storage in jsonb columns; this
 * module mirrors that for the HTTP response boundary.
 *
 * Strategy: a global `preSerialization` Fastify hook walks the response
 * payload depth-first and converts every bigint to a string. JSON
 * serialization then proceeds normally.
 *
 * Date instances are also handled: Fastify's default serializer would
 * call `JSON.stringify` which calls `Date#toJSON` → ISO string, which is
 * fine. We intentionally do NOT touch dates here — only bigint, which
 * is the unsafe case.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Recursively walk `value` and replace every bigint with its decimal
 * string. Returns a new structure — does not mutate the input.
 */
export function bigintToWire(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(bigintToWire);
  }
  // Preserve Date, Buffer, etc. by leaving non-plain objects alone.
  // Plain objects get a fresh container with each key recursed.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = bigintToWire(child);
  }
  return out;
}

/**
 * Register a global preSerialization hook that converts every bigint in
 * the response payload to a decimal string. Apply BEFORE route plugins
 * so it covers every handler.
 */
export function registerWireSerializer(app: FastifyInstance): void {
  app.addHook(
    "preSerialization",
    async (_req: FastifyRequest, _reply: FastifyReply, payload: unknown) => {
      return bigintToWire(payload);
    },
  );
}
