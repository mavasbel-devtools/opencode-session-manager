import type { ResyncRoutePort } from "@session-manager/domain/ports/outbound/ResyncRoutePort"
import type { V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"

/**
 * OpenCode 2 outbound adapter: what the retry loop reads from the host — the
 * session the route shows, and whether the host's synced data holds a session
 * once the retries end.
 */
export class V2ResyncRouteAdapter implements ResyncRoutePort {
  constructor(private readonly context: V2TuiContext) {}

  routedSessionID(): string | undefined {
    const route = this.context.ui.router.current()
    return route.type === "session" ? route.sessionID : undefined
  }

  isLoaded(sessionID: string): boolean {
    return this.context.data.session.get(sessionID) !== undefined
  }
}
