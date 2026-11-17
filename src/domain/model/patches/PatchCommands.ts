import type { PatchApplyPort } from "@session-manager/domain/ports/inbound/PatchApplyPort"
import type { PatchCheckPort } from "@session-manager/domain/ports/inbound/PatchCheckPort"
import type { PatchEffectPort } from "@session-manager/domain/ports/inbound/PatchEffectPort"
import type { PatchFollowPort } from "@session-manager/domain/ports/inbound/PatchFollowPort"
import type { PatchFollowRollbackPort } from "@session-manager/domain/ports/inbound/PatchFollowRollbackPort"
import type { PatchInspectPort } from "@session-manager/domain/ports/inbound/PatchInspectPort"
import type { PatchNotifyPort } from "@session-manager/domain/ports/inbound/PatchNotifyPort"
import type { PatchStatusPort } from "@session-manager/domain/ports/inbound/PatchStatusPort"
import type { PatchUndoPort } from "@session-manager/domain/ports/inbound/PatchUndoPort"

/** Every command the tool offers, as the inbound adapters see them. */
export interface PatchCommands {
  readonly status: PatchStatusPort
  readonly apply: PatchApplyPort
  readonly undo: PatchUndoPort
  readonly check: PatchCheckPort
  readonly inspect: PatchInspectPort
  readonly effect: PatchEffectPort
  readonly notify: PatchNotifyPort
  readonly follow: PatchFollowPort
  readonly rollback: PatchFollowRollbackPort
}
