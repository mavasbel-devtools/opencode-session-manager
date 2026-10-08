import os from "node:os"
import type { BuildDirectoryOptionsPort } from "@session-manager/domain/ports/inbound/BuildDirectoryOptionsPort"
import type { MoveSessionPort } from "@session-manager/domain/ports/inbound/MoveSessionPort"
import type { FileSystemPort } from "@session-manager/domain/ports/outbound/FileSystemPort"
import type { SessionHostPort } from "@session-manager/domain/ports/outbound/SessionHostPort"
import { APP_SLOT, type V2KeymapLayer, type V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"

const CUSTOM_PATH = "__transfer_custom_path__"
const TITLE = "Transfer session"

/** The ports the v2 transfer command drives, wired by the TUI composition root. */
export interface V2TransferServices {
  readonly host: SessionHostPort
  readonly fs: FileSystemPort
  readonly moveSession: MoveSessionPort
  readonly buildDirectoryOptions: BuildDirectoryOptionsPort
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * OpenCode 2 inbound adapter for `/transfer-session` (alias `/relocate`).
 *
 * What it adds over the builtin v2 move surfaces (`/cd <path>` and the
 * `/worktrees` picker): a picker over *every* registered project, worktree and
 * session directory across projects, moving a session other than the open
 * one, and creating a destination folder that does not exist yet.
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
          description: "Move a session to any folder, including another project",
          group: "Session",
          palette: true,
          slash: { name: "transfer-session", aliases: ["relocate"] },
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
      if (!target) return
      await this.pickDirectory(context, target)
    } catch (error) {
      context.ui.toast.show({ variant: "error", title: TITLE, message: errorMessage(error) })
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
        description: session.directory,
        footer: session.id.slice(-8),
      })),
    })
  }

  private async pickDirectory(context: V2TuiContext, sessionId: string): Promise<void> {
    const home = os.homedir()
    const entries = await this.services.buildDirectoryOptions.execute(home)
    const selected = await context.ui.dialog.select({
      title: `${TITLE} (${sessionId.slice(-8)})`,
      placeholder: "Pick a directory, or “Enter custom path…”",
      options: entries.map((entry) => ({
        title: entry.title,
        value: entry.custom ? CUSTOM_PATH : entry.directory,
        category: entry.category,
        ...(entry.description ? { description: entry.description } : {}),
      })),
    })
    if (selected === undefined) return
    const directory = selected === CUSTOM_PATH ? await this.promptCustomPath(context, home) : selected
    if (directory === undefined) return

    const result = await this.services.moveSession.execute(sessionId, directory).catch((error: unknown) => {
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

  private async promptCustomPath(context: V2TuiContext, home: string): Promise<string | undefined> {
    const value = await context.ui.dialog.prompt({
      title: "Enter destination directory",
      description: "Created when missing. Any folder works, including other projects.",
      placeholder: "e.g. ~/work/repos/HomeLab or C:\\path\\to\\dir",
    })
    if (value === undefined) return undefined
    const trimmed = value.trim()
    if (!trimmed) {
      context.ui.toast.show({ variant: "error", title: TITLE, message: "Path cannot be empty." })
      return undefined
    }
    return this.services.fs.canonical(trimmed, home)
  }
}
