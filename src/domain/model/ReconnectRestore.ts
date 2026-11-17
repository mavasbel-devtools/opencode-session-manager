import type { VerifyResult } from "@session-manager/domain/ports/outbound/SessionNavigatorPort";

/**
 * Pure trigger rule behind "restore session after reconnect": when the route
 * leaves an open session for home within WINDOW of a `server.connected` event
 * (either order — connected first, or connected up to WINDOW after home), the
 * session was not deleted, and fewer than RESTORE_LIMIT restores happened for
 * it in the last RESTORE_WINDOW_MS, the session is verified with
 * VERIFY_BACKOFF and navigated back to when it still exists.
 *
 * The async verify loop itself lives in the application use case, which feeds
 * each outcome back as `verified`. This module performs no I/O and reads no clock:
 * every input carries its own timestamp.
 */

/** The reconnect-adjacency window: route and `server.connected` belong together within 10 s. */
export const WINDOW = 10000;

/** Restores per session per RESTORE_WINDOW_MS before the guard goes quiet. */
export const RESTORE_LIMIT = 3;

/** The loop-guard window the restore count is measured over: 60 s. */
export const RESTORE_WINDOW_MS = 60000;

/** Delays before the verify attempts: five attempts, about 15.5 s in total. */
export const VERIFY_BACKOFF: [number, number, number, number, number] = [500, 1000, 2000, 4000, 8000];

/** A route sample read from `ui.router.current()`. */
export interface RouteSample {
  readonly type: string;
  readonly sessionID?: string;
}

/** What the guard remembers: the open session, the last reconnect, deletions and recent restores. */
export interface RestoreState {
  readonly lastSession: string | undefined;
  readonly lastConnected: number | undefined;
  readonly deleted: ReadonlySet<string>;
  readonly restoresBySession: ReadonlyArray<{ readonly sessionID: string; readonly at: number }>;
  readonly pendingHome?: { readonly sessionID: string; readonly at: number };
  readonly pendingVerify?: { readonly sessionID: string; readonly attempts: number };
}

/** Everything that can move the guard: route samples, reconnects, deletions and verify outcomes. */
export type RestoreInput =
  | { readonly kind: "route"; readonly route: RouteSample; readonly at: number }
  | { readonly kind: "connected"; readonly at: number }
  | { readonly kind: "deleted"; readonly sessionID: string }
  | { readonly kind: "verified"; readonly sessionID: string; readonly result: VerifyResult; readonly at: number };

/** What the guard asks for: nothing, a verify of the session, a navigate back, or giving up. */
export type RestoreAction = "none" | { readonly verify: string } | { readonly navigate: string } | { readonly giveUp: string };

interface Decision {
  readonly state: RestoreState;
  readonly action: RestoreAction;
}

/** The pure trigger: every input becomes new state plus at most one ask. */
export function decideRestore(state: RestoreState, input: RestoreInput): Decision {
  if (input.kind === "route") return decideRoute(state, input.route, input.at);
  if (input.kind === "connected") return decideConnected(state, input.at);
  if (input.kind === "deleted") return decideDeleted(state, input.sessionID);
  return decideVerified(state, input.sessionID, input.result, input.at);
}

function decideRoute(state: RestoreState, route: RouteSample, at: number): Decision {
  if (route.type === "home") return decideHome(state, at);
  return decideSessionRoute(state, route.sessionID);
}

function decideSessionRoute(state: RestoreState, sessionID: string | undefined): Decision {
  const settled: RestoreState = {
    lastSession: sessionID ?? state.lastSession,
    lastConnected: state.lastConnected,
    deleted: state.deleted,
    restoresBySession: state.restoresBySession,
  };
  return { state: settled, action: "none" };
}

function decideHome(state: RestoreState, at: number): Decision {
  const candidate = state.lastSession;
  const connected = state.lastConnected;
  const adjacent = candidate !== undefined && connected !== undefined && at - connected <= WINDOW;
  const removed = candidate !== undefined && state.deleted.has(candidate);
  const recent = candidate === undefined ? 0 : recentRestores(state, candidate, at);
  if (candidate !== undefined && adjacent && !removed && recent < RESTORE_LIMIT) return startVerify(state, candidate);
  const waiting: RestoreState = candidate === undefined ? state : { ...state, pendingHome: { sessionID: candidate, at } };
  return { state: waiting, action: "none" };
}

function decideConnected(state: RestoreState, at: number): Decision {
  const linked: RestoreState = { ...state, lastConnected: at };
  const waiting = state.pendingHome;
  if (waiting === undefined || state.pendingVerify !== undefined) return { state: linked, action: "none" };
  const adjacent = at - waiting.at <= WINDOW;
  const removed = state.deleted.has(waiting.sessionID);
  const recent = recentRestores(state, waiting.sessionID, at);
  if (adjacent && !removed && recent < RESTORE_LIMIT) return startVerify(linked, waiting.sessionID);
  return { state: linked, action: "none" };
}

function decideDeleted(state: RestoreState, sessionID: string): Decision {
  const deleted = new Set(state.deleted);
  deleted.add(sessionID);
  const kept: RestoreState = {
    lastSession: state.lastSession,
    lastConnected: state.lastConnected,
    deleted,
    restoresBySession: state.restoresBySession,
  };
  return { state: kept, action: "none" };
}

function decideVerified(state: RestoreState, sessionID: string, result: VerifyResult, at: number): Decision {
  const pending = state.pendingVerify;
  if (pending === undefined || pending.sessionID !== sessionID) return { state, action: "none" };
  if (result === "exists") {
    const { pendingVerify: _verified, ...kept } = state;
    return { state: { ...kept, restoresBySession: [...state.restoresBySession, { sessionID, at }] }, action: { navigate: sessionID } };
  }
  if (result === "missing") {
    const { pendingVerify: _missing, ...kept } = state;
    return { state: { ...kept }, action: "none" };
  }
  const attempts = pending.attempts + 1;
  if (attempts >= VERIFY_BACKOFF.length) {
    const { pendingVerify: _exhausted, ...kept } = state;
    return { state: { ...kept }, action: { giveUp: sessionID } };
  }
  return { state: { ...state, pendingVerify: { sessionID, attempts } }, action: { verify: sessionID } };
}

function startVerify(state: RestoreState, sessionID: string): Decision {
  const { pendingHome: _superseded, ...kept } = state;
  return { state: { ...kept, pendingVerify: { sessionID, attempts: 0 } }, action: { verify: sessionID } };
}

function recentRestores(state: RestoreState, sessionID: string, at: number): number {
  const since = at - RESTORE_WINDOW_MS;
  return state.restoresBySession.filter((entry) => entry.sessionID === sessionID && entry.at > since).length;
}
