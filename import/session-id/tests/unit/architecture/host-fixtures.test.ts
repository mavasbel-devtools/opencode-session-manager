import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

// Verbatim host sources the e2e tier loads. An accidental edit must fail here,
// not silently change what "the host's own rule" means.
const FIXTURES = [
  {
    file: "structure.ts",
    origin: "packages/tui/src/plugin/structure.ts @ v2.0.14 (8864eb507e4111f5e8b50a48d10f77d8d7cc8c62)",
    bytes: 6279,
    sha256: "14513c9decc897c137a3712de389bbb779ddeaac0c7e12c6669838940e52e753",
  },
] as const

const dir = path.resolve(import.meta.dir, "../../support/fixtures/host-2.0.14")

describe("verbatim OpenCode 2.0.14 host fixtures", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.file} is byte-identical to ${fixture.origin}`, () => {
      const bytes = fs.readFileSync(path.join(dir, fixture.file))
      expect({ bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }).toEqual({
        bytes: fixture.bytes,
        sha256: fixture.sha256,
      })
      // LF only: the hash above is the hash of the git blob, not of a converted copy.
      expect(bytes.includes(Buffer.from("\r\n"))).toBe(false)
    })
  }

  it("documents every fixture it ships", () => {
    const shipped = fs
      .readdirSync(dir)
      .filter((entry) => entry !== "README.md")
      .sort()
    expect(shipped).toEqual(FIXTURES.map((fixture) => fixture.file).sort())
    const readme = fs.readFileSync(path.join(dir, "README.md"), "utf8")
    for (const fixture of FIXTURES) expect(readme).toContain(fixture.sha256)
  })
})
