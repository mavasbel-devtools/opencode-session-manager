// E2E tier, OpenCode 1 lane: the real v1 entries (src/main/v1) driven the way
// the v1.18.32 host drives them, against real resources only — a real SQLite
// store in the v1 schema, real directories, real git repositories, the real
// `git` executable. The one stand-in is the host's TUI surface (`api`), which
// cannot exist outside the v1 TUI process; it records what the plugin shows and
// lets the test pick what a user would pick.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Database } from "bun:sqlite"
import server from "@session-manager/main/v1/server"
import { tui } from "@session-manager/main/v1/tui"
import { removeTemporary } from "@test/support/live/process"

const CUSTOM = "__transfer_custom_path__"

const PROJECT_TABLE = `CREATE TABLE project (
  id TEXT PRIMARY KEY, worktree TEXT NOT NULL, sandboxes TEXT NOT NULL,
  time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL)`
const SESSION_TABLE = `CREATE TABLE session (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, directory TEXT NOT NULL, path TEXT,
  title TEXT, time_created INTEGER, time_updated INTEGER)`

type Row = { project_id: string; directory: string; path: string | null }

interface Recorded {
  toasts: Array<{ variant?: string; title?: string; message: string }>
  prompts: Array<{ sessionID: string; directory: string }>
  dialogs: any[]
  cleared: number
}

let root = ""
let dbPath = ""
let previous: { db: string | undefined; home: string | undefined } = { db: undefined, home: undefined }
const open: Array<{ db: { close(): void } }> = []

function sql(statements: readonly string[]) {
  const db = new Database(dbPath)
  for (const statement of statements) db.run(statement)
  db.close()
}

let clock = 0

/** Each seeded session is newer than the previous one, so list order is deterministic. */
function seed(id: string, directory: string, title = id) {
  const db = new Database(dbPath)
  db.query("INSERT INTO session (id, project_id, directory, path, title, time_created, time_updated) VALUES (?, 'p0', ?, '', ?, 1, ?)").run(
    id,
    directory,
    title,
    ++clock,
  )
  db.close()
}

function row(id: string): Row | null {
  const db = new Database(dbPath)
  const value = db.query("SELECT project_id, directory, path FROM session WHERE id = ?").get(id) as Row | null
  db.close()
  return value
}

function project(id: string): string | undefined {
  const db = new Database(dbPath)
  const value = db.query("SELECT worktree FROM project WHERE id = ?").get(id) as { worktree: string } | null
  db.close()
  return value?.worktree
}

function git(cwd: string, args: readonly string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`)
  return result.stdout.trim()
}

function repository(name: string, options: { commit?: boolean; origin?: string; cached?: string } = {}) {
  const directory = path.join(root, name)
  fs.mkdirSync(directory, { recursive: true })
  git(directory, ["init", "--quiet"])
  if (options.commit !== false) {
    for (const [key, value] of [["user.email", "e2e@example.com"], ["user.name", "e2e"], ["commit.gpgsign", "false"]])
      git(directory, ["config", key!, value!])
    fs.writeFileSync(path.join(directory, "README"), name)
    git(directory, ["add", "."])
    git(directory, ["commit", "--quiet", "-m", "root"])
  }
  if (options.origin !== undefined) git(directory, ["remote", "add", "origin", options.origin])
  if (options.cached !== undefined) fs.writeFileSync(path.join(directory, ".git", "opencode"), options.cached)
  return fs.realpathSync(directory)
}

function makeApi(sessionID: string | undefined, client: { promptAsync?: (input: any) => Promise<unknown> } = {}) {
  const recorded: Recorded = { toasts: [], prompts: [], dialogs: [], cleared: 0 }
  const api: any = {
    keymap: { registerLayer: (layer: any) => layer.commands[0].run() },
    route: { current: sessionID === undefined ? { name: "home" } : { name: "session", params: { sessionID } } },
    client: {
      session: {
        promptAsync:
          client.promptAsync ??
          ((payload: any) => {
            recorded.prompts.push(payload)
            return Promise.resolve({})
          }),
      },
    },
    ui: {
      dialog: {
        replace: (render: () => any) => recorded.dialogs.push(render()),
        clear: () => {
          recorded.cleared++
        },
      },
      DialogSelect: (props: any) => props,
      DialogPrompt: (props: any) => props,
      toast: (toast: any) => recorded.toasts.push(toast),
    },
  }
  return { api, recorded }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 40))

/** Boots the real v1 TUI entry, which registers the command; `makeApi` runs it at once. */
async function boot(sessionID: string | undefined, client?: { promptAsync?: (input: any) => Promise<unknown> }) {
  const { api, recorded } = makeApi(sessionID, client)
  open.push(await tui(api))
  await tick()
  return recorded
}

function option(recorded: Recorded, dialog: number, value: string) {
  const found = recorded.dialogs[dialog].options.find((entry: any) => entry.value === value)
  if (!found) throw new Error(`no option ${value} in dialog ${dialog}`)
  return found
}

beforeAll(() => {
  previous = { db: process.env["OPENCODE_DB_PATH"], home: process.env["HOME"] }
})

afterAll(() => {
  if (previous.db === undefined) delete process.env["OPENCODE_DB_PATH"]
  else process.env["OPENCODE_DB_PATH"] = previous.db
  if (previous.home === undefined) delete process.env["HOME"]
  else process.env["HOME"] = previous.home
})

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "session-manager-v1-e2e-")))
  dbPath = path.join(root, "opencode.db")
  process.env["OPENCODE_DB_PATH"] = dbPath
  process.env["HOME"] = path.join(root, "home")
  fs.mkdirSync(process.env["HOME"])
})

afterEach(async () => {
  for (const container of open.splice(0)) container.db.close()
  await removeTemporary(root)
})

describe("v1 server entry", () => {
  it("is the empty hook set the v1 host loads beside the TUI file", async () => {
    expect(await server({} as never)).toEqual({})
  })
})

describe("v1 /transfer-session on the open session", () => {
  beforeEach(() => sql([PROJECT_TABLE, SESSION_TABLE]))

  it("moves the session to a known directory, records the project, and reminds the agent", async () => {
    const source = path.join(root, "source")
    const target = path.join(root, "target")
    fs.mkdirSync(source)
    fs.mkdirSync(target)
    seed("ses_one", source)
    seed("ses_two", target)

    const recorded = await boot("ses_one")
    expect(recorded.dialogs[0].title).toBe("Transfer session (ses_one)")
    expect(recorded.dialogs[0].options[0]).toMatchObject({ title: "Enter custom path…", value: CUSTOM })
    option(recorded, 0, target).onSelect()
    await tick()

    expect(row("ses_one")).toEqual({ project_id: "global", directory: target, path: target.slice(1) })
    expect(project("global")).toBe("/")
    expect(recorded.prompts[0]).toMatchObject({ sessionID: "ses_one", directory: target, noReply: true })
    expect(recorded.cleared).toBe(1)
    expect(recorded.toasts.at(-1)).toMatchObject({ variant: "success", message: `Moved to ${target}` })
  })

  it("creates a ~/ custom destination under the home directory", async () => {
    seed("ses_new", root)
    const recorded = await boot("ses_new")
    option(recorded, 0, CUSTOM).onSelect()
    recorded.dialogs[1].onConfirm("  ~/brand/new  ")
    await tick()

    const created = path.join(root, "home", "brand", "new")
    expect(fs.statSync(created).isDirectory()).toBe(true)
    expect(row("ses_new")?.directory).toBe(created)
  })

  it("still reports success when the agent reminder cannot be delivered", async () => {
    seed("ses_quiet", root)
    const recorded = await boot("ses_quiet", { promptAsync: () => Promise.reject(new Error("offline")) })
    option(recorded, 0, CUSTOM).onSelect()
    recorded.dialogs[1].onConfirm(path.join(root, "quiet"))
    await tick()
    expect(recorded.toasts.at(-1)).toMatchObject({ variant: "success" })
  })

  it("closes the prompt on cancel without moving anything", async () => {
    seed("ses_cancel", root)
    const recorded = await boot("ses_cancel")
    option(recorded, 0, CUSTOM).onSelect()
    recorded.dialogs[1].onCancel()
    expect(recorded.cleared).toBe(1)
    expect(row("ses_cancel")?.directory).toBe(root)
  })

  it("reports an empty custom path, an empty session id and an unknown session as failed transfers", async () => {
    seed("ses_empty", root)
    const empty = await boot("ses_empty")
    option(empty, 0, CUSTOM).onSelect()
    empty.dialogs[1].onConfirm("   ")
    await tick()
    expect(empty.toasts.at(-1)).toEqual({
      variant: "error",
      title: "Transfer failed",
      message: 'Invalid directory "   ": Directory path cannot be empty',
    })

    const blank = await boot("")
    option(blank, 0, root).onSelect()
    await tick()
    expect(blank.toasts.at(-1)).toEqual({ variant: "error", title: "Transfer failed", message: "Session not found: " })

    const unknown = await boot("ses_missing")
    option(unknown, 0, root).onSelect()
    await tick()
    expect(unknown.toasts.at(-1)).toEqual({ variant: "error", title: "Transfer failed", message: "Session not found: ses_missing" })
  })
})

describe("v1 /transfer-session from the home screen", () => {
  beforeEach(() => sql([PROJECT_TABLE, SESSION_TABLE]))

  it("picks a session first, then its destination", async () => {
    const target = path.join(root, "picked")
    fs.mkdirSync(target)
    seed("ses_picked", target, "Picked session")
    seed("ses_untitled", root, "")

    const recorded = await boot(undefined)
    expect(recorded.dialogs[0].title).toBe("Transfer session — pick a session")
    expect(recorded.dialogs[0].options.map((entry: any) => [entry.title, entry.footer])).toEqual([
      ["ses_untitled", "untitled"],
      ["Picked session", "s_picked"],
    ])
    option(recorded, 0, "ses_untitled").onSelect()
    await tick()
    option(recorded, 1, target).onSelect()
    await tick()
    expect(row("ses_untitled")?.directory).toBe(target)
  })

  it("warns when there is no session to transfer", async () => {
    const recorded = await boot(undefined)
    expect(recorded.toasts).toEqual([{ variant: "warning", title: "Transfer session", message: "No sessions found." }])
  })
})

describe("v1 project resolution of the destination (real git repositories)", () => {
  beforeEach(() => sql([PROJECT_TABLE, SESSION_TABLE]))

  const sha1 = (value: string) => createHash("sha1").update(value).digest("hex")

  async function transferTo(directory: string) {
    seed("ses_git", root)
    const recorded = await boot("ses_git")
    option(recorded, 0, CUSTOM).onSelect()
    recorded.dialogs[1].onConfirm(directory)
    await tick()
    expect(recorded.toasts.at(-1)).toMatchObject({ variant: "success" })
    return row("ses_git")!
  }

  it("hashes an https origin, at the worktree root and in a subdirectory", async () => {
    const repo = repository("https", { origin: "https://GitHub.com/owner/name.git/" })
    expect(await transferTo(path.join(repo, "packages", "core"))).toEqual({
      project_id: sha1("git-remote:github.com/owner/name"),
      directory: path.join(repo, "packages", "core"),
      path: "packages/core",
    })
    expect(project(sha1("git-remote:github.com/owner/name"))).toBe(repo)
  })

  it("hashes an scp-form origin", async () => {
    const repo = repository("scp", { origin: "git@example.org:team/repo.git" })
    expect((await transferTo(repo)).project_id).toBe(sha1("git-remote:example.org/team/repo"))
  })

  it("prefers the cached id over the root commit when the origin does not normalize", async () => {
    const repo = repository("cached", { origin: "file:///srv/repo.git", cached: "cached-id\n" })
    expect((await transferTo(repo)).project_id).toBe("cached-id")
  })

  it("falls back to the root commit when the origin is a bare name", async () => {
    const repo = repository("rooted", { origin: "just-a-name" })
    expect((await transferTo(repo)).project_id).toBe(git(repo, ["rev-list", "--max-parents=0", "HEAD"]))
  })

  it("resolves a repository without commits to global", async () => {
    const repo = repository("empty", { commit: false })
    expect((await transferTo(repo)).project_id).toBe("global")
  })

  it("treats a .git that git rejects as no repository", async () => {
    const broken = path.join(root, "broken")
    fs.mkdirSync(path.join(broken, ".git"), { recursive: true })
    expect((await transferTo(broken)).project_id).toBe("global")
  })
})

describe("v1 store failures are reported, never thrown at the host", () => {
  it("cannot open a store in a missing directory", async () => {
    process.env["OPENCODE_DB_PATH"] = path.join(root, "missing", "opencode.db")
    const recorded = await boot(undefined)
    expect(recorded.toasts[0]).toEqual({
      variant: "error",
      title: "Transfer session",
      message: `Failed to open opencode database at ${path.join(root, "missing", "opencode.db")}`,
    })
  })

  it("cannot list sessions or directories without the session table", async () => {
    sql([PROJECT_TABLE])
    expect((await boot(undefined)).toasts[0]?.message).toBe("Failed to list sessions")
    expect((await boot("ses_any")).toasts[0]?.message).toBe("Failed to list recent directories")
  })

  it("cannot read a session from a table without its columns", async () => {
    sql([PROJECT_TABLE, "CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT, time_updated INTEGER)", `INSERT INTO session VALUES ('ses_x', '${root}', 1)`])
    const recorded = await boot("ses_x")
    option(recorded, 0, root).onSelect()
    await tick()
    expect(recorded.toasts.at(-1)?.message).toBe("Failed to read session ses_x")
  })

  it("cannot record the destination project without the project table", async () => {
    sql([SESSION_TABLE])
    seed("ses_noproject", root)
    const recorded = await boot("ses_noproject")
    option(recorded, 0, root).onSelect()
    await tick()
    expect(recorded.toasts.at(-1)?.message).toBe("Failed to upsert project global")
  })

  it("cannot move a session the store refuses to update", async () => {
    sql([PROJECT_TABLE, SESSION_TABLE, "CREATE TRIGGER frozen BEFORE UPDATE ON session BEGIN SELECT RAISE(ABORT, 'frozen'); END"])
    seed("ses_frozen", root)
    const recorded = await boot("ses_frozen")
    option(recorded, 0, root).onSelect()
    await tick()
    expect(recorded.toasts.at(-1)?.message).toBe("Failed to update session location for ses_frozen")
  })
})
