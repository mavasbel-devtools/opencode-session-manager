/** Outbound port: what the re-sync retry reads from the host — where the route is, and whether a session is loaded. */
export interface ResyncRoutePort {
  routedSessionID(): string | undefined;
  isLoaded(sessionID: string): boolean;
}
