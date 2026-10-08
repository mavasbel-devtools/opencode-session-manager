import { beforeAll, describe, expect, it } from "bun:test"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { requireBun, root, run } from "@test/support/live/process"

const dist = path.join(root, "dist", "v2")
const ID = "ses_0123456789abCDEFGHIJKLMNOP"

beforeAll(async () => {
  const build = await run([requireBun(), "scripts/build.mjs"])
  if (build.exitCode !== 0) throw new Error(`build failed: ${build.stdout}${build.stderr}`)
}, 120_000)

describe("built v2 artifacts", () => {
  it("server.js satisfies the v2.0.14 server module shape and registers the tool", async () => {
    const mod = await import(`${pathToFileURL(path.join(dist, "server.js")).href}?e2e=${Date.now()}`)
    expect(mod.default.id).toBe("session-manager")
    expect(typeof mod.default.setup).toBe("function")
    const added: Array<{ name: string; execute: (input: unknown, context: unknown) => Promise<unknown> }> = []
    await mod.default.setup({ tool: { transform: async (callback: (editor: unknown) => void) => callback({ add: (tool: never) => added.push(tool) }) } })
    expect(added.map((tool) => tool.name)).toEqual(["session-id"])
    expect(await added[0]!.execute({}, { sessionID: ID })).toEqual({ content: ID })
  })

  it("tui.js imports only host runtime modules and no bundled Solid/OpenTUI copy", async () => {
    const code = await Bun.file(path.join(dist, "tui.js")).text()
    const specifiers = [...code.matchAll(/from\s*"([^"]+)"/g)].map((match) => match[1])
    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) expect(specifier).toStartWith("opentui:runtime-module:")
    expect(code).not.toContain("createRoot")
  })

  it("tui.js loads and renders through the host's runtime-module registry in a fresh process", async () => {
    const result = await run([requireBun(), "tests/support/live/load-built-tui.ts", path.join(dist, "tui.js"), ID])
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.trim().split("\n").at(-1)!)).toEqual({
      isPlugin: true,
      id: "session-manager",
      claims: [["prepend", "render"]],
      prepend: "sidebar.content",
      line: ID,
      fg: "#808080",
      disposed: 1,
    })
  }, 60_000)
})
