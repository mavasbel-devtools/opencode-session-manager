import { paneTitle } from "@session-manager/domain/model/PaneTitle"
import type { ReportPaneTitlePort } from "@session-manager/domain/ports/inbound/ReportPaneTitlePort"
import type { PaneMetadataPort } from "@session-manager/domain/ports/outbound/PaneMetadataPort"

/** What the pane shows from us; `UNKNOWN` until a report is accepted, so the first report is always sent. */
const UNKNOWN = Symbol("unknown")

/**
 * Keeps the multiplexer's pane title on the open session's title. Reports run
 * one at a time in arrival order, and only a change is sent; a report the
 * multiplexer did not accept is sent again with the next one.
 */
export class ReportPaneTitleUseCase implements ReportPaneTitlePort {
  private shown: string | undefined | typeof UNKNOWN = UNKNOWN
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly pane: PaneMetadataPort) {}

  report(title: string | undefined): Promise<void> {
    const wanted = paneTitle(title)
    return this.enqueue(async () => {
      if (wanted === this.shown) return
      const accepted = wanted === undefined ? await this.pane.clear() : await this.pane.show(wanted)
      this.shown = accepted ? wanted : UNKNOWN
    })
  }

  refresh(): void {
    this.shown = UNKNOWN
  }

  release(): Promise<void> {
    return this.enqueue(async () => {
      if (this.shown === undefined) return
      await this.pane.clear()
      this.shown = undefined
    })
  }

  private enqueue(step: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(step, step)
    return this.queue
  }
}
