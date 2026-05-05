/**
 * Typed error envelope used by all command handlers.
 */
export type TypedError = {
  code: string;
  message: string;
  statusCode: number;
};

export type CommandResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: TypedError };

export function ok<T>(data: T): CommandResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  code: string,
  message: string,
  statusCode: number,
): CommandResult<T> {
  return { ok: false, error: { code, message, statusCode } };
}

export function notFound(entity: string, id: string): CommandResult<never> {
  return fail("NOT_FOUND", `${entity} ${id} not found`, 404);
}

export function forbidden(reason: string): CommandResult<never> {
  return fail("FORBIDDEN", reason, 403);
}

export function conflict(reason: string): CommandResult<never> {
  return fail("CONFLICT", reason, 409);
}

export function badRequest(reason: string): CommandResult<never> {
  return fail("BAD_REQUEST", reason, 400);
}
