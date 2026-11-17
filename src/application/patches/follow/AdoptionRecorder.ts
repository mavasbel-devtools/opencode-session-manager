import type { EntryChange, PluginEntryEditor } from "@session-manager/application/patches/follow/PluginEntryEditor"
import type { DerivedRelease } from "@session-manager/domain/model/patches/Patch"
import type { StepLog } from "@session-manager/domain/model/patches/StepLog"
import type { AuditLogPort } from "@session-manager/domain/ports/outbound/AuditLogPort"
import type { ClockPort } from "@session-manager/domain/ports/outbound/ClockPort"
import type { DerivedReleasesPort } from "@session-manager/domain/ports/outbound/DerivedReleasesPort"
import type { EvidencePort } from "@session-manager/domain/ports/outbound/EvidencePort"
import type { KeyValuePort } from "@session-manager/domain/ports/outbound/KeyValuePort"
import type { NotifierPort } from "@session-manager/domain/ports/outbound/NotifierPort"
import type { PublishedVersion } from "@session-manager/domain/ports/outbound/RegistryPort"
import { FOLLOW_TITLE, LAST_FOLLOW_NOTIFICATION, PREVIOUS_ENTRY } from "@session-manager/domain/services/patches/FollowRules"

export interface Adoption {
  readonly published: PublishedVersion
  readonly root: string
  readonly change: EntryChange & { ok: true }
  readonly releases: readonly DerivedRelease[]
  /** Older installs removed because nothing names or loads them. */
  readonly pruned: readonly string[]
}

/**
 * Step record: keeps the derived releases (so `status` and `undo` know the new files), writes the
 * evidence document, appends to the audit log, remembers the previous entry for `--rollback`, and
 * notifies. A stopped run is audited and notified once per distinct reason.
 */
export class AdoptionRecorder {
  constructor(
    private readonly derived: DerivedReleasesPort,
    private readonly evidence: EvidencePort,
    private readonly audit: AuditLogPort,
    private readonly notifier: NotifierPort,
    private readonly store: KeyValuePort,
    private readonly clock: ClockPort,
    private readonly config: string,
  ) {}

  async adopted(adoption: Adoption, log: StepLog): Promise<string> {
    const { published, root, change, releases } = adoption
    for (const release of releases) await this.derived.save(release)
    const time = new Date(this.clock.now()).toISOString()
    for (const { patch, release } of releases) {
      for (const file of release.files) {
        await this.audit.append({ time, action: "follow", patch, version: published.version, root, path: file.path, from: file.before, to: file.after, outcome: "applied", backup: null, reason: null })
      }
    }
    const reason = `${JSON.stringify(change.previous)} → ${JSON.stringify(root)}`
    await this.audit.append({ time, action: "follow", patch: "plugin-entry", version: published.version, root: this.config, path: "opencode.jsonc", from: change.from, to: change.to, outcome: "adopted", backup: change.backup, reason })
    await this.store.set(PREVIOUS_ENTRY, change.previous)
    const name = `${time.slice(0, 16).replace(/[T:]/g, "-")}-magic-context-${published.version}-follow.md`
    const removed = adoption.pruned.length === 0 ? "none" : adoption.pruned.join(", ")
    log.pass("record", `derived releases saved; audit log ${this.audit.location()}; rollback restores ${JSON.stringify(change.previous)}; older installs removed: ${removed}`)
    const document = await this.evidence.write(name, this.document(adoption, log, time))
    await this.store.set(LAST_FOLLOW_NOTIFICATION, null)
    await this.notifier.notify(FOLLOW_TITLE, `Adopted Magic Context ${published.version}, already patched. Evidence: ${document}`)
    return document
  }

  async stopped(version: string | null, log: StepLog): Promise<void> {
    const reason = log.failure()!
    await this.audit.append({ time: new Date(this.clock.now()).toISOString(), action: "follow", patch: "", version: version ?? "", root: "", path: "", from: null, to: null, outcome: "stopped", backup: null, reason })
    const message = `Stopped${version === null ? "" : ` on ${version}`}: ${reason}. OpenCode keeps what it loaded. Run \`opencode-magic-context-patches follow\` to see every step.`
    if ((await this.store.get(LAST_FOLLOW_NOTIFICATION)) === message) return
    await this.notifier.notify(FOLLOW_TITLE, message)
    await this.store.set(LAST_FOLLOW_NOTIFICATION, message)
  }

  private document(adoption: Adoption, log: StepLog, time: string): string {
    const { published, root, change, releases } = adoption
    const files = releases.flatMap(({ patch, release }) =>
      release.files.map((file) => `| ${patch} | \`${file.path}\` | ${file.replacements[0]!.count} × \`${file.replacements[0]!.find}\` | \`${file.before}\` | \`${file.after}\` |`),
    )
    return [
      `# Magic Context ${published.version}, adopted by follow`,
      "",
      `Time: ${time}. Tarball integrity: \`${published.integrity}\`. Installed copy: \`${root}\`.`,
      `opencode.jsonc entry: \`${change.previous}\` → \`${root}\` (backup \`${change.backup}\`; sha256 \`${change.from}\` → \`${change.to}\`).`,
      "",
      "## Steps",
      "",
      "| Step | Result | Seconds | Detail |",
      "|---|---|---|---|",
      ...log.steps().map((step) => `| ${step.step} | ${step.ok ? "ok" : "failed"} | ${(step.ms / 1000).toFixed(1)} | ${step.detail.replaceAll("|", "\\|")} |`),
      "",
      "## Patched files",
      "",
      "| Patch | File | Replaced | sha256 before | sha256 after |",
      "|---|---|---|---|---|",
      ...files,
      "",
      "A person has not reviewed this version: add it to `patches/` (with fixtures) to mark it reviewed.",
      "",
    ].join("\n")
  }
}
