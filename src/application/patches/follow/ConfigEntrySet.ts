import type { EntryChange, PluginEntryEditor } from "@session-manager/application/patches/follow/PluginEntryEditor"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"
import { magicContextEntries } from "@session-manager/domain/services/Jsonc"

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
const same = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index])

/** The Magic Context entry of each configuration file `follow` publishes to: opencode.jsonc and tui.jsonc. */
export interface ConfigEntries {
  readonly opencode: string | null
  readonly tui: string | null
}

interface Ready {
  readonly ok: true
  readonly bytes: Uint8Array
}

/** What `set` or `revert` changed: both files' previous entries and each file's own change record. */
export type ConfigEntryChange =
  | {
      readonly ok: true
      readonly previous: ConfigEntries
      readonly primary: EntryChange & { ok: true }
      readonly secondary: (EntryChange & { ok: true }) | null
    }
  | { readonly ok: false; readonly reason: string }

/**
 * The two files OpenCode's plugin list lives in: opencode.jsonc (the primary, always written) and
 * tui.jsonc (written only when it exists). Both are validated before either changes; a failure on
 * the second restores both byte for byte, and a rollback restores the second before the first.
 */
export class ConfigEntrySet {
  constructor(
    private readonly files: FilesPort,
    private readonly primary: PluginEntryEditor,
    private readonly secondary: PluginEntryEditor,
  ) {}

  location(): string {
    return this.primary.location()
  }

  secondaryLocation(): string {
    return this.secondary.location()
  }

  async current(): Promise<ConfigEntries> {
    return { opencode: await this.primary.current(), tui: await this.secondary.current() }
  }

  /** Whether this file holds exactly one Magic Context entry; a missing file is reported separately. */
  private async ready(editor: PluginEntryEditor): Promise<Ready | { ok: false; reason: string }> {
    const bytes = await this.files.read(editor.location())
    if (bytes === null) return { ok: false, reason: `${editor.location()} does not exist` }
    if (magicContextEntries(text(bytes)).length !== 1) {
      return { ok: false, reason: `${editor.location()} does not have exactly one Magic Context entry` }
    }
    return { ok: true, bytes }
  }

  async set(value: string): Promise<ConfigEntryChange> {
    const primary = await this.ready(this.primary)
    if (!primary.ok) return primary
    const secondary = await this.files.read(this.secondary.location())
    if (secondary !== null && magicContextEntries(text(secondary)).length !== 1) {
      return { ok: false, reason: `${this.secondary.location()} does not have exactly one Magic Context entry` }
    }
    const first = await this.primary.set(value)
    if (!first.ok) return first
    if (secondary === null) return { ok: true, previous: { opencode: first.previous, tui: null }, primary: first, secondary: null }
    const second = await this.secondary.set(value)
    if (second.ok) return { ok: true, previous: { opencode: first.previous, tui: second.previous }, primary: first, secondary: second }
    // The second write failed after the first succeeded. Put back whatever the second partly wrote,
    // then the first, and report both paths and the original checksum if the first cannot be put back.
    const partly = await this.files.read(this.secondary.location())
    let secondBack = ""
    if (partly !== null && same(partly, secondary) === false) {
      try {
        await this.files.replace(this.secondary.location(), secondary)
      } catch (error) {
        secondBack = `; ${this.secondary.location()} could not be restored: ${error instanceof Error ? error.message : String(error)}`
      }
    }
    try {
      await this.files.replace(this.primary.location(), primary.bytes)
    } catch (error) {
      return {
        ok: false,
        reason: `${second.reason}; ${this.primary.location()} could not be restored (original sha256 ${first.from}): ${error instanceof Error ? error.message : String(error)}${secondBack}`,
      }
    }
    const restored = await this.files.read(this.primary.location())
    if (restored === null || !same(restored, primary.bytes)) {
      return {
        ok: false,
        reason: `${second.reason}; ${this.primary.location()} did not read back its original bytes (original sha256 ${first.from}); ${this.secondary.location()} was restored when partly written${secondBack}`,
      }
    }
    return {
      ok: false,
      reason: `${second.reason}; ${this.primary.location()} restored to its original bytes (sha256 ${first.from}); ${this.secondary.location()} restored when partly written${secondBack}`,
    }
  }

  /** Restores the secondary first, so a failure there leaves the primary untouched. */
  async revert(previous: ConfigEntries): Promise<ConfigEntryChange> {
    const before = await this.current()
    if (previous.opencode === null) return { ok: false, reason: `${this.primary.location()} has no recorded entry` }
    let second: (EntryChange & { ok: true }) | null = null
    let secondaryBefore: Uint8Array | null = null
    if (previous.tui !== null) {
      secondaryBefore = await this.files.read(this.secondary.location())
      if (secondaryBefore === null) return { ok: false, reason: `${this.secondary.location()} does not exist` }
      const changed = await this.secondary.set(previous.tui)
      if (!changed.ok) return changed
      second = changed
    }
    const first = await this.primary.set(previous.opencode)
    if (!first.ok) {
      if (second !== null && secondaryBefore !== null) {
        try {
          await this.files.replace(this.secondary.location(), secondaryBefore)
        } catch {
          return { ok: false, reason: `${first.reason}; ${this.secondary.location()} could not be put back after its change` }
        }
      }
      return first
    }
    return { ok: true, previous: before, primary: first, secondary: second }
  }
}
