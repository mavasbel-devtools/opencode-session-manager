import { UNTOUCHED_TABLES, type RewriteReport } from "@session-manager/domain/model/Migration"
import type { MigrationDatabase } from "@session-manager/domain/ports/outbound/MigrationStorePort"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"

function parses(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * Rewrites every TEXT cell of every table except the untouched ones. The rewrite edits paths in
 * place inside the raw text, so a JSON cell is never re-serialized; each changed cell that was
 * valid JSON is parsed again afterwards, and any that no longer parses is counted as broken.
 */
export class RewriteService {
  constructor() {}

  rewrite(db: MigrationDatabase, rewriter: TextRewriter, source: string): RewriteReport {
    const byColumn: Record<string, number> = {}
    let broken = 0
    let total = 0
    for (const table of db.tables().filter((name) => !UNTOUCHED_TABLES.includes(name))) {
      for (const column of db.columns(table)) {
        const written = db.editText(table, column, (value) => {
          const next = rewriter.rewrite(value)
          if (next !== value && /^\s*[[{"]/.test(value) && parses(value) && !parses(next)) broken++
          return next
        })
        if (written > 0) byColumn[`${table}.${column}`] = written
        total += written
      }
    }
    return { source, cells_rewritten: total, by_column: byColumn, json_broken: broken }
  }
}
