import type { NotifyReport } from "@session-manager/domain/model/patches/Reports"

export interface PatchNotifyPort {
  notify(): Promise<NotifyReport>
}
