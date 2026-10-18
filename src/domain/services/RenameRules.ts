import { InvalidRenameRuleError } from "@session-manager/domain/errors/InvalidRenameRuleError"
import type { NameRename } from "@session-manager/domain/model/NameRename"
import type { MapRule } from "@session-manager/domain/model/SessionSync"

/** A name a folder may take: not empty, not `.` or `..`, no separator, no character that cannot continue a name. */
const NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/

/**
 * The renames `relocate --rename <folder>=<name>` rules give: `<folder>` is the folder's old absolute
 * POSIX path, `<name>` its new name in the same parent. Each rename is also a folder move (its
 * sessions move to the renamed folder, its absolute paths are rewritten), and its old name is
 * replaced wherever it stands as a whole name. Old names must be distinct, and no old name may be a
 * new one (a second run would rename again).
 */
export function renamesFromRules(rules: readonly MapRule[]): { readonly renames: readonly NameRename[]; readonly maps: readonly MapRule[] } {
  const renames: NameRename[] = []
  for (const rule of rules) {
    const label = `${rule.from}=${rule.to}`
    const folder = rule.from.length > 1 ? rule.from.replace(/\/+$/, "") : rule.from
    const split = folder.lastIndexOf("/")
    if (!folder.startsWith("/") || split < 0 || folder === "/") throw new InvalidRenameRuleError(label, "the folder must be absolute, and not /")
    const parent = split === 0 ? "/" : folder.slice(0, split)
    const from = folder.slice(split + 1)
    if (!NAME.test(from)) throw new InvalidRenameRuleError(label, "the folder's name can only hold letters, digits, ., _ and -")
    if (!NAME.test(rule.to)) throw new InvalidRenameRuleError(label, "the new name can only hold letters, digits, ., _ and -, and cannot start with .")
    if (rule.to === from) throw new InvalidRenameRuleError(label, "the new name is the old one")
    renames.push({ parent, from, to: rule.to })
  }
  const olds = new Set<string>()
  for (const rename of renames) {
    if (olds.has(rename.from)) throw new InvalidRenameRuleError(`${rename.parent}/${rename.from}=${rename.to}`, "two rules rename the same name")
    olds.add(rename.from)
  }
  for (const rename of renames)
    if (olds.has(rename.to)) throw new InvalidRenameRuleError(`${rename.parent}/${rename.from}=${rename.to}`, `${rename.to} is also renamed by another rule`)
  const join = (parent: string, name: string) => (parent === "/" ? `/${name}` : `${parent}/${name}`)
  return { renames, maps: renames.map((rename) => ({ from: join(rename.parent, rename.from), to: join(rename.parent, rename.to) })) }
}
