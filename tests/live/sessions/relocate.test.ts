import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { removeTemporary } from "@test/support/maintenance/temporary"
import { type SandboxServer, serveSandbox } from "@test/support/live/sandbox-opencode"

/**
 * `relocate` on a copy of this machine's profile, in a sandbox (the live stores are only read):
 * OPENCODE_SM_LIVE_RELOCATE_MAP names the folder moves (`<from>=<to>`, separated by `;`), as the
 * user would pass them, and OPENCODE_SM_LIVE_RELOCATE_RENAME the folders renamed in place
 * (`<folder>=<name>`, separated by `;`): then no stored text may still name an old name as a whole
 * name, and the second run must find nothing left to do. The dry run and the run must pass every check; afterwards `verify` must
 * find no project mismatch for a moved session, a sandboxed real OpenCode 2 must list every moved
 * session under its new folder and none under the old one, and `rollback` must restore both
 * stores byte for byte. Without either variable there is nothing to relocate, and the test is skipped.
 */
const dataHome = process.env["XDG_DATA_HOME"] || join(process.env["HOME"] ?? homedir(), ".local", "share")
const rules = (process.env["OPENCODE_SM_LIVE_RELOCATE_MAP"] ?? "")
  .split(";")
  .map((rule) => rule.trim())
  .filter((rule) => rule.length > 0)
const renames = (process.env["OPENCODE_SM_LIVE_RELOCATE_RENAME"] ?? "")
  .split(";")
  .map((rule) => rule.trim())
  .filter((rule) => rule.length > 0)
const cli = fileURLToPath(new URL("../../../src/main/cli/cli.ts", import.meta.url))
let sandbox = ""
let server: SandboxServer | null = null

const data = () => join(sandbox, "data")
const opencodeDb = () => join(data(), "opencode", "opencode.db")
const contextDb = () => join(data(), "cortexkit", "magic-context", "context.db")
const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex")

function run(...argv: string[]) {
  const result = Bun.spawnSync([process.execPath, cli, ...argv], { env: { ...process.env } })
  return { code: result.exitCode, out: result.stdout.toString(), err: result.stderr.toString() }
}

function copy(from: string, to: string) {
  mkdirSync(join(to, ".."), { recursive: true })
  const db = new Database(from, { readonly: true })
  try {
    db.query(`vacuum into '${to.replaceAll("'", "''")}'`).run()
  } finally {
    db.close()
  }
}

describe.skipIf(rules.length + renames.length === 0 || !existsSync(join(dataHome, "opencode", "opencode.db")))("relocate on a copy of this machine's profile, checked by the real OpenCode 2", () => {
  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), "oc-sm-live-relocate-"))
    copy(join(dataHome, "opencode", "opencode.db"), opencodeDb())
    const context = join(dataHome, "cortexkit", "magic-context", "context.db")
    if (existsSync(context)) copy(context, contextDb())
  })
  afterAll(async () => {
    await server?.stop()
    removeTemporary(sandbox)
  })

  it(
    "moves the sessions, OpenCode lists them in their new folders, and rollback restores both stores",
    async () => {
      const maps = [...rules.flatMap((rule) => ["--map", rule]), ...renames.flatMap((rule) => ["--rename", rule])]
      const before = [sha(opencodeDb()), ...(existsSync(contextDb()) ? [sha(contextDb())] : [])]
      const dry = run("relocate", "--data", data(), ...maps, "--all", "--dry-run", "--json")
      expect([dry.code, dry.err]).toEqual([0, ""])
      const rehearsed = JSON.parse(dry.out) as { sessions: { id: string; to_directory: string }[]; failed: string[] }
      expect(rehearsed.failed).toEqual([])
      expect(rehearsed.sessions.length).toBeGreaterThan(0)

      const done = run("relocate", "--data", data(), ...maps, "--all", "--json")
      expect([done.code, done.err]).toEqual([0, ""])
      const report = JSON.parse(done.out) as { sessions: { id: string; from_directory: string; to_directory: string }[]; backup_dir: string; failed: string[] }
      expect(report.failed).toEqual([])
      expect(report.sessions.map((session) => session.id)).toEqual(rehearsed.sessions.map((session) => session.id))

      // Every renamed name is gone as a whole name, and nothing is left to do.
      const report2 = report as unknown as { text: { residual: Record<string, number> }; context_text: { residual: Record<string, number> } | null }
      expect([report2.text.residual, report2.context_text?.residual ?? {}]).toEqual([{}, {}])
      const again = run("relocate", "--data", data(), ...maps, "--all", "--json")
      expect([again.code, (JSON.parse(again.out) as { sessions: unknown[]; backup_dir: string | null }).backup_dir]).toEqual([0, null])

      const verified = run("verify", "--data", data(), "--json")
      const findings = (JSON.parse(verified.out) as { findings: { kind: string; session_id: string | null }[] }).findings
      const moved = new Set(report.sessions.map((session) => session.id))
      expect(findings.filter((finding) => finding.kind.includes("project-mismatch") && finding.session_id !== null && moved.has(finding.session_id))).toEqual([])

      server = await serveSandbox(sandbox)
      const store = new Database(opencodeDb(), { readonly: true })
      try {
        for (const folder of new Set(report.sessions.map((session) => session.to_directory))) {
          const listed = await server.get(`/api/session?directory=${encodeURIComponent(folder)}&limit=1000`)
          expect(listed.status).toBe(200)
          const ids = new Set(((listed.body as { data: { id: string }[] }).data ?? []).map((entry) => entry.id))
          const expected = (store.query("select id from session_v2 where directory = ?").all(folder) as { id: string }[]).map((row) => row.id)
          for (const id of expected) expect(ids.has(id)).toBe(true)
        }
        for (const folder of new Set(report.sessions.map((session) => session.from_directory))) {
          const listed = await server.get(`/api/session?directory=${encodeURIComponent(folder)}&limit=1000`)
          const ids = ((listed.body as { data?: { id: string }[] }).data ?? []).map((entry) => entry.id)
          expect(ids.filter((id) => moved.has(id))).toEqual([])
        }
      } finally {
        store.close()
      }
      await server.stop()
      server = null

      const databases = [opencodeDb(), ...(existsSync(contextDb()) ? [contextDb()] : [])]
      const rolled = run("rollback", report.backup_dir, ...databases.flatMap((db) => ["--db", db]))
      expect(rolled.code).toBe(0)
      expect(databases.map(sha)).toEqual(before)
    },
    10 * 60_000,
  )
})
