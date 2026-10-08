import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/**
 * A stand-in for the installed Magic Context package: the same exports the session manager calls,
 * backed by real SQLite. `openDatabaseAsync` refuses a store holding a `refuse_upgrade` table (the
 * way the real fence refuses), and otherwise records every format up to `latest`.
 */
export function makeMagicContextPackage(directory: string, options: { readonly version: string; readonly latest: unknown; readonly entry?: boolean }): string {
  mkdirSync(join(directory, "dist"), { recursive: true })
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "@cortexkit/opencode-magic-context", version: options.version }))
  writeFileSync(join(directory, "dist", "a-other.js"), "export const unrelated = 1\n")
  if (options.entry === false) return directory
  writeFileSync(
    join(directory, "dist", "index-entry.js"),
    `import { Database } from "bun:sqlite"
const LATEST_SUPPORTED_VERSION = ${JSON.stringify(options.latest)}
let refusal = null
function getPersistedSchemaVersion(db) {
  return db.query("select max(version) as v from schema_migrations").get().v ?? 0
}
async function openDatabaseAsync({ dbPath }) {
  const db = new Database(dbPath)
  if (db.query("select name from sqlite_master where name = 'refuse_upgrade'").get()) {
    refusal = { reason: "test refusal" }
    db.close()
    return null
  }
  if (db.query("select name from sqlite_master where name = 'crash_upgrade'").get()) throw new Error("crashed on purpose")
  db.exec("create table if not exists schema_migrations (version integer primary key, description text not null, applied_at integer not null)")
  for (let version = getPersistedSchemaVersion(db) + 1; version <= LATEST_SUPPORTED_VERSION; version++)
    db.query("insert into schema_migrations values (?, 'step', 0)").run(version)
  return db
}
function getSchemaFenceRejection() { return null }
function getMigrationOnOpenRefusal() { return refusal }
export { LATEST_SUPPORTED_VERSION, openDatabaseAsync, getPersistedSchemaVersion, getSchemaFenceRejection, getMigrationOnOpenRefusal };
`,
  )
  return directory
}

/** Where OpenCode's package cache puts a plugin: `npm/<scope>/<name>@<tag>/<stamp>/node_modules/…` or `packages/<scope>/<name>@<version>/node_modules/…`. */
export function cachedPackageDirectory(cacheRoot: string, kind: "npm" | "packages", pin: string, stamp = "1"): string {
  const pinned = join(cacheRoot, kind, "@cortexkit", `opencode-magic-context@${pin}`)
  return join(kind === "npm" ? join(pinned, stamp) : pinned, "node_modules", "@cortexkit", "opencode-magic-context")
}
