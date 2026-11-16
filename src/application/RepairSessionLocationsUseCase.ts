import { StoreLockedError } from "@session-manager/domain/errors/StoreLockedError"
import type { WorktreeLinkOutcome } from "@session-manager/domain/model/GitWorktree"
import { worktreeAllowsMove, worktreeNoteworthy } from "@session-manager/domain/model/GitWorktree"
import type { LocationRepair, LocationRepairReport, LocationRepairSkip } from "@session-manager/domain/model/LocationRepair"
import type { MapRule } from "@session-manager/domain/model/SessionSync"
import type { RepairSessionLocationsPort } from "@session-manager/domain/ports/inbound/RepairSessionLocationsPort"
import type { RepairWorktreeLinksPort } from "@session-manager/domain/ports/inbound/RepairWorktreeLinksPort"
import type { FileSystemPort } from "@session-manager/domain/ports/outbound/FileSystemPort"
import type { LocationRepairMappingsPort } from "@session-manager/domain/ports/outbound/LocationRepairMappingsPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { SessionHostPort } from "@session-manager/domain/ports/outbound/SessionHostPort"
import type { StoreLockHandle, StoreLockPort } from "@session-manager/domain/ports/outbound/StoreLockPort"
import { relocatedFolder } from "@session-manager/domain/services/RelocateRules"

/** What serialises repairs across processes: the lock of the session store they move sessions in. */
export interface LocationRepairLock {
  readonly locks: StoreLockPort
  readonly runtime: RuntimePort
  /** The OpenCode session store (`opencode.db`); its `session-manager` lock is shared with `relocate` and `sync`. */
  readonly store: string
}

const settle = () => undefined

/**
 * Online repair intentionally accepts only explicit mappings. A temporary host
 * failure is never evidence that a location moved, and this code never creates
 * a destination directory.
 *
 * Repairs run one at a time: within a process they are queued (a whole-profile repair requested
 * while one is pending shares it), and across processes the session store's lock is taken, so a
 * second window finds the lock held and reports `busy` without reading or moving anything.
 * Sessions are read only once the lock is held.
 */
export class RepairSessionLocationsUseCase implements RepairSessionLocationsPort {
  private queue: Promise<unknown> = Promise.resolve()
  private pendingAll: Promise<LocationRepairReport> | null = null

  constructor(
    private readonly host: SessionHostPort,
    private readonly files: FileSystemPort,
    private readonly mappings: LocationRepairMappingsPort,
    private readonly worktrees: RepairWorktreeLinksPort,
    private readonly lock: LocationRepairLock,
  ) {}

  execute(sessionIds?: readonly string[]): Promise<LocationRepairReport> {
    if (sessionIds === undefined && this.pendingAll !== null) return this.pendingAll
    const run = this.queue.then(() => this.locked(sessionIds))
    this.queue = run.then(settle, settle)
    if (sessionIds === undefined) {
      this.pendingAll = run
      const clear = () => {
        if (this.pendingAll === run) this.pendingAll = null
      }
      run.then(clear, clear)
    }
    return run
  }

  private async locked(sessionIds: readonly string[] | undefined): Promise<LocationRepairReport> {
    const rules = this.mappings.mappings()
    if (rules.length === 0) return { rules, repaired: [], skipped: [], worktrees: [], busy: false }
    const { locks, runtime, store } = this.lock
    let handle: StoreLockHandle
    try {
      handle = locks.acquire([store], { pid: runtime.pid(), command: "repair-sessions", since: new Date(runtime.now()).toISOString() })
    } catch (error) {
      if (error instanceof StoreLockedError) return { rules, repaired: [], skipped: [], worktrees: [], busy: true }
      throw error
    }
    try {
      return await this.repair(rules, sessionIds)
    } finally {
      handle.release()
    }
  }

  private async repair(rules: readonly MapRule[], sessionIds: readonly string[] | undefined): Promise<LocationRepairReport> {
    const repaired: LocationRepair[] = []
    const skipped: LocationRepairSkip[] = []
    const trees = new Map<string, WorktreeLinkOutcome>()
    const selected = sessionIds === undefined ? undefined : new Set(sessionIds)
    for (const session of await this.host.listSessions()) {
      if (selected !== undefined && !selected.has(session.id)) continue
      if (this.files.isDirectory(session.directory)) {
        skipped.push({ session_id: session.id, directory: session.directory, reason: "directory-present", to_directory: null })
        continue
      }
      const target = relocatedFolder(rules, session.directory)
      if (target === null) {
        skipped.push({ session_id: session.id, directory: session.directory, reason: "not-mapped", to_directory: null })
        continue
      }
      if (!this.files.isDirectory(target)) {
        skipped.push({ session_id: session.id, directory: session.directory, reason: "target-missing", to_directory: target })
        continue
      }
      let tree = trees.get(target)
      if (tree === undefined) {
        tree = this.worktrees.ensure(target, rules)
        trees.set(target, tree)
      }
      if (!worktreeAllowsMove(tree)) {
        skipped.push({ session_id: session.id, directory: session.directory, reason: "worktree-unresolved", to_directory: target })
        continue
      }
      await this.host.moveSession(session.id, target)
      repaired.push({ session_id: session.id, from_directory: session.directory, to_directory: target })
    }
    return { rules, repaired, skipped, worktrees: [...trees.values()].filter(worktreeNoteworthy), busy: false }
  }
}
