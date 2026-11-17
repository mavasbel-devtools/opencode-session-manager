import type { EntryChange, PluginEntryEditor } from "@session-manager/application/patches/follow/PluginEntryEditor"
import type { FollowStepName } from "@session-manager/domain/model/patches/Reports"
import type { StepLog } from "@session-manager/domain/model/patches/StepLog"
import type { ClockPort } from "@session-manager/domain/ports/outbound/ClockPort"
import type { LivePlugin, LivePluginsPort } from "@session-manager/domain/ports/outbound/LivePluginsPort"
import type { LogPort } from "@session-manager/domain/ports/outbound/LogPort"
import type { TextSourcePort } from "@session-manager/domain/ports/outbound/TextSourcePort"
import { effectVerdict, linesSince, summarizeEffect, THRESHOLD_SETTING } from "@session-manager/domain/services/patches/EffectReading"
import { CONFIG_REJECTION, loadsEntry, loadsFrom } from "@session-manager/domain/services/patches/FollowRules"
import { numericSetting } from "@session-manager/domain/services/Jsonc"

export interface SwitchTiming {
  /** How long to wait for every location of the running server to load the new entry. */
  readonly timeoutMs: number
  readonly pollMs: number
  /** How long to wait after that before reading Magic Context's log, so its setup lines are written. */
  readonly settleMs: number
}

const describe = (plugins: readonly LivePlugin[]) =>
  plugins.map((plugin) => `${plugin.directory}: ${plugin.source ?? "(not listed)"} ${plugin.status ?? ""}`.trim()).join("; ")

/**
 * Steps publish and confirm: changes the Magic Context entry of opencode.jsonc, then waits until
 * every location of the running OpenCode server reloaded the plugin from that entry (OpenCode
 * watches its configuration; nothing is restarted), and reads Magic Context's log from the moment
 * of the change: no setting may be rejected, and the execute threshold must not differ.
 */
export class EntrySwitcher {
  constructor(
    private readonly editor: PluginEntryEditor,
    private readonly live: LivePluginsPort,
    private readonly log: LogPort,
    private readonly magicContextConfig: TextSourcePort,
    private readonly clock: ClockPort,
    private readonly timing: SwitchTiming,
  ) {}

  async current(): Promise<string | null> {
    return this.editor.current()
  }

  /** Sets the entry and confirms it; returns the change, or null when either failed (the caller reverts). */
  async switchTo(entry: string, steps: StepLog, step: FollowStepName = "publish"): Promise<(EntryChange & { ok: true }) | null> {
    const since = this.clock.now()
    const change = await this.editor.set(entry)
    if (!change.ok) return steps.fail(step, change.reason) || null
    steps.pass(step, `${this.editor.location()}: ${JSON.stringify(change.previous)} → ${JSON.stringify(entry)} (backup ${change.backup})`)
    return (await this.confirm(entry, since, steps)) ? change : null
  }

  private async confirm(entry: string, since: number, steps: StepLog): Promise<boolean> {
    const deadline = this.clock.now() + this.timing.timeoutMs
    let plugins = await this.live.magicContext()
    while (plugins !== null && !plugins.every((plugin) => loadsEntry(plugin.source, entry) && plugin.status === "active")) {
      if (this.clock.now() >= deadline) {
        return steps.fail("confirm", `after ${this.timing.timeoutMs / 1000} s the running server reports ${describe(plugins)}`)
      }
      await this.clock.sleep(this.timing.pollMs)
      plugins = await this.live.magicContext()
    }
    if (plugins === null) return steps.pass("confirm", `no OpenCode server answers; it loads ${entry} when it starts`)
    await this.clock.sleep(this.timing.settleMs)
    const lines = (await this.log.lines()) ?? []
    const rejected = linesSince(lines, since).filter((line) => CONFIG_REJECTION.test(line))
    if (rejected.length > 0) return steps.fail("confirm", `Magic Context rejected its configuration after the change: ${rejected[0]}`)
    const config = await this.magicContextConfig.read()
    const verdict = effectVerdict(summarizeEffect(lines, since), config === null ? null : numericSetting(config, THRESHOLD_SETTING))
    if (verdict === "differs") return steps.fail("confirm", `the execute threshold in use differs from ${this.magicContextConfig.location()}`)
    const where = plugins.length === 0 ? "the running server has no location loaded" : `${plugins.length} locations load it (active): ${plugins.map((p) => p.directory).join(", ")}`
    return steps.pass(
      "confirm",
      `${where}; ${this.log.location()} since ${new Date(since).toISOString()}: 0 "config reload failed", execute threshold verdict ${verdict}`,
    )
  }

  /** Puts `previous` back (after a failed confirm, or for `follow --rollback`) and confirms it. */
  async revert(previous: string, steps: StepLog): Promise<boolean> {
    const since = this.clock.now()
    const change = await this.editor.set(previous)
    if (!change.ok) return steps.fail("rollback", change.reason)
    steps.pass("rollback", `${this.editor.location()}: ${JSON.stringify(change.previous)} → ${JSON.stringify(previous)} (backup ${change.backup})`)
    return this.confirm(previous, since, steps)
  }
}
