import type { RestoreAfterReconnectPort } from "@session-manager/domain/ports/inbound/RestoreAfterReconnectPort";
import type { RouteSample } from "@session-manager/domain/model/ReconnectRestore";
import type { V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext";

/** How often the open route is read for the reconnect guard. */
export interface ReconnectRestoreSchedule {
  readonly pollMilliseconds: number;
}

/**
 * OpenCode 2 inbound adapter: polls the open route and forwards route,
 * reconnect and deletion observations to the restore port. Registering
 * returns the disposer, which unsubscribes both host events, clears the
 * route poll and releases the port (which aborts a pending verify loop).
 */
export class ReconnectRestoreV2Adapter {
  constructor(
    private readonly restores: RestoreAfterReconnectPort,
    private readonly schedule: ReconnectRestoreSchedule,
  ) {}

  register(context: V2TuiContext): () => void {
    let last: string | undefined;
    const poll = () => {
      const route = context.ui.router?.current?.() ?? { type: "unknown" };
      const key = route.sessionID === undefined ? route.type : `${route.type}:${route.sessionID}`;
      if (key === last) return;
      last = key;
      const sample: RouteSample = route.sessionID === undefined ? { type: route.type } : { type: route.type, sessionID: route.sessionID };
      this.restores.observeRoute(sample);
    };
    const timer = setInterval(poll, this.schedule.pollMilliseconds);
    timer.unref?.();
    poll();
    const connected = context.data?.on?.("server.connected", () => {
      this.restores.observeConnected(Date.now());
    });
    const deleted = context.data?.on?.("session.deleted", (sessionID: string) => {
      this.restores.observeDeleted(sessionID);
    });
    return () => {
      connected?.();
      deleted?.();
      clearInterval(timer);
      this.restores.dispose();
    };
  }
}
