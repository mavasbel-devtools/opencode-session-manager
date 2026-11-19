import type { BackupPort } from "@session-manager/domain/ports/outbound/BackupPort"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"
import type { HashPort } from "@session-manager/domain/ports/outbound/HashPort"
import { magicContextEntry, replaceMagicContextEntry } from "@session-manager/domain/services/Jsonc"

export type EntryChange =
  | { readonly ok: true; readonly previous: string; readonly backup: string; readonly from: string; readonly to: string }
  | { readonly ok: false; readonly reason: string }

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

/**
 * The only configuration this tool edits: the one Magic Context entry of opencode.jsonc. Every
 * change backs up the whole file first, replaces it in one step with only that string literal
 * changed, reads it back, and puts the original back when the result is not exactly the intended text.
 */
export class PluginEntryEditor {
  constructor(
    private readonly files: FilesPort,
    private readonly hash: HashPort,
    private readonly backups: BackupPort,
    private readonly config: string,
    private readonly label: string,
  ) {}

  location(): string {
    return this.config
  }

  async current(): Promise<string | null> {
    const bytes = await this.files.read(this.config)
    return bytes === null ? null : magicContextEntry(text(bytes))
  }

  async set(value: string): Promise<EntryChange> {
    const bytes = await this.files.read(this.config)
    if (bytes === null) return { ok: false, reason: `${this.config} does not exist` }
    const original = text(bytes)
    const previous = magicContextEntry(original)
    const next = replaceMagicContextEntry(original, value)
    if (previous === null || next === null) return { ok: false, reason: `${this.config} does not have exactly one Magic Context entry` }
    const from = this.hash.sha256(bytes)
    const backup = await this.backups.save({ version: "config", patch: "follow", path: this.label, sha: from }, bytes)
    const encoded = new TextEncoder().encode(next)
    try {
      await this.files.replace(this.config, encoded)
    } catch (error) {
      return { ok: false, reason: `${this.config} could not be written: ${error instanceof Error ? error.message : String(error)}` }
    }
    const reread = await this.files.read(this.config)
    if (reread === null || text(reread) !== next) {
      try {
        await this.files.replace(this.config, bytes)
      } catch (error) {
        return { ok: false, reason: `${this.config} did not read back as written; it could not be restored (backup ${backup}): ${error instanceof Error ? error.message : String(error)}` }
      }
      return { ok: false, reason: `${this.config} did not read back as written; the original is back (backup ${backup})` }
    }
    return { ok: true, previous, backup, from, to: this.hash.sha256(encoded) }
  }
}
