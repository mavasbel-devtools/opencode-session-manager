import { rootSession } from "@session-manager/domain/model/PaneTitle"
import type { ReportPaneTitlePort } from "@session-manager/domain/ports/inbound/ReportPaneTitlePort"
import type { V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"

/** How often the open session and its title are read, and how many reads go by between two resends. */
export interface PaneTitleSchedule {
  readonly pollMilliseconds: number
  readonly refreshEvery: number
}

/**
 * OpenCode 2 inbound adapter: keeps the Herdr pane this TUI runs in titled
 * with the open session's title (the root of its parent chain, the session
 * Herdr's own integration reports for the pane).
 *
 * The open session and its title are read from the TUI's own synced data on a
 * timer, as Herdr's integration reads the route: opening another session or
 * renaming one has no single host event that arrives after the data changed.
 * A session that is not loaded yet is skipped until it is. Every
 * `refreshEvery` reads the title is sent again, because Herdr ignores a title
 * that arrives before it has recognised OpenCode in the pane. Reports are not
 * awaited: the port never rejects, and one Herdr did not take is sent again.
 */
export class HerdrPaneTitleV2Adapter {
  constructor(
    private readonly titles: ReportPaneTitlePort,
    private readonly schedule: PaneTitleSchedule,
  ) {}

  register(context: V2TuiContext): () => void {
    let reads = 0
    const read = () => {
      reads += 1
      if (reads % this.schedule.refreshEvery === 0) this.titles.refresh()
      const route = context.ui.router.current()
      if (route.type !== "session" || !route.sessionID) return void this.titles.report(undefined)
      const root = rootSession(route.sessionID, (sessionID) => context.data.session.get(sessionID))
      if (root !== undefined) void this.titles.report(root.title)
    }
    const timer = setInterval(read, this.schedule.pollMilliseconds)
    timer.unref?.()
    read()
    return () => {
      clearInterval(timer)
      void this.titles.release()
    }
  }
}
