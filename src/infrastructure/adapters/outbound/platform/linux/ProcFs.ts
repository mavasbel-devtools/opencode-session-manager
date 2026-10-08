/**
 * Reading `/proc` races with processes that exit mid-scan and meets processes another user owns, so
 * every read of a per-process entry falls back to a value instead of failing the whole scan.
 */
export function readProc<T>(action: () => T, fallback: T): T {
  try {
    return action()
  } catch {
    return fallback
  }
}

/** The numeric entries of a `/proc`-shaped directory: one per process. */
export function isPid(entry: string): boolean {
  return /^\d+$/.test(entry)
}
