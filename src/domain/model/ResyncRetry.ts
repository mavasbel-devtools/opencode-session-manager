/**
 * Pure policy behind "retry the re-sync after a reconnect": which rejection is
 * worth another attempt, and how long each wait lasts.
 *
 * The host rejects a re-sync with `{ name, message, cause }` or with
 * `{ name, message, causes: [...] }` — note the plural array — and sometimes
 * carries the HTTP status only in `cause`, or only inside an
 * `UnexpectedStatus: 503` message. This module reads all three, walks the cause
 * chain to depth 5 and performs no I/O.
 */

/** Delays before each retry: five waits, six attempts, about 15.5 s in total. */
export const RESYNC_BACKOFF: readonly [number, number, number, number, number] = Object.freeze([
  500, 1000, 2000, 4000, 8000,
] as const);

/** Lowercase transport fragments the host puts in `message` or `code`; any one makes the failure transient. */
export const RESYNC_TRANSIENT_MESSAGES: readonly string[] = Object.freeze([
  "load failed",
  "network connection was lost",
  "network request failed",
  "failed to fetch",
  "econnreset",
  "econnrefused",
  "epipe",
  "etimedout",
  "socket hang up",
]);

/** One re-sync the session screen asks for: the session and whether its children come too. */
export interface ResyncRequest {
  readonly sessionID: string;
  readonly children: boolean;
}

/** The policy's verdict: the session is gone, the failure is worth retrying, or neither. */
export type ResyncFailure = "missing" | "transient" | "other";

/** The deepest cause level read: a code at depth 6 says nothing about the failure. */
const MAX_CAUSE_DEPTH = 5;

/** The status of a session that no longer exists. */
const MISSING_STATUS = 404;

/** The one HTTP status worth retrying: a gateway that is briefly away. */
const TRANSIENT_STATUS = 503;

/** `UnexpectedStatus: 503`, in the casing the host emits. */
const UNEXPECTED_STATUS = /unexpectedstatus:\s*(\d+)/i;

/** The tag the host uses for a deleted session, on `name` and on `_tag`. */
const SESSION_NOT_FOUND = "SessionNotFoundError";

/** Whether the rejection says the session no longer exists. */
export function isSessionNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const tagged = error as { readonly name?: unknown; readonly _tag?: unknown };
  return tagged.name === SESSION_NOT_FOUND || tagged._tag === SESSION_NOT_FOUND;
}

/** The HTTP status behind a rejection: `status`, then `cause.status`, then an `UnexpectedStatus` message. */
export function httpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const shaped = error as { readonly status?: unknown; readonly cause?: unknown; readonly message?: unknown };
  const direct = asStatus(shaped.status);
  if (direct !== undefined) return direct;
  if (typeof shaped.cause === "object" && shaped.cause !== null) {
    const caused = asStatus((shaped.cause as { readonly status?: unknown }).status);
    if (caused !== undefined) return caused;
  }
  if (typeof shaped.message === "string") {
    const matched = UNEXPECTED_STATUS.exec(shaped.message);
    const digits = matched?.[1];
    if (digits !== undefined) return Number(digits);
  }
  return undefined;
}

/** Classifies one re-sync rejection: `missing` is final, `transient` is retried, everything else is final. */
export function classifyResyncError(error: unknown): ResyncFailure {
  if (isSessionNotFound(error)) return "missing";
  const status = httpStatus(error);
  if (status === MISSING_STATUS) return "missing";
  if (status === TRANSIENT_STATUS) return "transient";
  return hasTransientCause(error, 0) ? "transient" : "other";
}

function asStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

/** Walks one level of the chain, then its `cause` and every element of its `causes`. */
function hasTransientCause(error: unknown, depth: number): boolean {
  if (depth > MAX_CAUSE_DEPTH) return false;
  if (typeof error !== "object" || error === null) return false;
  const level = error as { readonly message?: unknown; readonly code?: unknown; readonly cause?: unknown; readonly causes?: unknown };
  if (isTransientText(level.message) || isTransientText(level.code)) return true;
  if (hasTransientCause(level.cause, depth + 1)) return true;
  if (Array.isArray(level.causes)) {
    for (const cause of level.causes) if (hasTransientCause(cause, depth + 1)) return true;
  }
  return false;
}

function isTransientText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const lowered = value.toLowerCase();
  return RESYNC_TRANSIENT_MESSAGES.some((fragment) => lowered.includes(fragment));
}
