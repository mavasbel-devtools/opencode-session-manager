import type { RetryResyncPort } from "@session-manager/domain/ports/inbound/RetryResyncPort"
import type { V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"

/** The one wrapper per host runtime, kept on the session store under a symbol so a re-setup finds it. */
const SLOT = Symbol.for("opencode-session-manager.resync-retry")

type Sync = (sessionID: string, options?: { readonly children?: boolean }) => Promise<void>

/** What the slot holds: the port the wrapper calls now, and the wrapper itself. */
interface ResyncRetrySlot {
  port: RetryResyncPort
  readonly wrapper: Sync
}

/**
 * What every path returns. A reconciliation re-runs cleanup and setup
 * milliseconds after a reconnect, and unwrapping here would open a gap during
 * an in-flight retry, so the wrapper stays installed and the next setup
 * re-points it: there is nothing to undo.
 */
const KEEP_INSTALLED = (): undefined => undefined

/**
 * OpenCode 2 inbound adapter: wraps `data.session.sync` so the session screen's
 * post-reconnect re-sync goes through the retry, and every other call passes
 * through untouched. The plugin re-runs setup after a reconnect, so the wrapper
 * is installed once, kept on the session store under a symbol, and re-pointed
 * at the newest port; a host without a writable `sync` gets nothing installed
 * and no throw.
 */
export class ResyncRetryV2Adapter {
  constructor(private readonly port: RetryResyncPort) {}

  register(context: V2TuiContext): () => void {
    const session = context.data?.session
    if (session === undefined) return KEEP_INSTALLED
    const original = session.sync
    if (typeof original !== "function") return KEEP_INSTALLED
    const descriptor = Object.getOwnPropertyDescriptor(session, "sync")
    if (descriptor !== undefined && descriptor.writable !== true && typeof descriptor.set !== "function") return KEEP_INSTALLED

    const installed: ResyncRetrySlot | undefined = Object.getOwnPropertyDescriptor(session, SLOT)?.value
    if (installed !== undefined) {
      installed.port = this.port
      return KEEP_INSTALLED
    }

    const slot: ResyncRetrySlot = {
      port: this.port,
      wrapper: function (this: unknown, sessionID, options) {
        return slot.port.sync({ sessionID, children: options?.children === true }, () => original.call(this, sessionID, options))
      },
    }
    session.sync = slot.wrapper
    Object.defineProperty(session, SLOT, { value: slot, writable: true, configurable: true, enumerable: false })
    return KEEP_INSTALLED
  }
}
