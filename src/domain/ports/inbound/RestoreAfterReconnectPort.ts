import type { RouteSample } from "@session-manager/domain/model/ReconnectRestore";

/** Inbound port: the reconnect guard observes routes, reconnects and deletions, and releases on cleanup. */
export interface RestoreAfterReconnectPort {
  observeRoute(sample: RouteSample): void;
  observeConnected(at: number): void;
  observeDeleted(sessionID: string): void;
  dispose(): void;
}
