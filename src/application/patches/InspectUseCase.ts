import type { InstallationCatalog } from "@session-manager/application/patches/InstallationCatalog"
import { PatchError } from "@session-manager/domain/errors/PatchError"
import type { PatchDefinition, PatchRelease } from "@session-manager/domain/model/patches/Patch"
import type { InspectFile, InspectFinding, InspectReport } from "@session-manager/domain/model/patches/Reports"
import type { PatchInspectPort } from "@session-manager/domain/ports/inbound/PatchInspectPort"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"
import type { HashPort } from "@session-manager/domain/ports/outbound/HashPort"
import { occurrences } from "@session-manager/domain/services/patches/PatchRules"
import { compareVersions } from "@session-manager/domain/services/Versions"

const CONTEXT = 60
const SNIPPETS = 3

function snippets(text: string, needle: string): string[] {
  const out: string[] = []
  let at = text.indexOf(needle)
  while (at !== -1 && out.length < SNIPPETS) {
    out.push(text.slice(Math.max(0, at - CONTEXT), at + needle.length + CONTEXT).replace(/\s+/g, " "))
    at = text.indexOf(needle, at + needle.length)
  }
  return out
}

/**
 * For a version a patch has not been checked against: where the text the patch replaces occurs in
 * the new version's bundled JavaScript, with counts, checksums and context, for a person to review
 * before adding that version to the patch. Reads only.
 */
export class InspectUseCase implements PatchInspectPort {
  constructor(
    private readonly catalog: InstallationCatalog,
    private readonly files: FilesPort,
    private readonly hash: HashPort,
    private readonly patches: readonly PatchDefinition[],
  ) {}

  async inspect(version: string): Promise<InspectReport> {
    const roots = (await this.catalog.load()).installations.filter((i) => i.version === version).map((i) => i.root)
    if (roots.length === 0) throw new PatchError("not-installed", `Magic Context ${version} is not installed`)
    const root = roots[0]!
    const scripts = await this.files.list(`${root}/dist`, ".js")
    const contents = new Map<string, { text: string; sha: string }>()
    for (const script of scripts) {
      const bytes = (await this.files.read(`${root}/dist/${script}`))!
      contents.set(`dist/${script}`, { text: new TextDecoder().decode(bytes), sha: this.hash.sha256(bytes) })
    }
    const findings = this.patches.flatMap((patch) => this.findingsFor(patch, contents))
    return { version, roots, findings }
  }

  private findingsFor(patch: PatchDefinition, contents: ReadonlyMap<string, { text: string; sha: string }>): InspectFinding[] {
    const newest: PatchRelease = [...patch.releases].sort((a, b) => compareVersions(b.version, a.version))[0]!
    const replacements = new Map(newest.files.flatMap((file) => file.replacements.map((r) => [r.find, r] as const)))
    return [...replacements.values()].map((r) => {
      const files: InspectFile[] = []
      for (const [path, { text, sha }] of contents) {
        const count = occurrences(text, r.find)
        const replaced = occurrences(text, r.replace)
        if (count === 0 && replaced === 0) continue
        const checked = newest.files.find((file) => file.path === path)
        const expected = checked?.replacements.find((other) => other.find === r.find)?.count ?? null
        const sameAsChecked = checked !== undefined && (sha === checked.before || sha === checked.after)
        files.push({ path, count, expected, replaced, sha, sameAsChecked, snippets: snippets(text, count > 0 ? r.find : r.replace) })
      }
      return { patch: patch.id, checkedVersion: newest.version, find: r.find, files }
    })
  }
}
