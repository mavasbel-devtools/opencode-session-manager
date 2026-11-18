import type { ResyncRequest } from "@session-manager/domain/model/ResyncRetry";

/** Inbound port: one re-sync, run through the retry policy around the attempt the caller supplies. */
export interface RetryResyncPort {
  sync(request: ResyncRequest, attempt: () => Promise<void>): Promise<void>;
}
