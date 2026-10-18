import { createHash } from "node:crypto"
import { eq, inArray, like } from "drizzle-orm"
import type { TextRewrite } from "@session-manager/domain/ports/outbound/RelocationStorePort"
import type { Orm, Store } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"
import { anyOf, minimalHints } from "@session-manager/infrastructure/adapters/outbound/sqlite/TextRelocation"
import { instructionBlob, instructionState } from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/opencode"

/** OpenCode's canonical JSON of an instruction value: object keys sorted, nothing else changed (`instructions/index.ts`). */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`
  return JSON.stringify(value)
}

/** The address OpenCode gives an instruction value: sha256 of its canonical JSON, in hex. */
export function instructionHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex")
}

export interface BlobRewrite {
  /** Blobs whose text changed, each now stored under the address of its new text. */
  readonly rows: number
  /** Blobs that still name an old folder or name after the rewrite, or whose rewritten text is no JSON. */
  readonly residual: number
}

type Values = Record<string, string>

/**
 * Rewrites OpenCode's instruction blobs (`instruction_blob`, each addressed by the hash of its
 * value) that name an old folder or a renamed name: the rewritten value is stored under its own
 * address, every instruction state in scope (`initial_values`, `current_values`: key → address)
 * points at it, and the old blob is removed once nothing points at it. So a moved session's
 * instructions are what OpenCode would have stored had it always run in the new folder, and the
 * next observation of that folder finds them unchanged.
 */
export function rewriteInstructionBlobs(store: Store, orm: Orm, rewrite: TextRewrite, sessions: readonly string[] | null): BlobRewrite {
  if (!store.has(instructionBlob, ["hash", "value"]) || !store.has(instructionState, ["session_id", "initial_values", "current_values"])) return { rows: 0, residual: 0 }
  const needles = minimalHints([...rewrite.hints, ...(rewrite.names?.needles ?? [])])
  const naming = anyOf(needles.map((needle) => like(instructionBlob.value, `%${needle}%`)))
  if (naming === undefined) return { rows: 0, residual: 0 }
  const states = (
    orm
      .select({ session_id: instructionState.session_id, initial_values: instructionState.initial_values, current_values: instructionState.current_values })
      .from(instructionState)
      .where(sessions === null ? undefined : inArray(instructionState.session_id, [...sessions]))
      .all() as { session_id: string; initial_values: string; current_values: string }[]
  ).map((row) => ({ id: row.session_id, initial: JSON.parse(row.initial_values) as Values, current: JSON.parse(row.current_values) as Values }))
  const referenced = new Set(states.flatMap((state) => [...Object.values(state.initial), ...Object.values(state.current)]))

  const moved = new Map<string, string>()
  let residual = 0
  for (const blob of orm.select({ hash: instructionBlob.hash, value: instructionBlob.value }).from(instructionBlob).where(naming).all() as { hash: string; value: string }[]) {
    // In a session scope, only the blobs those sessions point at.
    if (sessions !== null && !referenced.has(blob.hash)) continue
    const value = rewrite.rewriter.rewrite(blob.value)
    if (value === blob.value) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      residual++
      continue
    }
    if (rewrite.rewriter.residual(value)) residual++
    const hash = instructionHash(parsed)
    store.insert(orm, instructionBlob, { hash, value }, { ignore: true })
    moved.set(blob.hash, hash)
  }

  const repoint = (values: Values): Values => Object.fromEntries(Object.entries(values).map(([key, hash]) => [key, moved.get(hash) ?? hash]))
  for (const state of states) {
    const initial = repoint(state.initial)
    const current = repoint(state.current)
    if (JSON.stringify(initial) === JSON.stringify(state.initial) && JSON.stringify(current) === JSON.stringify(state.current)) continue
    store.update(orm, instructionState, { session_id: state.id }, { initial_values: JSON.stringify(initial), current_values: JSON.stringify(current) })
  }
  // An old blob another session (outside the scope) still points at stays.
  for (const old of moved.keys()) {
    const pointing = orm
      .select({ session_id: instructionState.session_id })
      .from(instructionState)
      .where(anyOf([like(instructionState.initial_values, `%${old}%`), like(instructionState.current_values, `%${old}%`)]))
      .get()
    if (pointing === undefined) orm.delete(instructionBlob).where(eq(instructionBlob.hash, old)).run()
  }
  return { rows: moved.size, residual }
}
