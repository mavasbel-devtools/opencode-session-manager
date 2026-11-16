import { rootSession } from "@session-manager/domain/model/PaneTitle"
import type { ReportPaneTitlePort } from "@session-manager/domain/ports/inbound/ReportPaneTitlePort"
import type { V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"

/** How often the open session and its title are read, and how many reads go by between two resends. */
export interface PaneTitleSchedule {
  readonly pollMilliseconds: number
  readonly refreshEvery: number
}

/**
 * OpenCode 2 inbound adapter: keeps the Herdr pane this TUI runs in showing
 * the agent of the open session (a sub-agent session shows its own agent) and
 * the title of its root session (the session Herdr's own integration reports
 * for the pane).
 *
 * The open session, its agent and its root's title are read from the TUI's
 * own synced data on a timer, as Herdr's integration reads the route: opening
 * another session, renaming one or running a prompt with another agent has no
 * single host event that arrives after the data changed. The agent is the one
 * OpenCode records on the session when a prompt is sent; the agent picked in
 * the prompt before sending is not visible to plugins. A session that is not
 * loaded yet is skipped until it is. Every `refreshEvery` reads the values are
 * sent again, because Herdr ignores a report that arrives before it has
 * recognised OpenCode in the pane. Reports are not awaited: the port never
 * rejects, and one Herdr did not take is sent again.
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
      const lookup = (sessionID: string) => context.data.session.get(sessionID)
      const root = rootSession(route.sessionID, lookup)
      if (root !== undefined) void this.titles.report({ agent: lookup(route.sessionID)?.agent, title: root.title })
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
