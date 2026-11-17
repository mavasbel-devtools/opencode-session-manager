import type { RestoreNotice, SessionNavigatorPort, VerifyResult } from "@session-manager/domain/ports/outbound/SessionNavigatorPort";
import type { V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext";

/**
 * Whether a `data.session.sync` rejection means the session is gone: the
 * spike on the real 2.3.0 TUI recorded `name` and `_tag` both reading
 * "SessionNotFoundError" for a deleted session, while anything else rejects
 * differently.
 */
function isSessionNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const tagged = error as { readonly name?: unknown; readonly _tag?: unknown };
  return tagged.name === "SessionNotFoundError" || tagged._tag === "SessionNotFoundError";
}

/**
 * OpenCode 2 outbound adapter: verifies the session by re-syncing it (a
 * one-shot failure the TUI already consumed resolves, a deleted session
 * rejects as not found), navigates back through the host router, and shows
 * the restore notice through the host toast. Older host stubs omit the sync
 * or the router; the adapter skips what the host does not offer.
 */
export class V2SessionNavigatorAdapter implements SessionNavigatorPort {
  constructor(private readonly context: V2TuiContext) {}

  private get stillHome(): boolean {
    return this.context.ui.router.current?.().type === "home";
  }

  async verify(sessionID: string): Promise<VerifyResult> {
    try {
      await this.context.data.session.sync?.(sessionID);
    } catch (error: unknown) {
      return isSessionNotFound(error) ? "missing" : "failed";
    }
    return "exists";
  }

  open(sessionID: string): void {
    if (!this.stillHome) return;
    this.context.ui.router.navigate?.({ type: "session", sessionID });
  }

  notify(notice: RestoreNotice): void {
    if (!this.stillHome) return;
    this.context.ui.toast.show(notice);
  }
}
