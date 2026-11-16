import { abbreviateHome } from "@session-manager/domain/model/Paths"
import type { BuildDirectoryOptionsPort } from "@session-manager/domain/ports/inbound/BuildDirectoryOptionsPort"
import type { MoveSessionPort } from "@session-manager/domain/ports/inbound/MoveSessionPort"
import type { RepairSessionLocationsPort } from "@session-manager/domain/ports/inbound/RepairSessionLocationsPort"
import type { HomeDirectoryPort } from "@session-manager/domain/ports/outbound/HomeDirectoryPort"
import type { SessionHostPort } from "@session-manager/domain/ports/outbound/SessionHostPort"
import { APP_SLOT, type V2KeymapLayer, type V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import type { FolderBrowserRequest } from "@session-manager/infrastructure/adapters/inbound/tui/FolderBrowserDialogV2Adapter"

const TITLE = "Transfer session"

/** Picks the destination folder (the folder browser dialog). */
export interface V2FolderPicker {
  pick(context: V2TuiContext, request: FolderBrowserRequest): Promise<string | undefined>
}

/** The ports the v2 transfer command drives, wired by the TUI composition root. */
export interface V2TransferServices {
  readonly host: SessionHostPort
  readonly home: HomeDirectoryPort
  readonly moveSession: MoveSessionPort
  readonly repairSession: RepairSessionLocationsPort
  readonly buildDirectoryOptions: BuildDirectoryOptionsPort
  readonly folders: V2FolderPicker
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * OpenCode 2 inbound adapter for `/transfer-session`.
 *
 * What it adds over the builtin v2 move surfaces (`/cd <path>` and the
 * `/worktrees` picker): a folder browser over *every* registered project,
 * worktree and session folder across projects, with typed paths completed
 * from disk (→ into a folder, ← up), moving a session other than the open
 * one, and creating a destination folder that does not exist yet (after a
 * second Enter). Before showing destinations it gives only the selected session
 * one proof-based, explicit-mapping repair attempt; that never affects other
 * sessions and a repair failure cannot block an intentional transfer.
 */
export class SessionTransferV2TuiAdapter {
  constructor(private readonly services: V2TransferServices) {}

  /**
   * v2 runs plugin setup() outside the component tree, where `keymap.layer`
   * throws "Keymap.Provider is missing". Register from an `app` slot render
   * instead — the same pattern the host's builtin plugins use
   * (packages/tui/src/feature-plugins/system/stats.tsx).
   */
  register(context: V2TuiContext): () => void {
    const layer = (): V2KeymapLayer => ({
      mode: "global",
      commands: [
        {
          id: "session.transfer",
          title: TITLE,
          group: "Session",
          palette: true,
          slash: { name: "transfer-session" },
          run: () => {
            void this.open(context)
          },
        },
      ],
    })
    return context.ui.slot({
      append: APP_SLOT,
      render: () => {
        context.keymap.layer(layer)
        return null
      },
    })
  }

  async open(context: V2TuiContext): Promise<void> {
    try {
      const route = context.ui.router.current()
      const sessionId = route.type === "session" ? route.sessionID : undefined
      const target = sessionId ?? (await this.pickSession(context))
      if (target === undefined) return
      await this.repairSelected(context, target)
      await this.pickDirectory(context, target)
    } catch (error) {
      context.ui.toast.show({ variant: "error", title: TITLE, message: errorMessage(error) })
    }
  }

  /** A repair failure must never prevent the user's explicit transfer. */
  private async repairSelected(context: V2TuiContext, sessionId: string): Promise<void> {
    try {
      const report = await this.services.repairSession.execute([sessionId])
      const repair = report.repaired[0]
      const skip = report.skipped[0]
      if (repair !== undefined)
        context.ui.toast.show({ variant: "info", title: TITLE, message: `Repaired stale location to ${repair.to_directory}.`, duration: 4000 })
      else if (report.busy)
        context.ui.toast.show({ variant: "warning", title: TITLE, message: "Location repair skipped: another OpenCode window is repairing session locations.", duration: 5000 })
      else if (skip?.reason === "target-missing" || skip?.reason === "worktree-unresolved")
        context.ui.toast.show({
          variant: "warning",
          title: TITLE,
          message: `Location repair skipped: ${skip.reason === "target-missing" ? "the mapped folder" : "Git cannot resolve the work tree of"} ${skip.to_directory}${skip.reason === "target-missing" ? " is missing" : ""}.`,
          duration: 5000,
        })
    } catch (error) {
      context.ui.toast.show({ variant: "warning", title: TITLE, message: `Location repair skipped: ${errorMessage(error)}`, duration: 5000 })
    }
  }

  private async pickSession(context: V2TuiContext): Promise<string | undefined> {
    const sessions = await this.services.host.listSessions()
    if (sessions.length === 0) {
      context.ui.toast.show({ variant: "warning", title: TITLE, message: "No sessions found." })
      return undefined
    }
    return context.ui.dialog.select({
      title: `${TITLE} — pick a session`,
      placeholder: "Filter sessions…",
      options: sessions.map((session) => ({
        title: session.title || session.id,
        value: session.id,
        description: abbreviateHome(session.directory, this.services.home.homeDirectory()),
        footer: session.id.slice(-8),
      })),
    })
  }

  private async pickDirectory(context: V2TuiContext, sessionId: string): Promise<void> {
    const home = this.services.home.homeDirectory()
    const known = await this.services.buildDirectoryOptions.execute(home)
    const directory = await this.services.folders.pick(context, {
      title: `${TITLE} (${sessionId.slice(-8)})`,
      home,
      roots: known.map((entry) => entry.directory),
    })
    if (directory === undefined) return

    const result = await this.services.moveSession.execute(sessionId, directory, home).catch((error: unknown) => {
      context.ui.toast.show({ variant: "error", title: "Transfer failed", message: errorMessage(error) })
      return undefined
    })
    if (!result) return
    context.ui.toast.show({
      variant: "success",
      title: "Session transferred",
      message: `Moved to ${result.newDirectory}`,
      duration: 4000,
    })
  }
}
