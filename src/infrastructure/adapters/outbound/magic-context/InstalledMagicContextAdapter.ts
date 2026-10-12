import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { MagicContextRelease, MagicContextUpgradeOutcome } from "@session-manager/domain/model/MagicContextRelease"
import type { MagicContextReleasePort } from "@session-manager/domain/ports/outbound/MagicContextReleasePort"
import { compareVersions } from "@session-manager/domain/services/Versions"

const PACKAGE = ["@cortexkit", "opencode-magic-context"] as const

/**
 * Runs inside a child process with the plugin's own code: `probe` prints the newest format the
 * release writes; `upgrade` opens a store copy the way the plugin opens its live store at startup
 * (schema fence, migration guard, table creation, migrations) and prints the format it reached.
 */
const RUNNER = `const [mode, entry, dbPath] = process.argv.slice(2)
const mc = await import(entry)
if (mode === "probe") {
  console.log(JSON.stringify({ latest: mc.LATEST_SUPPORTED_VERSION }))
  process.exit(0)
}
const db = await mc.openDatabaseAsync({ dbPath })
if (!db) {
  const detail = { fence: mc.getSchemaFenceRejection?.() ?? null, refusal: mc.getMigrationOnOpenRefusal?.() ?? null }
  console.log(JSON.stringify({ ok: false, detail: "refused: " + JSON.stringify(detail) }))
  process.exit(3)
}
const format = mc.getPersistedSchemaVersion(db)
db.close()
console.log(JSON.stringify({ ok: true, format }))
process.exit(0)
`

interface Candidate {
  readonly directory: string
  readonly version: string
  readonly entry: string
}

/**
 * The Magic Context plugin OpenCode installed, found in OpenCode's package cache
 * (`<cache>/npm/@cortexkit/opencode-magic-context@<tag>/<stamp>/node_modules/…` and
 * `<cache>/packages/@cortexkit/opencode-magic-context@<version>/node_modules/…`) or at an explicit
 * package folder; the newest version wins. Its code runs only in a child process whose XDG folders
 * point into a throwaway sandbox, so it never sees the live stores, configuration or logs.
 */
export class InstalledMagicContextAdapter implements MagicContextReleasePort {
  private readonly cacheRoots: readonly string[]
  private readonly packageOverride: string | undefined
  private readonly executable: string
  private readonly temporaryDirectory: string
  private release: MagicContextRelease | null | undefined
  private readonly entries = new Map<string, string>()

  constructor(cacheRoots: readonly string[], packageOverride: string | undefined, executable: string, temporaryDirectory: string) {
    this.cacheRoots = cacheRoots
    this.packageOverride = packageOverride
    this.executable = executable
    this.temporaryDirectory = temporaryDirectory
  }

  searched(): readonly string[] {
    return this.packageOverride === undefined ? this.cacheRoots : [this.packageOverride]
  }

  installed(): MagicContextRelease | null {
    if (this.release !== undefined) return this.release
    const newest = this.candidates().sort((a, b) => compareVersions(b.version, a.version))[0]
    this.release = null
    if (newest === undefined) return null
    const probe = this.run(["probe", newest.entry])
    if (typeof probe?.["latest"] !== "number") return null
    this.entries.set(newest.directory, newest.entry)
    this.release = { version: newest.version, latestFormat: probe["latest"], packageDirectory: newest.directory }
    return this.release
  }

  upgrade(release: MagicContextRelease, copyPath: string): MagicContextUpgradeOutcome {
    const entry = this.entries.get(release.packageDirectory) ?? entryOf(release.packageDirectory)
    if (entry === undefined) return { ok: false, detail: `no store entry in ${release.packageDirectory}` }
    const result = this.run(["upgrade", entry, copyPath])
    if (result?.["ok"] === true && typeof result["format"] === "number") return { ok: true, format: result["format"] }
    return { ok: false, detail: typeof result?.["detail"] === "string" ? result["detail"] : "the upgrade did not report a result" }
  }

  private candidates(): Candidate[] {
    const directories =
      this.packageOverride === undefined ? this.cacheRoots.flatMap(packagesIn) : [this.packageOverride]
    return directories.flatMap((directory) => {
      const version = versionOf(directory)
      const entry = entryOf(directory)
      return version === undefined || entry === undefined ? [] : [{ directory, version, entry }]
    })
  }

  /** Runs the runner in a sandbox; the last line of its output is its JSON answer. */
  private run(args: readonly string[]): Record<string, unknown> | undefined {
    const sandbox = mkdtempSync(join(this.temporaryDirectory, "osm-magic-context-"))
    try {
      const runner = join(sandbox, "runner.mjs")
      writeFileSync(runner, RUNNER)
      const env: Record<string, string | undefined> = { ...process.env, BUN_BE_BUN: "1" }
      for (const [name, folder] of [["XDG_DATA_HOME", "data"], ["XDG_STATE_HOME", "state"], ["XDG_CACHE_HOME", "cache"], ["XDG_CONFIG_HOME", "config"]])
        env[name!] = join(sandbox, folder!)
      const child = Bun.spawnSync([this.executable, runner, ...args], { env, cwd: sandbox, stdout: "pipe", stderr: "pipe" })
      const last = child.stdout.toString().trim().split("\n").at(-1) ?? ""
      try {
        return JSON.parse(last) as Record<string, unknown>
      } catch {
        const lines = child.stderr.toString().split("\n").map((line) => line.trim()).filter(Boolean)
        const message = lines.find((line) => /^(?:error|\w*Error)\b/i.test(line)) ?? lines.at(-1) ?? "no output"
        return { ok: false, detail: `exit ${child.exitCode}: ${message}` }
      }
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  }
}

function packagesIn(cacheRoot: string): string[] {
  const scope = (folder: string) => join(folder, "node_modules", ...PACKAGE)
  const found: string[] = []
  for (const kind of ["npm", "packages"]) {
    const base = join(cacheRoot, kind, PACKAGE[0])
    if (!existsSync(base)) continue
    for (const pinned of readdirSync(base).filter((name) => name.startsWith(`${PACKAGE[1]}@`))) {
      const folder = join(base, pinned)
      if (kind === "packages") found.push(scope(folder))
      else for (const stamp of readdirSync(folder)) found.push(scope(join(folder, stamp)))
    }
  }
  return found
}

function versionOf(directory: string): string | undefined {
  try {
    const version = (JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { version?: unknown }).version
    return typeof version === "string" ? version : undefined
  } catch {
    return undefined
  }
}

/** The bundle chunk that exports the store's open-and-migrate entry points. */
function entryOf(directory: string): string | undefined {
  const dist = join(directory, "dist")
  if (!existsSync(dist)) return undefined
  return readdirSync(dist)
    .filter((name) => name.endsWith(".js"))
    .sort()
    .map((name) => join(dist, name))
    .find((file) => /export\s*\{[^}]*\bopenDatabaseAsync\b[^}]*\bLATEST_SUPPORTED_VERSION\b|export\s*\{[^}]*\bLATEST_SUPPORTED_VERSION\b[^}]*\bopenDatabaseAsync\b/.test(readFileSync(file, "utf8")))
}
