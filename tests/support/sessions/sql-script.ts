import type { Database } from "bun:sqlite"

/**
 * The statements of an SQL script, split at each `;` outside quotes, comments, a trigger's
 * `BEGIN … END` and a `CASE … END` (no script here uses `BEGIN TRANSACTION`).
 */
export function statementsOf(script: string): string[] {
  const statements: string[] = []
  let current = ""
  let depth = 0
  let i = 0
  while (i < script.length) {
    const char = script[i]!
    if (char === "'" || char === '"') {
      const end = script.indexOf(char, i + 1)
      const stop = end === -1 ? script.length : end + 1
      current += script.slice(i, stop)
      i = stop
      continue
    }
    if (script.startsWith("--", i)) {
      const end = script.indexOf("\n", i)
      i = end === -1 ? script.length : end
      continue
    }
    const word = /^[A-Za-z_]+/.exec(script.slice(i))?.[0]
    if (word !== undefined && !/[A-Za-z0-9_]/.test(script[i - 1] ?? " ")) {
      if (word.toUpperCase() === "BEGIN" || word.toUpperCase() === "CASE") depth += 1
      else if (word.toUpperCase() === "END" && depth > 0) depth -= 1
      current += word
      i += word.length
      continue
    }
    if (char === ";" && depth === 0) {
      if (current.trim() !== "") statements.push(current.trim())
      current = ""
    } else current += char
    i += 1
  }
  if (current.trim() !== "") statements.push(current.trim())
  return statements
}

/**
 * Runs a script one statement at a time. Bun 1.4's `Database.exec` with several statements stops
 * reporting errors of all but the last, so a fixture statement that fails would go unnoticed.
 */
export function runScript(db: Database, script: string): void {
  for (const statement of statementsOf(script)) db.exec(statement)
}
