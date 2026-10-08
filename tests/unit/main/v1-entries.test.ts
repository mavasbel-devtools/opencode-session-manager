import { describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { V1_TUI_PLUGIN_ID } from "@session-manager/main/plugin-id"
import server from "@session-manager/main/v1/server"
import tuiPlugin, { tui } from "@session-manager/main/v1/tui"

describe("v1 entry modules", () => {
  it("exposes a server plugin function that returns an empty hook set", async () => {
    expect(typeof server).toBe("function")
    expect(await server({} as never)).toEqual({})
  })

  it("keeps the v1 TUI shape { id, tui } and never the v2 setup", () => {
    expect(tuiPlugin.id).toBe(V1_TUI_PLUGIN_ID)
    expect(tuiPlugin.tui).toBe(tui)
    expect("setup" in tuiPlugin).toBe(false)
  })

  it("registers /transfer-session on the v1 keymap, against the store at OPENCODE_DB_PATH", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "session-manager-v1-entry-"))
    const previous = process.env["OPENCODE_DB_PATH"]
    process.env["OPENCODE_DB_PATH"] = path.join(directory, "opencode.db")
    const layers: Array<{ commands: Array<{ slashName?: string }> }> = []
    try {
      const container = await tui({ keymap: { registerLayer: (layer: never) => void layers.push(layer) } } as never)
      expect(layers[0]!.commands.map((command) => command.slashName)).toEqual(["transfer-session"])
      container.db.close()
    } finally {
      if (previous === undefined) delete process.env["OPENCODE_DB_PATH"]
      else process.env["OPENCODE_DB_PATH"] = previous
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
