import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Database } from "bun:sqlite"
import { removeTemporarySync, requireBun, run } from "@test/support/live/process"

/**
 * Live tier, OpenCode 1 lane: drives the **built** bundles
 * (`dist/v1/session-manager{,.tui}.js`) rather than the source, so bundling and
 * entry-export regressions surface here. Uses a temp database and temp
 * directories only — it never reads or writes the real `opencode.db`.
 */
const v1 = path.resolve(import.meta.dir, "../../dist/v1")
const bundlePath = path.join(v1, "session-manager.tui.js")

beforeAll(async () => {
  const build = await run([requireBun(), "scripts/build.mjs"])
  if (build.exitCode !== 0) throw new Error(`build failed: ${build.stdout}${build.stderr}`)
}, 120_000)

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY, worktree TEXT NOT NULL, sandboxes TEXT NOT NULL,
    time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS session (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, directory TEXT NOT NULL,
    path TEXT, title TEXT, time_created INTEGER, time_updated INTEGER
  );
`

describe("built v1 artifacts", () => {
  let root: string
  let dbPath: string
  let previousDbPath: string | undefined
  let containers: Array<{ db: { close(): void } }> = []

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "transfer-live-"))
    dbPath = path.join(root, "opencode.db")
    previousDbPath = process.env["OPENCODE_DB_PATH"]
    process.env["OPENCODE_DB_PATH"] = dbPath
    containers = []

    const db = new Database(dbPath)
    db.run(SCHEMA)
    db.query(
      "INSERT INTO session (id, project_id, directory, path, title, time_created, time_updated) VALUES ('ses_live', 'p', ?, '', 'live', 1, 1)",
    ).run(path.join(root, "src"))
    db.query(
      "INSERT INTO session (id, project_id, directory, path, title, time_created, time_updated) VALUES ('ses_live_target', 'p', ?, '', 'target', 1, 1)",
    ).run(path.join(root, "target"))
    db.close()
  })

  afterEach(() => {
    for (const container of containers) container.db.close()
    if (previousDbPath === undefined) delete process.env["OPENCODE_DB_PATH"]
    else process.env["OPENCODE_DB_PATH"] = previousDbPath
    removeTemporarySync(root)
  })

  it("session-manager.js is the empty v1 server hook set", async () => {
    const mod = await import(`file://${path.join(v1, "session-manager.js")}`)
    expect(await mod.default({})).toEqual({})
  })

  it("session-manager.tui.js relocates a session against a temp database", async () => {
    expect(fs.existsSync(bundlePath)).toBe(true)

    const mod = await import(`file://${bundlePath.replaceAll("\\", "/")}`)
    const plugin = mod.default
    expect(plugin.id).toBe("session-manager-tui")
    expect(typeof plugin?.tui).toBe("function")

    const target = path.join(root, "target")
    fs.mkdirSync(target)

    const dialogs: any[] = []
    const prompts: any[] = []
    const toasts: any[] = []
    const api: any = {
      keymap: { registerLayer: (layer: any) => layer.commands[0].run() },
      route: { current: { name: "session", params: { sessionID: "ses_live" } } },
      client: { session: { promptAsync: (payload: any) => (prompts.push(payload), Promise.resolve({})) } },
      ui: {
        dialog: { replace: (render: () => any) => dialogs.push(render()), clear: () => {} },
        DialogSelect: (props: any) => props,
        DialogPrompt: (props: any) => props,
        toast: (toast: any) => toasts.push(toast),
      },
    }

    const container = await plugin.tui(api)
    containers.push(container)
    await new Promise((resolve) => setTimeout(resolve, 25))

    dialogs[0].options.find(
      (option: any) => typeof option.value === "string" && option.value.toLowerCase() === target.toLowerCase(),
    ).onSelect()
    await new Promise((resolve) => setTimeout(resolve, 25))

    const db = new Database(dbPath)
    const row = db.query("SELECT directory FROM session WHERE id = 'ses_live'").get() as { directory: string }
    db.close()

    expect(row.directory.toLowerCase()).toBe(target.toLowerCase())
    expect(prompts[0]?.directory?.toLowerCase()).toBe(target.toLowerCase())
    expect(toasts.some((toast) => toast.variant === "success")).toBe(true)
  })
})
