import { describe, it, expect } from "bun:test"
import path from "node:path"
import { expandHome, abbreviateHome } from "@transfer/domain/paths"

describe("expandHome", () => {
  const home = process.platform === "win32" ? "C:\\Users\\tester" : "/home/tester"

  it("expands a bare ~ to home", () => {
    expect(expandHome("~", home)).toBe(home)
  })

  it("expands ~/path to a home-relative path", () => {
    expect(expandHome("~/work/repo", home)).toBe(path.join(home, "work", "repo"))
    if (process.platform === "win32") {
      expect(expandHome("~\\work\\repo", home)).toBe(path.join(home, "work", "repo"))
    }
  })

  it("leaves absolute paths untouched (resolved)", () => {
    const absolute = process.platform === "win32" ? "C:\\work\\repo" : "/work/repo"
    expect(expandHome(absolute, home)).toBe(path.resolve(absolute))
  })
})

describe("abbreviateHome", () => {
  const home = process.platform === "win32" ? "C:\\Users\\tester" : "/home/tester"

  it("abbreviates a home-relative directory", () => {
    expect(abbreviateHome(path.join(home, "work", "repo"), home)).toBe("~" + path.sep + path.join("work", "repo"))
  })

  it("returns ~ for the home directory itself", () => {
    expect(abbreviateHome(home, home)).toBe("~")
  })

  it("returns the input unchanged when outside home", () => {
    const outside = process.platform === "win32" ? "D:\\elsewhere" : "/elsewhere"
    expect(abbreviateHome(outside, home)).toBe(outside)
  })
})
