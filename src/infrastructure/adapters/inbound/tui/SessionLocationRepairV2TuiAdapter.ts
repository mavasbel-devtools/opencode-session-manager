import type { RepairSessionLocationsPort } from "@session-manager/domain/ports/inbound/RepairSessionLocationsPort"
import { APP_SLOT, type V2KeymapLayer, type V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"

const TITLE = "Repair session locations"

/** OpenCode 2 entry point for the safe, mapping-only online repair pass. */
export class SessionLocationRepairV2TuiAdapter {
  constructor(private readonly repairSessions: RepairSessionLocationsPort) {}

  register(context: V2TuiContext): () => void {
    // Startup repair is intentionally quiet unless it changes a stale location.
    void this.repair(context, false)
    const layer = (): V2KeymapLayer => ({
      mode: "global",
      commands: [
        {
          id: "session.repair-locations",
          title: TITLE,
          group: "Session",
          palette: true,
          slash: { name: "repair-sessions" },
          run: () => void this.repair(context, true),
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

  private async repair(context: V2TuiContext, requested: boolean): Promise<void> {
    try {
      const report = await this.repairSessions.execute()
      if (report.repaired.length > 0) {
        context.ui.toast.show({
          variant: "success",
          title: TITLE,
          message: `Repaired ${report.repaired.length} session location${report.repaired.length === 1 ? "" : "s"}.`,
          duration: 5000,
        })
      } else if (requested) {
        const message = report.rules.length === 0 ? "No location-repair mappings are configured." : "No stale mapped session locations needed repair."
        context.ui.toast.show({ variant: "info", title: TITLE, message, duration: 5000 })
      }
    } catch (error) {
      if (requested) context.ui.toast.show({ variant: "error", title: TITLE, message: error instanceof Error ? error.message : String(error) })
    }
  }
}
