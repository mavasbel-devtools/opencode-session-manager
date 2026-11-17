import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { MagicContextVersionsUseCase } from "@session-manager/application/MagicContextVersionsUseCase"
import { versionsText, type MagicContextVersions } from "@session-manager/domain/model/MagicContextRelease"
import { MAGIC_CONTEXT_PACKAGE, pinnedMagicContext, stripComments } from "@session-manager/domain/services/Jsonc"
import { OpencodeMagicContextConfigAdapter } from "@session-manager/infrastructure/adapters/outbound/magic-context/OpencodeMagicContextConfigAdapter"
import { NpmRegistryAdapter } from "@session-manager/infrastructure/adapters/outbound/npm/NpmRegistryAdapter"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-mc-versions-")
})
afterEach(() => {
  removeTemporary(directory)
})

describe("reading OpenCode's configuration for Magic Context", () => {
  it("blanks comments out, keeping strings that look like comments", () => {
    expect(stripComments('{ "a": "x // y", // gone\n "b": 1 /* gone */, "c": "\\"/*" }')).toBe('{ "a": "x // y", \n "b": 1 , "c": "\\"/*" }')
    expect(stripComments('"open /* never closed')).toBe('"open /* never closed')
    expect(stripComments("a /* never closed")).toBe("a ")
    expect(stripComments('"ends with a backslash\\')).toBe('"ends with a backslash\\')
  })

  it("finds the pinned version, `latest` for the bare name, and nothing in a comment", () => {
    expect(pinnedMagicContext('{ "plugin": [ "other", "@cortexkit/opencode-magic-context@0.47.0", ] }')).toBe("0.47.0")
    expect(pinnedMagicContext('{ "plugin": ["@cortexkit/opencode-magic-context"] }')).toBe("latest")
    expect(pinnedMagicContext('{ // "@cortexkit/opencode-magic-context@0.1.0"\n "plugin": [] }')).toBeNull()
    expect(MAGIC_CONTEXT_PACKAGE).toBe("@cortexkit/opencode-magic-context")
  })

  it("reads a folder entry as its absolute path, and null when no entry names Magic Context", () => {
    const folder = "/home/u/.local/share/opencode-session-manager/patches/installs/0.49.56/node_modules/@cortexkit/opencode-magic-context"
    expect(pinnedMagicContext(`{ "plugin": ["${folder}"] }`)).toBe(folder)
    expect(pinnedMagicContext('{ "plugin": ["other"] }')).toBeNull()
    expect(pinnedMagicContext("{}")).toBeNull()
  })
})

describe("the Magic Context this machine runs", () => {
  const install = (spec: string, stamp: string, manifest: string) => {
    const folder = join(directory, "cache", "npm", "@cortexkit", `opencode-magic-context@${spec}`, stamp, "node_modules", "@cortexkit", "opencode-magic-context")
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, "package.json"), manifest)
  }

  it("reads opencode.jsonc (else opencode.json) and the copy OpenCode installed for the spec, newest stamp first", () => {
    const config = new OpencodeMagicContextConfigAdapter(join(directory, "config"), join(directory, "cache"))
    expect(config.pinned()).toBeNull()
    mkdirSync(join(directory, "config"), { recursive: true })
    writeFileSync(join(directory, "config", "opencode.json"), '{ "plugin": ["@cortexkit/opencode-magic-context"] }')
    expect(config.pinned()).toBe("latest")
    writeFileSync(join(directory, "config", "opencode.jsonc"), '{ "plugin": ["@cortexkit/opencode-magic-context@0.47.0"] // pinned\n}')
    expect(config.pinned()).toBe("0.47.0")
    expect(config.installed("0.47.0")).toBeNull()
    install("latest", "1", '{ "version": "0.45.0" }')
    install("latest", "2", '{ "version": "0.46.1" }')
    install("latest", "3", "not json")
    install("latest", "4", '{ "version": 46 }')
    expect(config.installed("latest")).toBe("0.46.1")
    mkdirSync(join(directory, "cache", "npm", "@cortexkit", "opencode-magic-context@0.47.0"), { recursive: true })
    expect(config.installed("0.47.0")).toBeNull()
  })

  it("asks npm only when told to, compares the versions, and says what it found", async () => {
    const config = { pinned: () => "0.47.0" as string | null, installed: (spec: string) => (spec === "0.47.0" ? "0.47.0" : null) }
    let asked = 0
    const registry = {
      latest: async () => {
        asked++
        return asked === 1 ? "0.48.0" : null
      },
    }
    const useCase = new MagicContextVersionsUseCase(config, registry)
    const local = useCase.local()
    expect([local, asked]).toEqual([{ pinned: "0.47.0", loaded: "0.47.0", latest: null }, 0])
    const online = await useCase.withLatest(local)
    expect([online.latest, useCase.newer(online)]).toEqual(["0.48.0", true])
    const silent = await useCase.withLatest(local)
    expect([silent.latest, useCase.newer(silent)]).toEqual(["unknown", false])
    const offline = await new MagicContextVersionsUseCase(config, null).withLatest(local)
    expect([offline.latest, useCase.newer(offline), useCase.newer(local)]).toEqual(["offline", false, false])
    expect(useCase.newer({ ...local, latest: "0.47.0" })).toBe(false)
    expect(useCase.newer({ ...local, loaded: null, latest: "0.48.0" })).toBe(false)
    expect(new MagicContextVersionsUseCase({ pinned: () => null, installed: () => "never" }, null).local()).toEqual({ pinned: null, loaded: null, latest: null })

    const text = (versions: Partial<MagicContextVersions>, newer = false) => versionsText({ ...local, ...versions }, newer)
    expect([
      text({ latest: "0.48.0" }, true),
      text({ latest: "0.47.0" }),
      text({}),
      text({ latest: "offline" }),
      text({ latest: "unknown" }),
      text({ pinned: "latest", loaded: "0.45.0", latest: "0.48.0" }, true),
      text({ loaded: null, latest: "offline" }),
      text({ pinned: null }),
    ]).toEqual([
      "Magic Context 0.47.0 · 0.48.0 available on npm",
      "Magic Context 0.47.0 · up to date (npm 0.47.0)",
      "Magic Context 0.47.0 · checking npm…",
      "Magic Context 0.47.0 · npm not checked",
      "Magic Context 0.47.0 · npm did not answer",
      "Magic Context 0.45.0 (opencode.jsonc: latest) · 0.48.0 available on npm",
      "Magic Context 0.47.0 (not installed yet) · npm not checked",
      "Magic Context: not configured in opencode.jsonc",
    ])
  })
})

describe("NpmRegistryAdapter", () => {
  it("reads the latest dist-tag, and treats an error, a bad answer, no answer in time or no registry as unknown", async () => {
    const paths: string[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const path = new URL(request.url).pathname
        paths.push(path)
        if (path.startsWith("/good/")) return Response.json({ version: "0.48.0" })
        if (path.startsWith("/numeric/")) return Response.json({ version: 48 })
        if (path.startsWith("/slow/")) await Bun.sleep(500)
        return new Response("no", { status: 404 })
      },
    })
    try {
      const at = (prefix: string, timeoutMs = 2000) => new NpmRegistryAdapter(`${server.url.origin}/${prefix}/`, MAGIC_CONTEXT_PACKAGE, timeoutMs).latest()
      expect(await at("good")).toBe("0.48.0")
      expect(paths[0]).toBe("/good/@cortexkit%2fopencode-magic-context/latest")
      expect(await at("numeric")).toBeNull()
      expect(await at("missing")).toBeNull()
      expect(await at("slow", 50)).toBeNull()
    } finally {
      server.stop(true)
    }
    expect(await new NpmRegistryAdapter("http://127.0.0.1:9", MAGIC_CONTEXT_PACKAGE, 2000).latest()).toBeNull()
  })
})
