import type { AdoptionRecorder } from "@session-manager/application/patches/follow/AdoptionRecorder"
import type { ConfigEntries } from "@session-manager/application/patches/follow/ConfigEntrySet"
import type { EntrySwitcher } from "@session-manager/application/patches/follow/EntrySwitcher"
import type { ReleaseProver } from "@session-manager/application/patches/follow/ReleaseProver"
import type { ReleaseStager } from "@session-manager/application/patches/follow/ReleaseStager"
import type { InstallationCatalog } from "@session-manager/application/patches/InstallationCatalog"
import type { FollowOutcome, FollowReport } from "@session-manager/domain/model/patches/Reports"
import { stepLog, type StepLog } from "@session-manager/domain/model/patches/StepLog"
import type { PatchFollowPort } from "@session-manager/domain/ports/inbound/PatchFollowPort"
import type { AuditLogPort } from "@session-manager/domain/ports/outbound/AuditLogPort"
import type { ClockPort } from "@session-manager/domain/ports/outbound/ClockPort"
import type { FollowLockPort } from "@session-manager/domain/ports/outbound/FollowLockPort"
import type { LivePluginsPort } from "@session-manager/domain/ports/outbound/LivePluginsPort"
import type { ManagedStorePort } from "@session-manager/domain/ports/outbound/ManagedStorePort"
import type { PublishedVersion, RegistryPort } from "@session-manager/domain/ports/outbound/RegistryPort"
import { loadsFrom, packageRoot } from "@session-manager/domain/services/patches/FollowRules"
import { compareVersions } from "@session-manager/domain/services/Versions"

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

interface Run {
  readonly log: StepLog
  readonly fromSet?: ConfigEntries
  readonly from: string | null
  version: string | null
  to: string | null
  evidence: string | null
}

/**
 * Adopts a new Magic Context release already patched, so OpenCode never loads an unpatched copy:
 * detect (npm `latest`, or the version asked for) → stage (Arborist, integrity) → locate (matchers)
 * → patch (parse check, read back; then renamed to `installs/<v>/`) → prove (isolated OpenCode
 * server, on that folder) → publish (the one opencode.jsonc entry) → confirm (every location of the running
 * server reloads it; Magic Context's log rejects nothing) → record. Any failed step stops the run;
 * after the entry changed, the previous entry is put back. Never touches a copy OpenCode loads.
 */
export class FollowUseCase implements PatchFollowPort {
  constructor(
    private readonly lock: FollowLockPort,
    private readonly catalog: InstallationCatalog,
    private readonly registry: RegistryPort,
    private readonly store: ManagedStorePort,
    private readonly stager: ReleaseStager,
    private readonly prover: ReleaseProver,
    private readonly switcher: EntrySwitcher,
    private readonly live: LivePluginsPort,
    private readonly recorder: AdoptionRecorder,
    private readonly audit: AuditLogPort,
    private readonly clock: ClockPort,
  ) {}

  async follow(version: string | null): Promise<FollowReport> {
    const release = await this.lock.acquire()
    if (release === null) {
      const log = stepLog(this.clock)
      log.fail("detect", "another follow run holds the lock")
      return this.report({ log, from: null, version, to: null, evidence: null }, "busy")
    }
    try {
      return await this.run(version)
    } finally {
      await release()
    }
  }

  private report(run: Run, outcome: FollowOutcome): FollowReport {
    const { version, from, evidence } = run
    return { outcome, version, from, to: run.to ?? from, steps: run.log.steps(), evidence, auditLog: this.audit.location() }
  }

  private async stop(run: Run): Promise<FollowReport> {
    await this.recorder.stopped(run.version, run.log)
    return this.report(run, "stopped")
  }

  private async loadedFrom(folder: string): Promise<boolean> {
    return ((await this.live.magicContext()) ?? []).some((plugin) => loadsFrom(plugin.source, folder))
  }

  private async run(asked: string | null): Promise<FollowReport> {
    const fromSet = await this.switcher.current()
    const run: Run = { log: stepLog(this.clock), fromSet, from: fromSet.opencode, version: asked, to: null, evidence: null }
    const published = await this.detect(asked, run)
    if (published === null) return run.log.failure() === null ? this.report(run, "up-to-date") : this.stop(run)
    const { folder, copy } = await this.stager.stage(published, run.log)
    if (copy === null) {
      await this.store.remove(folder)
      return this.stop(run)
    }
    // Moved into place before the proof, so the sandbox loads the very folder the entry will name.
    let target: string
    try {
      target = await this.store.publish(folder, published.version)
    } catch (error) {
      await this.store.remove(folder)
      run.log.fail("publish", `moving ${folder} into place failed: ${message(error)}`)
      return this.stop(run)
    }
    const root = packageRoot(target)
    if (!(await this.prover.prove(root, run.log))) {
      await this.store.remove(target)
      return this.stop(run)
    }
    const change = await this.switcher.switchTo(root, run.log)
    if (change === null) {
      const now = await this.switcher.current()
      if (JSON.stringify(now) !== JSON.stringify(run.fromSet!)) await this.switcher.revert(run.fromSet!, run.log)
      if (!(await this.loadedFrom(target))) await this.store.remove(target)
      run.to = (await this.switcher.current()).opencode
      return this.stop(run)
    }
    run.to = root
    const pruned = await this.prune(published.version, run)
    run.evidence = await this.recorder.adopted({ published, root, change, releases: copy.releases, pruned }, run.log)
    return this.report(run, "adopted")
  }

  /** Step detect; null when there is nothing to do (no failure logged) or the run stops (failure logged). */
  private async detect(asked: string | null, run: Run): Promise<PublishedVersion | null> {
    if (run.from === null) return run.log.fail("detect", "opencode.jsonc has no Magic Context entry") || null
    let published: PublishedVersion | null
    try {
      published = asked === null ? await this.registry.latest() : await this.registry.find(asked)
    } catch (error) {
      return run.log.fail("detect", `the npm registry did not answer: ${message(error)}`) || null
    }
    if (published === null) return run.log.fail("detect", `Magic Context ${asked} was never published`) || null
    run.version = published.version
    const loaded = (await this.catalog.load()).installations.find((installation) => installation.loaded)
    const existing = await this.store.published(published.version)
    const loads = `OpenCode loads ${loaded?.version ?? "an uninstalled copy"} (${run.from})`
    if (existing !== null && run.from === packageRoot(existing)) {
      run.log.pass("detect", `${published.version} is published; ${loads}, the patched copy this tool installed`)
      return null
    }
    if (asked === null && loaded !== undefined && compareVersions(published.version, loaded.version) <= 0) {
      run.log.pass("detect", `npm latest is ${published.version}; ${loads}`)
      return null
    }
    if (existing !== null) {
      if (await this.loadedFrom(existing)) {
        return run.log.fail("detect", `the running server still loads ${existing}, which opencode.jsonc no longer names; it is left alone`) || null
      }
      await this.store.remove(existing)
    }
    run.log.pass("detect", `${asked === null ? "npm latest" : "asked for"} ${published.version} (${published.integrity}); ${loads}`)
    return published
  }

  /** Keeps the adopted version and the one the previous entry named; removes every other install nothing loads. */
  private async prune(version: string, run: Run): Promise<readonly string[]> {
    const removed: string[] = []
    for (const other of await this.store.versions()) {
      const folder = (await this.store.published(other))!
      if (other === version || loadsFrom(run.from, folder) || (await this.loadedFrom(folder))) continue
      await this.store.remove(folder)
      removed.push(other)
    }
    return removed
  }
}
