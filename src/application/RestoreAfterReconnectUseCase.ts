import { VERIFY_BACKOFF, decideRestore, type RestoreState, type RouteSample } from "@session-manager/domain/model/ReconnectRestore";
import type { RestoreAfterReconnectPort } from "@session-manager/domain/ports/inbound/RestoreAfterReconnectPort";
import type { SessionNavigatorPort, VerifyResult } from "@session-manager/domain/ports/outbound/SessionNavigatorPort";
import type { TimerPort } from "@session-manager/domain/ports/outbound/TimerPort";

/**
 * Restores the open session after a reconnect home-reset. The pure trigger
 * rule lives in the domain; this use case owns the async loop: on a verify
 * ask it waits out each VERIFY_BACKOFF delay through the timing port, then
 * checks the session still exists while the route is still home. `exists`
 * navigates back with a toast, `missing` stays quiet, and five `failed`
 * outcomes leave one info notice. A route out of home aborts the loop, and
 * dispose releases it.
 */
export class RestoreAfterReconnectUseCase implements RestoreAfterReconnectPort {
  private state: RestoreState = { lastSession: undefined, lastConnected: undefined, deleted: new Set<string>(), restoresBySession: [] };
  private home = false;
  private generation = 0;
  private released = false;

  constructor(
    private readonly navigator: SessionNavigatorPort,
    private readonly timer: TimerPort,
  ) {}

  observeRoute(sample: RouteSample): void {
    this.home = sample.type === "home";
    const decision = decideRestore(this.state, { kind: "route", route: sample, at: Date.now() });
    this.state = decision.state;
    if (decision.action !== "none" && "verify" in decision.action) {
      this.generation += 1;
      void this.restore(decision.action.verify, this.generation);
    }
  }

  observeConnected(at: number): void {
    const decision = decideRestore(this.state, { kind: "connected", at });
    this.state = decision.state;
    if (decision.action !== "none" && "verify" in decision.action) {
      this.generation += 1;
      void this.restore(decision.action.verify, this.generation);
    }
  }

  observeDeleted(sessionID: string): void {
    this.state = decideRestore(this.state, { kind: "deleted", sessionID }).state;
  }

  dispose(): void {
    this.released = true;
    this.generation += 1;
  }

  private async restore(sessionID: string, run: number): Promise<void> {
    for (let attempt = 0; attempt < VERIFY_BACKOFF.length; attempt += 1) {
      if (this.released || run !== this.generation) return;
      await this.timer.sleep(VERIFY_BACKOFF[attempt]!);
      if (this.released || run !== this.generation || !this.home) return;
      const result: VerifyResult = await this.navigator.verify(sessionID);
      if (this.released || run !== this.generation || !this.home) return;
      const decision = decideRestore(this.state, { kind: "verified", sessionID, result, at: Date.now() });
      this.state = decision.state;
      if (decision.action === "none") return;
      if ("navigate" in decision.action) {
        this.navigator.notify({ variant: "success", title: "Session restored", message: `Restored ${decision.action.navigate} after reconnect` });
        this.navigator.open(decision.action.navigate);
        return;
      }
      if ("giveUp" in decision.action) {
        this.navigator.notify({ variant: "info", title: "Session restore skipped", message: `Could not verify ${decision.action.giveUp} after reconnect` });
        return;
      }
    }
  }
}
