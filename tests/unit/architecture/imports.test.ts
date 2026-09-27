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
  for (const name of ["NodeSqliteAdapter", "NodeFileSystemAdapter", "TasklistAdapter", "SystemClockAdapter", "JsonReportAdapter", "ConsoleOutputAdapter"]) {
    assert.match(container, new RegExp(`new ${name}\\(`), `container.ts should construct ${name}`)
  }
  assert.ok(MAIN.length > 0)
})
