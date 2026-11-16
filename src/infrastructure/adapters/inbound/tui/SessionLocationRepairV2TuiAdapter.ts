import { InvalidMapRuleError } from "@session-manager/domain/errors/InvalidMapRuleError"
import { locationRepairMessage, locationRepairNeedsAttention, type LocationRepairReport } from "@session-manager/domain/model/LocationRepair"
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

  /**
   * On request every outcome is shown. At startup only a change (a repaired session or work tree)
   * or a configuration error is: a busy lock or a host failure there is transient and says nothing
   * about any folder.
   */
  private async repair(context: V2TuiContext, requested: boolean): Promise<void> {
    let report: LocationRepairReport
    try {
      report = await this.repairSessions.execute()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (error instanceof InvalidMapRuleError)
        context.ui.toast.show({ variant: "error", title: TITLE, message: `Location-repair configuration is invalid: ${message}`, duration: 8000 })
      else if (requested) context.ui.toast.show({ variant: "error", title: TITLE, message })
      return
    }
    const changed = report.repaired.length > 0 || report.worktrees.some((tree) => tree.status === "repaired")
    if (!requested && !changed) return
    const message = locationRepairMessage(report) ?? "No location-repair mappings are configured."
    const variant = report.busy || report.rules.length === 0 ? "info" : locationRepairNeedsAttention(report) ? "warning" : changed ? "success" : "info"
    context.ui.toast.show({ variant, title: TITLE, message, duration: 5000 })
  }
}
