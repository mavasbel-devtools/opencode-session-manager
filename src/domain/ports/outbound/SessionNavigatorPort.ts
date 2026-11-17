/** What a verify of the session the TUI left for home can report. */
export type VerifyResult = "exists" | "missing" | "failed";

/** A notice the restore shows through the host toast. */
export interface RestoreNotice {
  readonly variant: "success" | "info";
  readonly title: string;
  readonly message: string;
}

/** Outbound port: check the session still exists, navigate back to it, and tell the person. */
export interface SessionNavigatorPort {
  verify(sessionID: string): Promise<VerifyResult>;
  open(sessionID: string): void;
  notify(notice: RestoreNotice): void;
}
