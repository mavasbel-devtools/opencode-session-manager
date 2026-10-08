import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Database } from "bun:sqlite"
import { tui } from "@session-manager/main/v1/tui"

const SESSION_SCHEMA = `
  CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY,
    worktree TEXT NOT NULL,
    sandboxes TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    directory TEXT NOT NULL,
    path TEXT,
    title TEXT,
    time_created INTEGER,
    time_updated INTEGER
  );
`

function seedSession(dbPath: string, id: string, directory: string, projectId = "proj_a") {
  const db = new Database(dbPath)
  db.run(SESSION_SCHEMA)
  db.query(
    "INSERT INTO session (id, project_id, directory, path, title, time_created, time_updated) VALUES (?, ?, ?, '', ?, 1, 1)",
  ).run(id, projectId, directory, id)
  db.close()
}

function readSession(dbPath: string, id: string) {
  const db = new Database(dbPath)
  const row = db
    .query("SELECT project_id, directory, path FROM session WHERE id = ?")
    .get(id) as { project_id: string; directory: string; path: string | null } | null
  db.close()
  return row
}

function makeApi(route: any) {
  const toasts: any[] = []
  const prompts: any[] = []
  const dialogs: any[] = []
  const api: any = {
    keymap: { registerLayer: (layer: any) => layer.commands[0].run() },
    route,
    client: {
      session: {
        promptAsync: (payload: any) => {
          prompts.push(payload)
          return Promise.resolve({})
        },
      },
    },
    ui: {
      dialog: { replace: (render: () => any) => dialogs.push(render()), clear: () => {} },
      DialogSelect: (props: any) => props,
      DialogPrompt: (props: any) => props,
      toast: (toast: any) => toasts.push(toast),
    },
  }
  return { api, toasts, prompts, dialogs }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 25))

describe("e2e: session relocation through the plugin entry", () => {
  let root: string
  let dbPath: string
  let previousDbPath: string | undefined
  let containers: Array<{ db: { close(): void } }> = []

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "transfer-e2e-"))
    dbPath = path.join(root, "opencode.db")
    previousDbPath = process.env["OPENCODE_DB_PATH"]
    process.env["OPENCODE_DB_PATH"] = dbPath
    containers = []
  })

  afterEach(() => {
    for (const container of containers) container.db.close()
    if (previousDbPath === undefined) delete process.env["OPENCODE_DB_PATH"]
    else process.env["OPENCODE_DB_PATH"] = previousDbPath
    fs.rmSync(root, { recursive: true, force: true })
  })

  async function boot(api: any) {
    const container = await tui(api)
    containers.push(container)
    return container
  }

  it("relocates a session to an existing sibling directory", async () => {
    const source = path.join(root, "source")
    const target = path.join(root, "target")
    fs.mkdirSync(source)
    fs.mkdirSync(target)
    seedSession(dbPath, "ses_e2e_one", source)
    seedSession(dbPath, "ses_e2e_other", target)

    const { api, toasts, prompts, dialogs } = makeApi({
      current: { name: "session", params: { sessionID: "ses_e2e_one" } },
    })
    await boot(api)
    await tick()

    const entry = dialogs[0].options.find(
      (option: any) => typeof option.value === "string" && option.value.toLowerCase() === target.toLowerCase(),
    )
    expect(entry).toBeDefined()
    entry.onSelect()
    await tick()

    const row = readSession(dbPath, "ses_e2e_one")
    expect(row?.directory?.toLowerCase()).toBe(target.toLowerCase())
    expect(prompts[0]?.directory?.toLowerCase()).toBe(target.toLowerCase())
    expect(toasts.some((toast) => toast.variant === "success")).toBe(true)
  })

  it("creates a brand-new destination directory and relocates there", async () => {
    const source = path.join(root, "source")
    fs.mkdirSync(source)
    seedSession(dbPath, "ses_e2e_new", source)

    const fresh = path.join(root, "brand", "new", "dir")
    const { api, prompts, dialogs } = makeApi({
      current: { name: "session", params: { sessionID: "ses_e2e_new" } },
    })
    await boot(api)
    await tick()

    dialogs[0].options.find((option: any) => option.value === "__transfer_custom_path__").onSelect()
    dialogs[1].onConfirm(fresh)
    await tick()

    expect(fs.statSync(fresh).isDirectory()).toBe(true)
    expect(readSession(dbPath, "ses_e2e_new")?.directory).toBe(fresh)
    expect(prompts[0]?.directory).toBe(fresh)
  })

  it("relocates into a plain non-git directory using the global project", async () => {
    const source = path.join(root, "source")
    const plain = path.join(root, "plain")
    fs.mkdirSync(source)
    fs.mkdirSync(plain)
    seedSession(dbPath, "ses_e2e_plain", source)
    seedSession(dbPath, "ses_e2e_plain_known", plain)

    const { api, dialogs } = makeApi({
      current: { name: "session", params: { sessionID: "ses_e2e_plain" } },
    })
    await boot(api)
    await tick()

    const entry = dialogs[0].options.find(
      (option: any) => typeof option.value === "string" && option.value.toLowerCase() === plain.toLowerCase(),
    )
    expect(entry).toBeDefined()
    entry.onSelect()
    await tick()

    const row = readSession(dbPath, "ses_e2e_plain")
    expect(row?.directory?.toLowerCase()).toBe(plain.toLowerCase())
    expect(row?.project_id).toBe("global")
  })

  it("discovers a nested project directory seeded by another session", async () => {
    const source = path.join(root, "work")
    const nested = path.join(root, "work", "repos", "HomeLab")
    fs.mkdirSync(nested, { recursive: true })
    seedSession(dbPath, "ses_e2e_host", source)
    seedSession(dbPath, "ses_e2e_nested", nested)

    const { api, dialogs } = makeApi({
      current: { name: "session", params: { sessionID: "ses_e2e_host" } },
    })
    await boot(api)
    await tick()

    const found = dialogs[0].options.find(
      (option: any) => typeof option.value === "string" && option.value.toLowerCase() === nested.toLowerCase(),
    )
    expect(found).toBeDefined()
  })
})
