import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { globSync } from "node:fs"
import { loadEverySource } from "#test/support/source-files.ts"

const DOMAIN = "src/domain/"
const APPLICATION = "src/application/"
const INFRASTRUCTURE = "src/infrastructure/"
const MAIN = "src/main/"

function importsOf(file: string): readonly string[] {
  const text = readFileSync(file, "utf8")
  const specifiers: string[] = []
  for (const match of text.matchAll(/from\s+"([^"]+)"/g)) specifiers.push(match[1] as string)
  return specifiers
}

test("coverage completeness: every source file is loaded by this tier", async () => {
  const loaded = await loadEverySource()
  assert.ok(loaded.length > 0)
  for (const file of loaded) assert.match(file, /^src[\\/].*\.ts$/)
})

test("domain imports nothing outward", () => {
  for (const file of globSync(`${DOMAIN}**/*.ts`)) {
    for (const specifier of importsOf(file)) {
      if (!specifier.startsWith("#")) continue
      assert.ok(
        specifier.startsWith("#domain/"),
        `${file} imports ${specifier}: the domain may only import from #domain`,
      )
    }
  }
})

test("application imports only domain and application", () => {
  for (const file of globSync(`${APPLICATION}**/*.ts`)) {
    for (const specifier of importsOf(file)) {
      if (!specifier.startsWith("#")) continue
      assert.ok(
        specifier.startsWith("#domain/") || specifier.startsWith("#application/"),
        `${file} imports ${specifier}: the application layer may only import #domain and #application`,
      )
    }
  }
})

test("infrastructure imports only domain, application and infrastructure", () => {
  for (const file of globSync(`${INFRASTRUCTURE}**/*.ts`)) {
    for (const specifier of importsOf(file)) {
      if (!specifier.startsWith("#")) continue
      assert.ok(
        specifier.startsWith("#domain/") || specifier.startsWith("#application/") || specifier.startsWith("#infrastructure/"),
        `${file} imports ${specifier}: infrastructure may not import #main`,
      )
    }
  }
})

test("only main wires concrete adapters together", () => {
  for (const file of globSync(`${INFRASTRUCTURE}**/*.ts`)) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /from "#application\/.*UseCase\.ts"/, `${file} imports a use case directly`)
  }
  const container = readFileSync("src/main/container.ts", "utf8")
  for (const name of ["NodeSqliteAdapter", "NodeFileSystemAdapter", "SystemClockAdapter", "JsonReportAdapter", "ConsoleOutputAdapter"]) {
    assert.match(container, new RegExp(`new ${name}\\(`), `container.ts should construct ${name}`)
  }
  // The operating-system adapters are wired per platform, each in src/main/platform/<platform>.ts.
  const wiring: Record<string, readonly string[]> = {
    "src/main/platform/linux.ts": ["ProcProcessListAdapter", "ProcFdHoldersAdapter"],
    "src/main/platform/win32.ts": ["TasklistAdapter", "RenameProbeHoldersAdapter"],
  }
  for (const [file, names] of Object.entries(wiring)) {
    const source = readFileSync(file, "utf8")
    for (const name of names) assert.match(source, new RegExp(`new ${name}\\(`), `${file} should construct ${name}`)
  }
  assert.ok(MAIN.length > 0)
})

test("platform law: one folder per supported platform, imported only by that platform's wiring", async () => {
  const { SUPPORTED_PLATFORMS } = await import("#main/platform.ts")
  const PLATFORM = `${INFRASTRUCTURE}adapters/outbound/platform/`
  const folders = globSync(`${PLATFORM}*/`).map((folder) => folder.replaceAll("\\", "/").replace(PLATFORM, "").replace(/\/$/, ""))
  assert.deepEqual(folders.sort(), [...SUPPORTED_PLATFORMS].sort())
  assert.deepEqual(
    globSync(`${MAIN}platform/*.ts`).map((file) => file.replaceAll("\\", "/").replace(`${MAIN}platform/`, "")).sort(),
    SUPPORTED_PLATFORMS.map((name) => `${name}.ts`).sort(),
  )
  for (const file of globSync("src/**/*.ts").map((file) => file.replaceAll("\\", "/"))) {
    for (const specifier of importsOf(file)) {
      const match = specifier.match(/^#infrastructure\/adapters\/outbound\/platform\/([^/]+)\//)
      if (match === null) continue
      const own = file === `${MAIN}platform/${match[1]}.ts` || file.startsWith(`${PLATFORM}${match[1]}/`)
      assert.ok(own, `${file} imports ${specifier}: a platform's adapters are wired only by ${MAIN}platform/${match[1]}.ts`)
    }
  }
})
