import { count, inArray, isNotNull, max } from "drizzle-orm"
import type { MagicContextSessionStats, MagicContextSummary } from "@session-manager/domain/model/SessionCatalog"
import type { MagicContextStorePort } from "@session-manager/domain/ports/outbound/MagicContextStorePort"
import { type Store, withStore } from "@session-manager/infrastructure/adapters/outbound/sqlite/engine/Store"
import { compartments, memories, notes, schemaMigrations, sessionProjects, tags } from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/magic-context"

/**
 * Reads a Magic Context `context.db`, read-only. Each count comes from its own table, and a table an
 * older format lacks counts as empty, so any format version can be listed.
 */
export class BunMagicContextStoreAdapter implements MagicContextStorePort {
  constructor() {}

  summary(dbPath: string): MagicContextSummary {
    return withStore(dbPath, "read", (store) => {
      const { orm } = store
      const perSession = (rows: { id: string | null; n: number; last?: bigint | null }[]) =>
        new Map(rows.filter((row) => row.id !== null).map((row) => [row.id!, { n: row.n, last: row.last === undefined || row.last === null ? null : Number(row.last) }]))
      const compartmentCounts = store.has(compartments, ["session_id"])
        ? perSession(orm.select({ id: compartments.session_id, n: count() }).from(compartments).groupBy(compartments.session_id).all())
        : new Map()
      const tagCounts = store.has(tags, ["session_id", "tag_number"])
        ? perSession(
            orm
              .select({ id: tags.session_id, n: count(), last: max(tags.tag_number) })
              .from(tags)
              .where(isNotNull(tags.session_id))
              .groupBy(tags.session_id)
              .all(),
          )
        : new Map()
      const noteCounts = store.has(notes, ["session_id"])
        ? perSession(orm.select({ id: notes.session_id, n: count() }).from(notes).where(isNotNull(notes.session_id)).groupBy(notes.session_id).all())
        : new Map()
      const memoryCounts = store.has(memories, ["source_session_id"])
        ? perSession(
            orm
              .select({ id: memories.source_session_id, n: count() })
              .from(memories)
              .where(isNotNull(memories.source_session_id))
              .groupBy(memories.source_session_id)
              .all(),
          )
        : new Map()
      // OpenCode 1 sessions are labelled `opencode`, OpenCode 2 sessions `opencode2`; the later label wins.
      const projects = new Map<string, string | null>()
      if (store.has(sessionProjects, ["session_id", "harness", "project_path"]))
        for (const row of orm
          .select({ id: sessionProjects.session_id, project: sessionProjects.project_path })
          .from(sessionProjects)
          .where(inArray(sessionProjects.harness, ["opencode", "opencode2"]))
          .orderBy(sessionProjects.harness)
          .all())
          if (row.id !== null) projects.set(row.id, row.project)

      const ids = new Set<string>([...compartmentCounts.keys(), ...tagCounts.keys(), ...noteCounts.keys(), ...memoryCounts.keys(), ...projects.keys()])
      const sessions: Record<string, MagicContextSessionStats> = {}
      for (const id of ids)
        sessions[id] = {
          compartments: compartmentCounts.get(id)?.n ?? 0,
          tags: tagCounts.get(id)?.n ?? 0,
          lastTag: tagCounts.get(id)?.last ?? null,
          notes: noteCounts.get(id)?.n ?? 0,
          memoriesOriginated: memoryCounts.get(id)?.n ?? 0,
          project: projects.get(id) ?? null,
        }
      return { available: true, schemaVersion: formatOf(store), sessions }
    })
  }

  formatVersion(dbPath: string): number | null {
    return withStore(dbPath, "read", formatOf)
  }
}

/** The highest applied Magic Context migration, or null for a store without the migration table. */
export function formatOf(store: Store): number | null {
  if (!store.has(schemaMigrations, ["version"])) return null
  const row = store.orm.select({ version: max(schemaMigrations.version) }).from(schemaMigrations).get()
  return row?.version === null || row?.version === undefined ? null : Number(row.version)
}
