import { describe, expect, it } from "bun:test"
import { compareVersions } from "@session-manager/domain/services/Versions"

describe("compareVersions", () => {
  it("orders numerically, not as text", () => {
    expect(["0.47.0", "0.9.0", "0.47.1", "0.100.0"].sort(compareVersions)).toEqual(["0.9.0", "0.47.0", "0.47.1", "0.100.0"])
    expect(compareVersions("1.0", "1.0.0")).toBe(0)
    expect(compareVersions("1.0.0-beta.2", "1.0.0")).toBeLessThan(0)
  })

  it("compares versions in semver 2.0.0 §11 order", () => {
    expect(compareVersions("0.45.0", "0.9.9")).toBeGreaterThan(0)
    expect(compareVersions("1.0", "1.0.0")).toBe(0)
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0)
    expect(compareVersions("1.x", "1.0")).toBe(0)
    expect(compareVersions("0.1", "0.2")).toBeLessThan(0)
  })

  it("orders pre-releases per the semver 2.0.0 §11 example, ignoring build metadata", () => {
    const ordered = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ]
    for (let index = 0; index + 1 < ordered.length; index++) {
      expect(compareVersions(ordered[index]!, ordered[index + 1]!)).toBeLessThan(0)
      expect(compareVersions(ordered[index + 1]!, ordered[index]!)).toBeGreaterThan(0)
    }
    expect(compareVersions("1.0.0+build.1", "1.0.0+build.2")).toBe(0)
    expect(compareVersions("1.0.0-beta.1+build", "1.0.0-beta.1")).toBe(0)
  })
})
