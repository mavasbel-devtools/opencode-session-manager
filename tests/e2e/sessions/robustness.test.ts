import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, realpathSync } from "node:fs"
import { join } from "node:path"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import { buildContainer } from "@session-manager/main/cli-container"
import { captureConsole, captureConsoleError } from "@test/support/maintenance/console"
import { fileSha } from "@test/support/maintenance/database"
import { query, sha1 } from "@test/support/maintenance/repositories"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { currentPlatform } from "@test/support/platform"
import { makeOpenCode2Store } from "@test/support/sessions/opencode-stores"
import { makeSyncContextStore, rowsOf } from "@test/support/sessions/sync-stores"

let directory = ""
let stamp = 0
beforeEach(() => {
  directory = realpathSync(temporaryWorkspace("oc-robust-e2e-"))
  stamp = 0
})
afterEach(() => {
  removeTemporary(directory)
})

const at = (...parts: string[]) => join(directory, ...parts)
const opencodeOf = (side: string) => at(side, "opencode", "opencode.db")
const contextOf = (side: string) => at(side, "cortexkit", "magic-context", "context.db")
const shas = (side: string) => [fileSha(opencodeOf(side)), fileSha(contextOf(side))]

/** Each run gets its own stamp, as runs a second apart would. */
function runtime(): RuntimePort {
  mkdirSync(at("tmp"), { recursive: true })
  stamp += 1
  const mine = `2026-10-11-00-00-${String(stamp).padStart(2, "0")}`
  return { pid: () => process.pid, platform: () => currentPlatform(), now: () => Date.now(), stamp: () => mine, temporaryDirectory: () => at("tmp"), homeDirectory: () => at("home") }
}

async function cli(argv: string[]) {
  const out = captureConsole()
  const errors = captureConsoleError()
  try {
    const container = await buildContainer({ OPENCODE_DB_COMPACT_IMAGE: "no-such-image" }, { runtime: runtime() })
    let code: number
    try {
      code = await container.run(argv)
    } catch (error) {
      errors.lines.push(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
      code = 1
    }
    const text = out.lines.join("\n")
    return { code, json: text.startsWith("{") ? JSON.parse(text) : null, errors: errors.lines }
  } finally {
    out.restore()
    errors.restore()
  }
}

const dirIdentity = (path: string) => `dir:${createHash("md5").update(path).digest("hex").slice(0, 12)}`
const summaries = (id: string, count: number) => Array.from({ length: count }, (_, index) => ({ start: `${id}-m${index}`, end: `${id}-m${index}` }))

/** Two profiles of this machine sharing one folder, each with sessions the other lacks and one they share. */
function makeTwins() {
  const plain = at("home", "plain")
  mkdirSync(plain, { recursive: true })
  const project = { id: sha1(`directory:${plain}`), worktree: plain }
  const one = (id: string, entries = 2) => ({ id, directory: plain, projectId: project.id, entries: Array.from({ length: entries }, (_, index) => `${id}-m${index}`) })
  makeOpenCode2Store(opencodeOf("a"), { projects: [project], sessions: [one("ses_a1"), one("ses_a2", 3), one("ses_shared", 3)] })
  makeOpenCode2Store(opencodeOf("b"), { projects: [project], sessions: [one("ses_b1"), one("ses_shared", 2)] })
  makeSyncContextStore(contextOf("a"), {
    format: 95,
    sessions: {
      ses_a1: { compartments: summaries("ses_a1", 1), tags: 2, memories: [{ content: "from a" }], project: dirIdentity(plain) },
      ses_shared: { compartments: summaries("ses_shared", 2), tags: 3, project: dirIdentity(plain) },
    },
  })
  makeSyncContextStore(contextOf("b"), {
    format: 95,
    sessions: { ses_b1: { compartments: summaries("ses_b1", 1), tags: 1, notes: ["b's note"], memories: [{ content: "from b" }], project: dirIdentity(plain) } },
  })
}

const sessionIds = (side: string) => (query(opencodeOf(side), "select id from session_v2 order by id") as { id: string }[]).map((row) => row.id)
const memories = (side: string) => (rowsOf(contextOf(side), "select content from memories order by content") as { content: string }[]).map((row) => row.content)

describe("repeated and two-way syncs (real stores, the wired container)", () => {
  it("a second identical sync changes nothing: no swap, no backup, byte-identical stores", async () => {
    makeTwins()
    const first = await cli(["sync", "--from", at("a"), "--to", at("b"), "--all"])
    expect([first.code, first.json.backup_dir === null]).toEqual([0, false])
    const after = shas("b")
    const second = await cli(["sync", "--from", at("a"), "--to", at("b"), "--all"])
    expect([second.code, second.json.backup_dir, second.json.rollback]).toEqual([0, null, null])
    expect(second.json.sessions.every((session: { action: string }) => session.action === "keep")).toBe(true)
    expect(shas("b")).toEqual(after)
    expect(readdirSync(at("b", "opencode")).filter((name) => name.startsWith("sync-backup-"))).toHaveLength(1)
  })

  it("A to B then B to A leaves both with every session and every memory, and a third sync in either direction changes nothing", async () => {
    makeTwins()
    expect((await cli(["sync", "--from", at("a"), "--to", at("b"), "--all"])).code).toBe(0)
    expect((await cli(["sync", "--from", at("b"), "--to", at("a"), "--all"])).code).toBe(0)
    const everyone = ["ses_a1", "ses_a2", "ses_b1", "ses_shared"]
    expect([sessionIds("a"), sessionIds("b")]).toEqual([everyone, everyone])
    expect([memories("a"), memories("b")]).toEqual([
      ["from a", "from b"],
      ["from a", "from b"],
    ])
    // ses_shared: a's history (3 messages) replaced b's beginning of it (2), with a's summaries.
    expect(query(opencodeOf("b"), "select count(*) as n from session_message where session_id = 'ses_shared'")).toEqual([{ n: 3 }])
    expect(rowsOf(contextOf("b"), "select count(*) as n from compartments where session_id = 'ses_shared'")).toEqual([{ n: 2 }])
    expect(rowsOf(contextOf("a"), "select content from notes where session_id = 'ses_b1'")).toEqual([{ content: "b's note" }])
    const settled = [...shas("a"), ...shas("b")]
    for (const [from, to] of [
      ["a", "b"],
      ["b", "a"],
    ] as const)
      expect((await cli(["sync", "--from", at(from), "--to", at(to), "--all"])).json.backup_dir).toBeNull()
    expect([...shas("a"), ...shas("b")]).toEqual(settled)
  })
})

/** A trigger in the store itself: SQLite aborts the write the sync makes into its working copy. */
function addTrigger(store: string, sql: string): void {
  const db = new Database(store)
  try {
    db.exec(sql)
  } finally {
    db.close()
  }
}

describe("a failure at any write step leaves both target stores as they were (real stores)", () => {
  const untouched = (before: string[]) => {
    expect(shas("b")).toEqual(before)
    for (const folder of [at("b", "opencode"), at("b", "cortexkit", "magic-context")])
      expect(readdirSync(folder).filter((name) => name.includes("incoming") || name.endsWith(".session-manager.lock"))).toEqual([])
    // Each run works in a folder of its own under <tmp>/opencode, removed however it ends.
    expect(readdirSync(at("tmp", "opencode"))).toEqual([])
  }

  it("the OpenCode copy refusing a row", async () => {
    makeTwins()
    addTrigger(opencodeOf("b"), "create trigger refuse before insert on session_v2 begin select raise(abort, 'refused by the store'); end")
    const before = shas("b")
    const failed = await cli(["sync", "--from", at("a"), "--to", at("b"), "--all"])
    expect([failed.code, failed.errors[0]]).toEqual([1, expect.stringContaining("refused by the store")])
    untouched(before)
  })

  it("the Magic Context copy refusing a row", async () => {
    makeTwins()
    addTrigger(contextOf("b"), "create trigger refuse before insert on tags begin select raise(abort, 'tags refused'); end")
    const before = shas("b")
    const failed = await cli(["sync", "--from", at("a"), "--to", at("b"), "--all"])
    expect([failed.code, failed.errors[0]]).toEqual([1, expect.stringContaining("tags refused")])
    untouched(before)
  })

  it("the first swap (OpenCode's) failing", async () => {
    makeTwins()
    const before = shas("b")
    // A full folder where the OpenCode original would be moved: its rename fails before anything moved.
    mkdirSync(join(at("b", "opencode"), "sync-backup-2026-10-11-00-00-01", "opencode.db", "occupied"), { recursive: true })
    const failed = await cli(["sync", "--from", at("a"), "--to", at("b"), "--all"])
    expect(failed.code).toBe(1)
    untouched(before)
    expect(existsSync(opencodeOf("b"))).toBe(true)
  })

  it("rollback after a real sync restores both stores byte for byte", async () => {
    makeTwins()
    const before = shas("b")
    const run = await cli(["sync", "--from", at("a"), "--to", at("b"), "--all"])
    expect(shas("b")).not.toEqual(before)
    const [, , backup, ...dbs] = (run.json.rollback as string).split(" ")
    expect((await cli(["rollback", backup!, ...dbs])).code).toBe(0)
    expect(shas("b")).toEqual(before)
  })
})
