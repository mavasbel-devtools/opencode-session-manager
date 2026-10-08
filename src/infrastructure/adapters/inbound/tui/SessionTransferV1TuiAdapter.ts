import type { TuiPluginApi, TuiDialogSelectOption } from "@opencode-ai/plugin/tui"
import type { BuildDirectoryOptionsPort } from "@session-manager/domain/ports/inbound/BuildDirectoryOptionsPort"
import type { TransferSessionPort } from "@session-manager/domain/ports/inbound/TransferSessionPort"
import type { HomeDirectoryPort } from "@session-manager/domain/ports/outbound/HomeDirectoryPort"
import type { SessionDbPort } from "@session-manager/domain/ports/outbound/SessionDbPort"

const CUSTOM_PATH = "__transfer_custom_path__"

function reminderText(directory: string) {
  return `<system-reminder>The user has changed the current working directory to "${directory}". This is still the same project but at a possibly new location; take this into account when working with any files from now on.</system-reminder>`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function activeSessionId(api: TuiPluginApi): string | undefined {
  const route = api.route.current
  if (route.name !== "session") return undefined
  const value = route.params?.["sessionID"]
  return typeof value === "string" ? value : undefined
}

/** The ports the v1 transfer command drives, wired by the v1 composition root. */
export interface V1TransferServices {
  readonly db: SessionDbPort
  readonly home: HomeDirectoryPort
  readonly transferSession: TransferSessionPort
  readonly buildDirectoryOptions: BuildDirectoryOptionsPort
}

export class SessionTransferV1TuiAdapter {
  constructor(private readonly container: V1TransferServices) {}

  register(api: TuiPluginApi): void {
    api.keymap.registerLayer({
      commands: [
        {
          name: "session.transfer",
          title: "Transfer session",
          category: "Session",
          namespace: "palette",
          slashName: "transfer-session",
          slashAliases: ["relocate"],
          run: () => this.open(api),
        },
      ],
    })
  }

  private open(api: TuiPluginApi): void {
    const sessionId = activeSessionId(api)
    if (sessionId !== undefined) {
      void this.openDirectoryPicker(api, sessionId)
      return
    }
    void this.openSessionPicker(api)
  }

  private async openSessionPicker(api: TuiPluginApi): Promise<void> {
    try {
      const sessions = await this.container.db.listSessions()
      if (sessions.length === 0) {
        api.ui.toast({ variant: "warning", title: "Transfer session", message: "No sessions found." })
        return
      }

      const options: TuiDialogSelectOption<string>[] = sessions.map((session) => ({
        title: session.title || session.id,
        value: session.id,
        description: session.directory,
        footer: session.id.slice(-8),
        onSelect: () => {
          void this.openDirectoryPicker(api, session.id)
        },
      }))

      api.ui.dialog.replace(() =>
        api.ui.DialogSelect({
          title: "Transfer session — pick a session",
          placeholder: "Filter sessions…",
          options,
        }),
      )
    } catch (error) {
      api.ui.toast({ variant: "error", title: "Transfer session", message: errorMessage(error) })
    }
  }

  private async openDirectoryPicker(api: TuiPluginApi, sessionId: string): Promise<void> {
    try {
      const home = this.container.home.homeDirectory()
      const entries = await this.container.buildDirectoryOptions.execute(home)

      const options: TuiDialogSelectOption<string>[] = entries.map((entry) => ({
        title: entry.title,
        value: entry.custom ? CUSTOM_PATH : entry.directory,
        category: entry.category,
        ...(entry.description ? { description: entry.description } : {}),
        onSelect: () => {
          if (entry.custom) {
            this.promptCustomPath(api, sessionId)
            return
          }
          this.executeTransfer(api, sessionId, entry.directory)
        },
      }))

      api.ui.dialog.replace(() =>
        api.ui.DialogSelect({
          title: `Transfer session (${sessionId.slice(-8)})`,
          placeholder: "Pick a directory, or “Enter custom path…”",
          options,
        }),
      )
    } catch (error) {
      api.ui.toast({ variant: "error", title: "Transfer session", message: errorMessage(error) })
    }
  }

  private promptCustomPath(api: TuiPluginApi, sessionId: string): void {
    api.ui.dialog.replace(() =>
      api.ui.DialogPrompt({
        title: "Enter destination directory",
        placeholder: "e.g. ~/work/repos/HomeLab or C:\\path\\to\\dir",
        onConfirm: (value) => this.executeTransfer(api, sessionId, value),
        onCancel: () => api.ui.dialog.clear(),
      }),
    )
  }

  private executeTransfer(api: TuiPluginApi, sessionId: string, directory: string): void {
    this.container.transferSession
      .execute(sessionId, directory, this.container.home.homeDirectory())
      .then(async (result) => {
        api.ui.dialog.clear()

        // Bind the destination instance and leave a synthetic reminder so the
        // agent adopts the new working directory.
        await api.client.session
          .promptAsync({
            sessionID: sessionId,
            directory: result.newDirectory,
            noReply: true,
            parts: [{ type: "text", text: reminderText(result.newDirectory), synthetic: true }],
          })
          .catch(() => undefined)

        api.ui.toast({
          variant: "success",
          title: "Session transferred",
          message: `Moved to ${result.newDirectory}`,
          duration: 4000,
        })
      })
      .catch((error) => {
        api.ui.toast({ variant: "error", title: "Transfer failed", message: errorMessage(error) })
      })
  }
}
