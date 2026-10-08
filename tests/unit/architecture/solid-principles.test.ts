// SOLID as a gate, not a slogan: each rule below is the shape the repository
// requires, checked against every src file.
import { describe, expect, it } from "bun:test"
import fs from "node:fs"
import { relative, sourceFiles } from "@test/support/source-files"

const files = sourceFiles()
const read = (file: string) => fs.readFileSync(file, "utf8")
const classesIn = (code: string) => [...code.matchAll(/export class (\w+)/g)].map((match) => match[1]!)

describe("SOLID structure", () => {
  it("exports at most one class per file, named after the file (single responsibility)", () => {
    for (const file of files) {
      const classes = classesIn(read(file))
      expect({ file: relative(file), classes: classes.length <= 1 }).toEqual({ file: relative(file), classes: true })
      if (classes.length === 1)
        expect({ file: relative(file), name: classes[0] }).toEqual({
          file: relative(file),
          name: relative(file).split("/").at(-1)!.replace(/\.tsx?$/, ""),
        })
    }
  })

  it("gives every class an explicit constructor (no implicit dependency wiring)", () => {
    for (const file of files) {
      const code = read(file)
      const classes = (code.match(/\bclass\s+\w+/g) ?? []).length
      const constructors = (code.match(/\bconstructor\s*\(/g) ?? []).length
      expect({ file: relative(file), classes, constructors }).toEqual({ file: relative(file), classes, constructors: classes })
    }
  })

  it("declares the port every adapter implements (interface segregation, Liskov)", () => {
    for (const file of files.filter((entry) => /(Adapter|UseCase)\.tsx?$/.test(entry))) {
      const code = read(file)
      if (classesIn(code).length === 0) continue
      // Inbound adapters translate a host API and implement no port of ours; the
      // classes that stand in for a port must say so.
      const declares = /export class \w+(?:<[^>]*>)?\s+implements\s+\w+/.test(code)
      const inbound = relative(file).includes("/adapters/inbound/")
      expect({ file: relative(file), declares: declares || inbound }).toEqual({ file: relative(file), declares: true })
    }
  })

  it("makes use cases depend on port types only, never on a concrete adapter (dependency inversion)", () => {
    for (const file of files.filter((entry) => relative(entry).startsWith("application/"))) {
      const code = read(file)
      for (const specifier of [...code.matchAll(/from\s*["']([^"']+)["']/g)].map((match) => match[1]!)) {
        expect({ file: relative(file), specifier, allowed: /^@session-manager\/domain\//.test(specifier) }).toEqual({
          file: relative(file),
          specifier,
          allowed: true,
        })
      }
      expect(/Adapter/.test(code)).toBe(false)
    }
  })

  it("keeps construction in the composition roots (only main/*-container.ts uses `new` on our classes)", () => {
    const ours = new Set(files.flatMap((file) => classesIn(read(file))))
    for (const file of files) {
      const constructed = [...read(file).matchAll(/\bnew ([A-Z]\w+)/g)]
        .map((match) => match[1]!)
        // Domain errors are values, not dependencies: raising one is allowed anywhere.
        .filter((name) => ours.has(name) && !name.endsWith("Error"))
      const allowed = /^main\/\w+-container\.ts$/.test(relative(file)) || constructed.length === 0
      expect({ file: relative(file), constructed, allowed }).toEqual({ file: relative(file), constructed, allowed: true })
    }
  })

  it("extends behaviour through ports, so no src class extends another src class (open/closed)", () => {
    const ours = new Set(files.flatMap((file) => classesIn(read(file))))
    for (const file of files) {
      const bases = [...read(file).matchAll(/\bclass \w+ extends (\w+)/g)].map((match) => match[1]!)
      for (const base of bases)
        expect({ file: relative(file), base, ours: ours.has(base) }).toEqual({ file: relative(file), base, ours: false })
    }
  })
})
