import { describe, expect, it } from "bun:test"
import fs from "node:fs"
import { SUPPORTED_PLATFORMS } from "@session-manager/main/cli/platform"
import { PLATFORMS, platformOf, relative, SRC, sourceFiles } from "@test/support/source-files"

const files = sourceFiles()
const importsOf = (file: string) =>
  [...fs.readFileSync(file, "utf8").matchAll(/(?:from\s*|import\()\s*["']([^"']+)["']/g)].map((match) => match[1]!)

describe("platform law", () => {
  it("has one adapters folder and one container per supported platform", () => {
    expect([...PLATFORMS]).toEqual([...SUPPORTED_PLATFORMS])
    const folders = fs.readdirSync(`${SRC}/infrastructure/adapters/outbound/platform`).sort()
    expect(folders).toEqual([...SUPPORTED_PLATFORMS].sort())
    for (const platform of SUPPORTED_PLATFORMS) expect(fs.existsSync(`${SRC}/main/${platform}-container.ts`)).toBe(true)
  })

  it("imports a platform's adapters only from that platform's container or folder", () => {
    for (const file of files) {
      for (const specifier of importsOf(file)) {
        const target = specifier.match(/^@session-manager\/infrastructure\/adapters\/outbound\/platform\/([^/]+)\//)?.[1]
        if (target === undefined) continue
        const own = platformOf(relative(file))
        expect({ file: relative(file), specifier, own: own === target }).toEqual({ file: relative(file), specifier, own: true })
      }
    }
  })

  it("loads a platform's container only through main/cli/platform.ts, on demand", () => {
    for (const file of files) {
      for (const specifier of importsOf(file)) {
        const container = specifier.match(/^@session-manager\/main\/(\w+)-container$/)?.[1]
        if (container === undefined || !SUPPORTED_PLATFORMS.includes(container)) continue
        expect({ file: relative(file), specifier }).toEqual({ file: "main/cli/platform.ts", specifier })
      }
    }
    const platform = fs.readFileSync(`${SRC}/main/cli/platform.ts`, "utf8")
    expect(/^import [^\n]*-container"/m.test(platform)).toBe(false)
  })
})
