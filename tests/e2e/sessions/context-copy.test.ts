import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { join } from "node:path"
import { buildContainer } from "@session-manager/main/cli-container"
import { bootstrap } from "@session-manager/main/cli/cli"
import { fileSha } from "@test/support/maintenance/database"
import { captureConsole, captureConsoleError } from "@test/support/maintenance/console"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { cachedPackageDirectory, makeMagicContextPackage } from "@test/support/sessions/magic-context-package"
import { makeContextStore } from "@test/support/sessions/stores"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-context-e2e-")
})
afterEach(() => {
  removeTemporary(directory)
})

describe("context copy (real stores, a real release in a child process, wired container)", () => {
  it("copies an older store from OpenCode's package cache release and leaves the source untouched", async () => {
    const cache = join(directory, "cache")
    makeMagicContextPackage(cachedPackageDirectory(join(cache, "opencode"), "npm", "latest"), { version: "0.45.0", latest: 94 })
    makeMagicContextPackage(cachedPackageDirectory(join(cache, "opencode"), "packages", "0.40.0"), { version: "0.40.0", latest: 90 })
    const source = join(directory, "context.db")
    makeContextStore(source, { version: 91, compartments: { ses_a: 2 } })
    const before = fileSha(source)
    const target = join(directory, "copy.db")
    const out = captureConsole()
    let code: number
    try {
      code = (await buildContainer({ XDG_CACHE_HOME: cache })).run(["context", "copy", "--from", source, "--to", target])
    } finally {
      out.restore()
    }
    expect(code).toBe(0)
    expect(JSON.parse(out.lines.join("\n"))).toEqual({
      source,
      target,
      from_format: 91,
      to_format: 94,
      upgraded: true,
      magic_context_version: "0.45.0",
    })
    expect(fileSha(source)).toBe(before)
    const copy = new Database(target, { readonly: true })
    try {
      expect(copy.query("select count(*) as n from compartments").get()).toEqual({ n: 2 })
    } finally {
      copy.close()
    }
  })

  it("names the folders it searched when no release is installed, and refuses a newer store or a refused upgrade", async () => {
    const pkg = makeMagicContextPackage(join(directory, "pkg"), { version: "0.40.0", latest: 90 })
    const source = join(directory, "context.db")
    makeContextStore(source, { version: 94 })
    const errors = captureConsoleError()
    try {
      expect(await bootstrap(["context", "copy", "--from", source, "--to", join(directory, "a.db")], { XDG_CACHE_HOME: join(directory, "none") })).toBe(1)
      expect(
        await bootstrap(["context", "copy", "--from", source, "--to", join(directory, "b.db")], { OPENCODE_SESSION_MANAGER_MAGIC_CONTEXT: pkg }),
      ).toBe(1)
      const fenced = join(directory, "fenced.db")
      makeContextStore(fenced, { version: 80 })
      new Database(fenced).exec("create table refuse_upgrade (x)")
      expect(
        await bootstrap(["context", "copy", "--from", fenced, "--to", join(directory, "c.db")], { OPENCODE_SESSION_MANAGER_MAGIC_CONTEXT: pkg }),
      ).toBe(1)
      const crashing = join(directory, "crashing.db")
      makeContextStore(crashing, { version: 80 })
      new Database(crashing).exec("create table crash_upgrade (x)")
      expect(
        await bootstrap(["context", "copy", "--from", crashing, "--to", join(directory, "d.db")], { OPENCODE_SESSION_MANAGER_MAGIC_CONTEXT: pkg }),
      ).toBe(1)
    } finally {
      errors.restore()
    }
    expect(errors.lines[0]).toBe(
      `ERROR: no installed Magic Context plugin found (searched ${join(directory, "none", "opencode")}); open OpenCode once with Magic Context enabled`,
    )
    expect(errors.lines[1]).toBe(
      `ERROR: ${source} has Magic Context format 94, newer than 90 (Magic Context 0.40.0 installed here); update Magic Context first`,
    )
    expect(errors.lines[2]).toBe(
      `ERROR: Magic Context could not upgrade ${join(directory, "c.db")}: refused: {"fence":null,"refusal":{"reason":"test refusal"}}`,
    )
    expect(errors.lines[3]).toStartWith(`ERROR: Magic Context could not upgrade ${join(directory, "d.db")}: exit 1: error: crashed on purpose`)
  })
})
