import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { BunSessionSyncStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunSessionSyncStoreAdapter"
import { OpencodeIdentifiersAdapter } from "@session-manager/infrastructure/adapters/outbound/system/OpencodeIdentifiersAdapter"
import { removeTemporary } from "@test/support/maintenance/temporary"
import { requireOpenCode } from "@test/support/live/process"

/**
 * Forks against the real OpenCode 2 on a copy of this machine's store, in a sandbox (its own
 * data, state, cache and config folders; the live store is only read): `fork` through a sandboxed
 * `opencode serve` makes OpenCode's own fork; the offline writer (`sync --diverged fork`) forks
 * the same session in the same store; the two must match row for row (but their ids, slug and
 * creation time), and the sandboxed OpenCode must read the offline fork and fork it again.
 * OPENCODE_SM_LIVE_FORK_SESSION names the session (else the smallest one with 5–80 messages whose folder exists).
 */
const live = join(process.env["XDG_DATA_HOME"] || join(process.env["HOME"] ?? homedir(), ".local", "share"), "opencode", "opencode.db")
const cli = fileURLToPath(new URL("../../../src/main/cli/cli.ts", import.meta.url))
let sandbox = ""
let server: { url: string; password: string; stop: () => Promise<void> } | null = null

const env = () => ({
  ...process.env,
  XDG_DATA_HOME: join(sandbox, "data"),
  XDG_STATE_HOME: join(sandbox, "state"),
  XDG_CACHE_HOME: join(sandbox, "cache"),
  XDG_CONFIG_HOME: join(sandbox, "config"),
})

/** A sandboxed `opencode serve` on the copied store, recorded in the sandbox's service.json as the service records itself. */
async function serve(): Promise<NonNullable<typeof server>> {
  const port = 49_000 + Math.floor(Math.random() * 900)
  const child = Bun.spawn([requireOpenCode(), "serve", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: sandbox, env: env(), stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const reader = child.stdout.getReader()
  let text = ""
  const deadline = Date.now() + 60_000
  while (!/server password (\S+)/.test(text) || !text.includes("server listening")) {
    if (Date.now() > deadline) throw new Error(`opencode serve did not start:\n${text}`)
    const { value, done } = await reader.read()
    if (done) throw new Error(`opencode serve exited:\n${text}`)
    text += new TextDecoder().decode(value)
  }
  reader.releaseLock()
  const password = text.match(/server password (\S+)/)![1]!
  const url = `http://127.0.0.1:${port}`
  mkdirSync(join(sandbox, "state", "opencode"), { recursive: true })
  writeFileSync(join(sandbox, "state", "opencode", "service.json"), JSON.stringify({ url, password }))
  return {
    url,
    password,
    stop: async () => {
      child.kill()
      await child.exited
    },
  }
}

async function get(path: string): Promise<{ data: unknown }> {
  const response = await fetch(`${server!.url}${path}`, { headers: { Authorization: `Basic ${Buffer.from(`opencode:${server!.password}`).toString("base64")}` } })
  expect(response.status).toBe(200)
  return (await response.json()) as { data: unknown }
}

const store = () => join(sandbox, "data", "opencode", "opencode.db")

describe.skipIf(!existsSync(live))("forks against the real OpenCode 2, in a sandbox", () => {
  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), "oc-sm-live-fork-"))
    mkdirSync(join(sandbox, "data", "opencode"), { recursive: true })
    const source = new Database(live, { readonly: true })
    try {
      source.query(`vacuum into '${store().replaceAll("'", "''")}'`).run()
    } finally {
      source.close()
    }
  })
  afterAll(async () => {
    await server?.stop()
    removeTemporary(sandbox)
  })

  it(
    "matches OpenCode's own fork row for row, and OpenCode reads the offline fork",
    async () => {
      const db = new Database(store())
      const chosen =
        process.env["OPENCODE_SM_LIVE_FORK_SESSION"] ??
        // OpenCode refuses a session whose folder is gone (404 Location not found).
        (
          db
            .query(
              "select s.id, s.directory from session_v2 s join session_message m on m.session_id = s.id where s.parent_id is null and s.fork_session_id is null group by s.id having count(*) between 5 and 80 order by count(*), s.id",
            )
            .all() as { id: string; directory: string }[]
        ).find((row) => existsSync(row.directory))!.id
      db.close()

      // OpenCode's own fork, through the program's `fork` and the sandboxed server.
      server = await serve()
      const forked = Bun.spawnSync([process.execPath, cli, "fork", "--session", chosen, "--json"], { env: env() })
      expect([forked.exitCode, forked.stderr.toString()]).toEqual([0, ""])
      const report = JSON.parse(forked.stdout.toString()) as { fork_id: string; boundary: { type: string; messageID: string } }
      expect(report.boundary.type).toBe("through")
      await server.stop()
      server = null

      // The offline fork of the same session, at the same boundary, in the same store.
      const ids = new OpencodeIdentifiersAdapter({ now: () => Date.now() })
      const offline = ids.sessionId()
      const created = Number((new Database(store(), { readonly: true }).query("select time_created as t from session_v2 where id = ?").get(report.fork_id) as { t: number }).t)
      new BunSessionSyncStoreAdapter().forkSessions(store(), store(), [
        { sourceId: chosen, parentId: chosen, forkId: offline, messageBase: ids.messageBase(), slug: "calm-otter", boundaryMessageId: report.boundary.messageID, rewriter: null, now: created },
      ])
      const check = new Database(store())
      try {
        check.query("pragma wal_checkpoint(TRUNCATE)").run()
        const session = (id: string) => {
          const { id: _id, slug: _slug, ...rest } = check.query("select * from session_v2 where id = ?").get(id) as Record<string, unknown>
          return rest
        }
        expect(session(offline)).toEqual(session(report.fork_id))
        const messages = (id: string) =>
          (check.query("select id, seq, type, time_created, time_updated, data from session_message where session_id = ? order by seq").all(id) as { id: string; seq: number }[]).map(
            ({ id: messageId, ...row }) => ({ ...row, suffix: messageId.slice(messageId.lastIndexOf("_")) }),
          )
        const own = messages(report.fork_id)
        expect(own.length).toBeGreaterThan(0)
        expect(messages(offline)).toEqual(own)
        const sequence = (id: string) => check.query("select seq, owner_id from event_sequence where aggregate_id = ?").get(id)
        expect(sequence(offline)).toEqual(sequence(report.fork_id))
        const instructions = (id: string) => check.query("select epoch_start, through_seq, initial_values, current_values from instruction_state where session_id = ?").get(id)
        expect(instructions(offline)).toEqual(instructions(report.fork_id))
        expect(check.query("pragma foreign_key_check").all()).toEqual([])
      } finally {
        check.close()
      }

      // OpenCode reads the offline fork, its messages, and forks it again.
      server = await serve()
      const info = (await get(`/api/session/${offline}`)).data as { fork: { sessionID: string; boundary: { messageID: string } } }
      expect(info.fork).toEqual({ sessionID: chosen, boundary: { type: "through", messageID: report.boundary.messageID } } as typeof info.fork)
      const listed = (await get(`/api/session/${offline}/message?limit=200&order=asc`)).data as unknown[]
      expect(listed.length).toBeGreaterThan(0)
      const again = Bun.spawnSync([process.execPath, cli, "fork", "--session", offline, "--json"], { env: env() })
      expect(again.exitCode).toBe(0)
      expect(JSON.parse(again.stdout.toString())).toMatchObject({ parent_id: offline })
    },
    5 * 60_000,
  )
})
