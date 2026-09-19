import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import path from "node:path"

function getTsFiles(dir: string): string[] {
  let results: string[] = []
  const list = fs.readdirSync(dir, { withFileTypes: true })
  for (const file of list) {
    const fullPath = path.join(dir, file.name)
    if (file.isDirectory()) {
      results = results.concat(getTsFiles(fullPath))
    } else if (file.name.endsWith(".ts")) {
      results.push(fullPath)
    }
  }
  return results
}

describe("Hexagonal Architecture Import Rules", () => {
  const rootSrc = path.resolve(__dirname, "../../src")
  const domainFiles = getTsFiles(path.join(rootSrc, "domain"))
  const appFiles = getTsFiles(path.join(rootSrc, "application"))

  it("domain files have zero dependencies on outer layers", () => {
    for (const file of domainFiles) {
      const content = fs.readFileSync(file, "utf8")
      const lines = content.split("\n")
      for (const line of lines) {
        if (line.startsWith("import ") || line.startsWith("export ")) {
          expect(line).not.toContain("@transfer/application")
          expect(line).not.toContain("@transfer/infrastructure")
          expect(line).not.toContain("@transfer/main")
          expect(line).not.toContain("bun:sqlite")
          expect(line).not.toContain("node:child_process")
        }
      }
    }
  })

  it("application files have zero dependencies on infrastructure or main", () => {
    for (const file of appFiles) {
      const content = fs.readFileSync(file, "utf8")
      const lines = content.split("\n")
      for (const line of lines) {
        if (line.startsWith("import ") || line.startsWith("export ")) {
          expect(line).not.toContain("@transfer/infrastructure")
          expect(line).not.toContain("@transfer/main")
        }
      }
    }
  })
})
