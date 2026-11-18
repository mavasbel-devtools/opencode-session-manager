import { RESYNC_BACKOFF, classifyResyncError, type ResyncRequest } from "@session-manager/domain/model/ResyncRetry"
import type { RetryResyncPort } from "@session-manager/domain/ports/inbound/RetryResyncPort"
import type { ResyncRoutePort } from "@session-manager/domain/ports/outbound/ResyncRoutePort"
import type { TimerPort } from "@session-manager/domain/ports/outbound/TimerPort"

/** One first call plus one per backoff wait: six attempts over five waits. */
const RESYNC_ATTEMPTS = RESYNC_BACKOFF.length + 1

/**
 * Retries the re-sync the session screen makes after a reconnect. Only that one
 * call is eligible — `children: true` while the route shows the same session;
 * every other call goes straight to the host. An eligible call is attempted up
 * to six times over RESYNC_BACKOFF, and only a transient failure is retried: a
 * missing session, any other error, or a route that left the session rethrows
 * the original error at once, and when the attempts run out the call resolves
 * if the host ended up holding the session, otherwise it rethrows the last
 * error so the stock behaviour stands.
 */
export class RetryResyncUseCase implements RetryResyncPort {
  constructor(
    private readonly route: ResyncRoutePort,
    private readonly timer: TimerPort,
  ) {}

  async sync(request: ResyncRequest, attempt: () => Promise<void>): Promise<void> {
    if (!this.eligible(request)) return attempt()
    let last: unknown
    for (let index = 0; index < RESYNC_ATTEMPTS; index += 1) {
      try {
        await attempt()
        return
      } catch (error: unknown) {
        last = error
        if (this.route.routedSessionID() !== request.sessionID) throw error
        if (classifyResyncError(error) !== "transient") throw error
        if (index === RESYNC_ATTEMPTS - 1) break
        await this.timer.sleep(RESYNC_BACKOFF[index]!)
        if (this.route.routedSessionID() !== request.sessionID) throw error
      }
    }
    if (this.route.isLoaded(request.sessionID)) return
    throw last
  }

  private eligible(request: ResyncRequest): boolean {
    return request.children && this.route.routedSessionID() === request.sessionID
  }
}
