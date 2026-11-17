/** Compares versions in semver 2.0.0 §11 order; build metadata is ignored. */
export function compareVersions(a: string, b: string): number {
  const split = (value: string) => {
    const withoutBuild = value.split("+")[0]!
    const dash = withoutBuild.indexOf("-")
    const core = (dash < 0 ? withoutBuild : withoutBuild.slice(0, dash)).split(".").map((part) => Number.parseInt(part, 10) || 0)
    const pre = dash < 0 ? null : withoutBuild.slice(dash + 1).split(".")
    return { core, pre }
  }
  const left = split(a)
  const right = split(b)
  for (let index = 0; index < Math.max(left.core.length, right.core.length); index++) {
    const difference = (left.core[index] ?? 0) - (right.core[index] ?? 0)
    if (difference !== 0) return difference
  }
  if (left.pre === null) return right.pre === null ? 0 : 1
  if (right.pre === null) return -1
  const numeric = /^\d+$/
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index++) {
    const l = left.pre[index]
    const r = right.pre[index]
    if (l === undefined) return -1
    if (r === undefined) return 1
    if (l === r) continue
    const lNumeric = numeric.test(l)
    const rNumeric = numeric.test(r)
    if (lNumeric && rNumeric) {
      const difference = Number.parseInt(l, 10) - Number.parseInt(r, 10)
      if (difference !== 0) return difference
    } else if (lNumeric) {
      return -1
    } else if (rNumeric) {
      return 1
    } else {
      return l < r ? -1 : 1
    }
  }
  return 0
}
