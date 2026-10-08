import { describe, expect, it } from "bun:test"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"

describe("Profile", () => {
  it("puts both stores under one data home, whatever separator it ends with", () => {
    expect(profileAt("linux", "/home/me/.local/share/")).toEqual({
      name: "linux",
      dataHome: "/home/me/.local/share",
      opencodeDb: "/home/me/.local/share/opencode/opencode.db",
      contextDb: "/home/me/.local/share/cortexkit/magic-context/context.db",
    })
    expect(profileAt("windows", "C:\\Users\\Me\\.local\\share\\").opencodeDb).toBe("C:\\Users\\Me\\.local\\share/opencode/opencode.db")
    expect(profileAt("root", "/").contextDb).toBe("/cortexkit/magic-context/context.db")
  })

  it("defaults to $XDG_DATA_HOME, else ~/.local/share", () => {
    expect(defaultDataHome({ XDG_DATA_HOME: "/data" }, "/home/me")).toBe("/data")
    expect(defaultDataHome({ XDG_DATA_HOME: "" }, "/home/me")).toBe("/home/me/.local/share")
    expect(defaultDataHome({}, "/home/me")).toBe("/home/me/.local/share")
  })
})
