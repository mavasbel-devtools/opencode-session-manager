import type { GuardService } from "@session-manager/application/GuardService"
import type { SwapService } from "@session-manager/application/SwapService"
import type { MaintenanceFileSystemPort } from "@session-manager/domain/ports/outbound/MaintenanceFileSystemPort"

/** A checked working copy and the store it replaces. */
export interface JointSwapStep {
  readonly dbPath: string
  readonly work: string
}

/**
 * Puts checked working copies in place by renames: each is first copied next to its store (the
 * copy may be on another file system), then swapped in, the originals moved into one backup folder.
 * When a later swap fails, the earlier ones are undone, so the stores never disagree.
 */
export class JointSwapService {
  constructor(
    private readonly fileSystem: MaintenanceFileSystemPort,
    private readonly guard: GuardService,
    private readonly swap: SwapService,
  ) {}

  replace(steps: readonly JointSwapStep[], backupDir: string, stamp: string): void {
    const { fileSystem, guard, swap } = this
    const planned = steps.map((step) => ({ ...step, incoming: `${step.dbPath}.incoming-${stamp}` }))
    for (const step of planned) {
      guard.assertNotHeld(step.dbPath)
      guard.checkSpace({ dbPath: step.dbPath, requiredBytes: fileSystem.size(step.work) })
    }
    const done: { readonly step: (typeof planned)[number]; readonly moved: readonly string[] }[] = []
    try {
      for (const step of planned) {
        fileSystem.copyFile(step.work, step.incoming)
        done.push({ step, moved: swap.swap({ dbPath: step.dbPath, compacted: step.incoming, backupDir }) })
      }
    } catch (error) {
      for (const { step, moved } of done.reverse()) swap.undo({ dbPath: step.dbPath, compacted: step.incoming, backupDir }, moved)
      for (const step of planned) if (fileSystem.exists(step.incoming)) fileSystem.remove(step.incoming)
      throw error
    }
  }
}
