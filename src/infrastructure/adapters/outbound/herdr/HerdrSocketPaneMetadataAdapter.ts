import net from "node:net"
import type { HerdrPane } from "@session-manager/domain/model/HerdrPane"
import type { PanePresentation } from "@session-manager/domain/model/PaneTitle"
import type { PaneMetadataPort } from "@session-manager/domain/ports/outbound/PaneMetadataPort"

/** Who reports: Herdr keeps display values per source, so ours never replace another reporter's. */
export const PANE_TITLE_SOURCE = "opencode-session-manager:title"

/**
 * The agent the values belong to. Herdr shows them only while the pane's agent
 * is OpenCode, so a title never outlives the OpenCode that set it.
 */
export const PANE_TITLE_AGENT = "opencode"

/**
 * Herdr's API over its local socket (herdr.dev/docs/socket-api): one JSON
 * request per line, answered by one JSON line carrying `result` or `error`.
 * `pane.report_metadata` changes only what Herdr displays — the pane's working
 * state, waits and notifications stay with Herdr's own OpenCode integration.
 *
 * Nothing is ever written to the terminal: a missing or silent Herdr answers
 * `false` after the timeout, and the report is simply sent again later.
 */
export class HerdrSocketPaneMetadataAdapter implements PaneMetadataPort {
  private sequence = Date.now() * 1000

  constructor(
    private readonly pane: HerdrPane,
    private readonly platform: string,
    private readonly timeoutMilliseconds: number,
  ) {}

  /**
   * Herdr replaces a source's whole record with each report, so both values go
   * in every report and a value left out is cleared to Herdr's default.
   */
  show(presentation: PanePresentation): Promise<boolean> {
    const values: Record<string, unknown> = {}
    if (presentation.title !== undefined) values["title"] = presentation.title
    if (presentation.agent !== undefined) values["display_agent"] = presentation.agent
    return this.send(values)
  }

  clear(): Promise<boolean> {
    return this.send({ clear_title: true, clear_display_agent: true })
  }

  /** Herdr's socket path on this platform: a named pipe on Windows, a Unix socket elsewhere. */
  endpoint(): string {
    return this.platform === "win32" ? `\\\\.\\pipe\\${this.pane.socketPath}` : this.pane.socketPath
  }

  private send(values: Record<string, unknown>): Promise<boolean> {
    this.sequence += 1
    const request = {
      id: `${PANE_TITLE_SOURCE}:${this.sequence}`,
      method: "pane.report_metadata",
      params: { pane_id: this.pane.paneID, source: PANE_TITLE_SOURCE, agent: PANE_TITLE_AGENT, seq: this.sequence, ...values },
    }
    return new Promise((resolve) => {
      let answer = ""
      let settled = false
      const socket = net.createConnection(this.endpoint())
      const settle = (accepted: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.destroy()
        resolve(accepted)
      }
      const timer = setTimeout(() => settle(false), this.timeoutMilliseconds)
      socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`))
      socket.on("data", (chunk) => {
        answer += chunk.toString("utf8")
        const end = answer.indexOf("\n")
        if (end !== -1) settle(accepted(answer.slice(0, end)))
      })
      socket.on("error", () => settle(false))
      socket.on("close", () => settle(false))
    })
  }
}

function accepted(line: string): boolean {
  try {
    const response = JSON.parse(line) as { result?: unknown }
    return response.result !== undefined
  } catch {
    return false
  }
}
