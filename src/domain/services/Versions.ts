/** Compares dotted numeric versions; a pre-release suffix is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string) => value.split("-")[0]!.split(".").map((part) => Number.parseInt(part, 10) || 0)
  const left = parts(a)
  const right = parts(b)
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}
