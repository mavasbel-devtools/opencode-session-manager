import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { OpencodeCacheInstallationsAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/OpencodeCacheInstallationsAdapter"
import { Sandbox, write } from "@test/support/patches/sandbox"

let box: Sandbox
beforeEach(() => {
  box = new Sandbox()
})
afterEach(() => box.dispose())

const manifest = (name: string, version: string) => JSON.stringify({ name, version })
const pkg = (...parts: string[]) => path.join(box.installations, ...parts, "node_modules", "@cortexkit", "opencode-magic-context", "package.json")

describe("OpencodeCacheInstallationsAdapter", () => {
  it("finds copies installed directly or under a numbered folder, and nothing else", async () => {
    write(pkg("opencode-magic-context@0.47.0", "1791693075785"), manifest("@cortexkit/opencode-magic-context", "0.47.0"))
    write(pkg("opencode-magic-context@latest"), manifest("@cortexkit/opencode-magic-context", "0.45.0"))
    write(pkg("opencode-magic-context@0.1.0"), manifest("someone-else", "0.1.0"))
    mkdirSync(path.join(box.installations, "opencode-magic-context@0.2.0", "empty"), { recursive: true })
    write(pkg("other-plugin@1.0.0"), manifest("@cortexkit/opencode-magic-context", "1.0.0"))
    write(path.join(box.installations, "opencode-magic-context@stray-file"), "")
    const copies = await new OpencodeCacheInstallationsAdapter(box.installations).list()
    expect(copies.map((c) => [c.spec, c.version, path.relative(box.installations, c.root)])).toEqual([
      ["0.47.0", "0.47.0", "opencode-magic-context@0.47.0/1791693075785/node_modules/@cortexkit/opencode-magic-context"],
      ["latest", "0.45.0", "opencode-magic-context@latest/node_modules/@cortexkit/opencode-magic-context"],
    ])
  })

  it("lists nothing when the cache does not exist, and throws on unreadable entries", async () => {
    expect(await new OpencodeCacheInstallationsAdapter(path.join(box.home, "none")).list()).toEqual([])
    const flat = write(path.join(box.home, "flat"), "")
    await expect(new OpencodeCacheInstallationsAdapter(flat).list()).rejects.toThrow(/ENOTDIR/)
    mkdirSync(pkg("opencode-magic-context@9.0.0"), { recursive: true })
    await expect(new OpencodeCacheInstallationsAdapter(box.installations).list()).rejects.toThrow(/EISDIR/)
  })
})
