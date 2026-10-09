import { describe, expect, it } from "bun:test"
import fs from "node:fs"
import { relative, SRC, sourceFiles } from "@test/support/source-files"

function importsOf(file: string): string[] {
  const code = fs.readFileSync(file, "utf8")
  return [...code.matchAll(/^\s*(?:import|export)\b[^"']*?from\s*["']([^"']+)["']/gm)].map((match) => match[1]!)
}

const layer = (file: string) => relative(file).split("/")[0]!
const files = sourceFiles()

// Allowed alias targets per layer; dependencies point inward only.
const ALLOW: Record<string, readonly string[]> = {
  domain: ["@session-manager/domain/"],
  application: ["@session-manager/domain/", "@session-manager/application/"],
  infrastructure: ["@session-manager/domain/", "@session-manager/application/", "@session-manager/infrastructure/"],
  main: ["@session-manager/"],
}

const ENGINE = "infrastructure/adapters/outbound/sqlite/engine/Store.ts"

describe("storage through the ORM", () => {
  it("lets only the store engine open SQLite or write SQL text", () => {
    for (const file of files) {
      const code = fs.readFileSync(file, "utf8")
      const raw = [
        ...(importsOf(file).includes("bun:sqlite") ? ["imports bun:sqlite"] : []),
        ...(/\bimport\s*\{[^}]*\bsql\b[^}]*\}\s*from\s*["']drizzle-orm["']/.test(code) ? ["imports drizzle's sql template"] : []),
        ...(/\.(?:query|prepare|exec)\(\s*[`"']/.test(code) ? ["runs SQL text"] : []),
      ]
      const allowed = relative(file) === ENGINE || raw.length === 0
      expect({ file: relative(file), raw, allowed }).toEqual({ file: relative(file), raw, allowed: true })
    }
  })

  it("has the engine do all three, so the rule above is about something", () => {
    const engine = files.find((file) => relative(file) === ENGINE)!
    const code = fs.readFileSync(engine, "utf8")
    expect([importsOf(engine).includes("bun:sqlite"), /\bsql\b/.test(code), /\.query\(/.test(code)]).toEqual([true, true, true])
  })
})

describe("hexagonal architecture", () => {
  it("covers all four layers", () => {
    expect([...new Set(files.map(layer))].sort()).toEqual(["application", "domain", "infrastructure", "main"])
  })

  it("keeps every layer's internal imports pointing inward", () => {
    for (const file of files) {
      for (const specifier of importsOf(file).filter((value) => value.startsWith("@session-manager/"))) {
        const allowed = ALLOW[layer(file)]!.some((prefix) => specifier.startsWith(prefix))
        expect({ file: relative(file), specifier, allowed }).toEqual({ file: relative(file), specifier, allowed: true })
      }
    }
  })

  it("uses aliases, never relative imports", () => {
    for (const file of files) for (const specifier of importsOf(file)) expect(specifier.startsWith(".")).toBe(false)
  })

  it("keeps domain and application free of I/O and host packages", () => {
    for (const file of files.filter((entry) => ["domain", "application"].includes(layer(entry)))) {
      for (const specifier of importsOf(file))
        expect({ file: relative(file), specifier, internal: specifier.startsWith("@session-manager/") }).toEqual({
          file: relative(file),
          specifier,
          internal: true,
        })
    }
  })

  it("has no runtime @opencode/* import anywhere (the host API is typed structurally)", () => {
    for (const file of files) expect(/from\s*["']@opencode\//.test(fs.readFileSync(file, "utf8"))).toBe(false)
  })

  it("only imports @opentui/* for types outside the view adapter", () => {
    for (const file of files.filter((entry) => !entry.endsWith(".tsx"))) {
      const code = fs.readFileSync(file, "utf8")
      for (const line of code.split("\n").filter((value) => /from\s*["']@opentui\//.test(value)))
        expect({ file: relative(file), line: line.trim(), typeOnly: line.startsWith("import type ") }).toEqual({
          file: relative(file),
          line: line.trim(),
          typeOnly: true,
        })
    }
  })

  it("only main/ imports a composition root", () => {
    const roots = [
      "@session-manager/main/server-container",
      "@session-manager/main/tui-container",
      "@session-manager/main/v1-container",
      "@session-manager/main/cli-container",
    ]
    for (const file of files.filter((entry) => layer(entry) !== "main"))
      for (const root of roots) expect(importsOf(file).includes(root)).toBe(false)
  })

  it("keeps one composition root per runtime (v2 server, v2 TUI, v1 TUI, CLI and its platform halves), so the server bundle never pulls in the TUI view", () => {
    const roots = files.filter((file) => /^main\/\w+-container\.ts$/.test(relative(file))).map(relative)
    expect(roots).toEqual([
      "main/cli-container.ts",
      "main/linux-container.ts",
      "main/server-container.ts",
      "main/tui-container.ts",
      "main/v1-container.ts",
      "main/win32-container.ts",
    ])
    const serverGraph = new Set<string>()
    const walk = (entry: string) => {
      if (serverGraph.has(entry)) return
      serverGraph.add(entry)
      const file = files.find((candidate) => relative(candidate) === entry)
      if (!file) return
      for (const specifier of importsOf(file).filter((value) => value.startsWith("@session-manager/"))) {
        const target = specifier.slice("@session-manager/".length)
        const resolved = files.map(relative).find((candidate) => candidate.replace(/\.tsx?$/, "") === target)
        if (resolved) walk(resolved)
      }
    }
    walk("main/v2/server.ts")
    expect([...serverGraph].filter((entry) => entry.endsWith(".tsx"))).toEqual([])
    expect(serverGraph.has("main/tui-container.ts")).toBe(false)
  })

  it("splits ports into inbound and outbound, one port per file, under domain/ports", () => {
    const ports = files.filter((file) => relative(file).startsWith("domain/ports/"))
    expect(ports.length).toBeGreaterThan(0)
    for (const file of ports) {
      const rest = relative(file).slice("domain/ports/".length)
      expect({ file: relative(file), side: rest.split("/")[0] }).toEqual({
        file: relative(file),
        side: rest.startsWith("inbound/") ? "inbound" : "outbound",
      })
      const code = fs.readFileSync(file, "utf8")
      const portInterfaces = [...code.matchAll(/export interface (\w*Port)\b/g)].map((match) => match[1]!)
      expect({ file: relative(file), portInterfaces }).toEqual({
        file: relative(file),
        portInterfaces: [rest.split("/")[1]!.replace(/\.ts$/, "")],
      })
    }
  })

  it("has both inbound and outbound adapters, and no adapter outside those folders", () => {
    const adapters = files.filter((file) => relative(file).startsWith("infrastructure/adapters/"))
    const sides = adapters.map((file) => relative(file).split("/")[2])
    expect(new Set(sides)).toEqual(new Set(["inbound", "outbound"]))
    for (const file of files.filter((entry) => /Adapter\.tsx?$/.test(entry)))
      expect({ file: relative(file), underAdapters: relative(file).startsWith("infrastructure/adapters/") }).toEqual({
        file: relative(file),
        underAdapters: true,
      })
  })
})
