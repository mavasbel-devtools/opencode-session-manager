import type { CheckReport, NotifyReport } from "@session-manager/domain/model/patches/Reports"
import type { PatchCheckPort } from "@session-manager/domain/ports/inbound/PatchCheckPort"
import type { PatchNotifyPort } from "@session-manager/domain/ports/inbound/PatchNotifyPort"
import type { KeyValuePort } from "@session-manager/domain/ports/outbound/KeyValuePort"
import type { NotifierPort } from "@session-manager/domain/ports/outbound/NotifierPort"

export const LAST_NOTIFICATION = "last-notification"
export const TITLE = "Magic Context patches"

export function describeProblems(report: CheckReport): string {
  const what = report.reason ?? report.problems.map((p) => `${p.patch} on ${p.version}: ${p.state}`).join("; ")
  return `${what}. Run \`opencode-magic-context-patches status\`.`
}

/**
 * Runs the check and shows a desktop notification when something is not applied. The same problem
 * is announced once; it is announced again only after it changes or was fixed in between. Never
 * changes any file of Magic Context.
 */
export class NotifyUseCase implements PatchNotifyPort {
  constructor(
    private readonly check: PatchCheckPort,
    private readonly notifier: NotifierPort,
    private readonly store: KeyValuePort,
  ) {}

  async notify(): Promise<NotifyReport> {
    const report = await this.check.check()
    if (report.ok) {
      await this.store.set(LAST_NOTIFICATION, null)
      return { ok: true, notified: false, message: null }
    }
    const message = describeProblems(report)
    if ((await this.store.get(LAST_NOTIFICATION)) === message) return { ok: false, notified: false, message }
    await this.notifier.notify(TITLE, message)
    await this.store.set(LAST_NOTIFICATION, message)
    return { ok: false, notified: true, message }
  }
}
