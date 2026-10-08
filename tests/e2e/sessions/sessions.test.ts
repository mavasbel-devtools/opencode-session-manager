import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { buildContainer } from "@session-manager/main/cli-container"
import { captureConsole, captureConsoleError } from "@test/support/maintenance/console"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { makeContextStore, makeOpenCodeStore } from "@test/support/sessions/stores"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-sessions-e2e-")
})
afterEach(() => {
  removeTemporary(directory)
})

async function run(argv: readonly string[], environment: Record<string, string> = {}) {
  const out = captureConsole()
  try {
    return { code: await (await buildContainer(environment)).run(argv), lines: out.lines }
  } finally {
    out.restore()
  }
}

describe("sessions (real stores, wired container)", () => {
  it("lists a profile's sessions joined with Magic Context, from --data or $XDG_DATA_HOME", async () => {
    makeOpenCodeStore(join(directory, "opencode", "opencode.db"), {
      v1: [{ id: "ses_v1", title: "first", directory: "/w/a", updated: 1, entries: 1 }],
      v2: [{ id: "ses_v2", title: "second", directory: "/w/b", updated: 2, entries: 2 }],
    })
    makeContextStore(join(directory, "cortexkit", "magic-context", "context.db"), { version: 91, compartments: { ses_v2: 3 }, tags: { ses_v2: 5 } })

    const listed = await run(["sessions", "--data", directory])
    expect(listed.code).toBe(0)
    expect(listed.lines[1]).toEndWith("(Magic Context format 91)")
    expect(listed.lines.slice(3).map((line) => line.split("\t").slice(0, 5))).toEqual([
      ["ses_v2", "v2", "2", "3", "5"],
      ["ses_v1", "v1", "1", "-", "-"],
    ])

    const json = await run(["sessions", "--json"], { XDG_DATA_HOME: directory })
    const catalog = JSON.parse(json.lines.join("\n"))
    expect(catalog.sessions.map((session: { id: string }) => session.id)).toEqual(["ses_v2", "ses_v1"])
    expect(catalog.sessions[0].magicContext.tags).toBe(5)
  })

  it("refuses a missing store and names an unreadable one", async () => {
    const errors = captureConsoleError()
    try {
      const { bootstrap } = await import("@session-manager/main/cli/cli")
      expect(await bootstrap(["sessions", "--data", directory], {})).toBe(1)
      writeFileSync(join(directory, "opencode.db"), "")
      makeOpenCodeStore(join(directory, "p", "opencode", "opencode.db"), {})
      writeFileSync(join(directory, "p", "opencode", "opencode.db"), "this is not a database, it is plain text padding the header out")
      expect(await bootstrap(["sessions", "--data", join(directory, "p")], {})).toBe(1)
    } finally {
      errors.restore()
    }
    expect(errors.lines[0]).toBe(`ERROR: database not found: ${join(directory, "opencode", "opencode.db")}`)
    expect(errors.lines[1]).toStartWith(`ERROR: cannot read ${join(directory, "p", "opencode", "opencode.db")}: `)
  })
})
