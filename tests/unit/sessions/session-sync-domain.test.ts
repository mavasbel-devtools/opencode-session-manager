import { describe, expect, it } from "bun:test"
import { InvalidMapRuleError } from "@session-manager/domain/errors/InvalidMapRuleError"
import { OpenCodeFormatMismatchError } from "@session-manager/domain/errors/OpenCodeFormatMismatchError"
import { actionFor, isDiverged, isPrefer } from "@session-manager/domain/model/SessionSync"
import { mappingFromRules, NO_WINDOWS_PROFILE, parseMapRule } from "@session-manager/domain/services/MapRules"
import { PathRewriter } from "@session-manager/domain/services/PathRewriter"
import { parseOptions } from "@session-manager/infrastructure/adapters/inbound/cli/arguments"

describe("map rules", () => {
  it("parses from=to on the first equals sign", () => {
    expect(parseMapRule("C:\\Users\\Me=/home/me")).toEqual({ from: "C:\\Users\\Me", to: "/home/me" })
    expect(parseMapRule(" /a = /b=c ")).toEqual({ from: "/a", to: "/b=c" })
    for (const bad of ["/a", "=/b", "/a=", ""]) expect(() => parseMapRule(bad)).toThrow(new InvalidMapRuleError(bad, "expected <from>=<to>"))
  })

  it("maps a Windows profile, folders inside it and POSIX folders", () => {
    expect(
      mappingFromRules(
        [
          { from: "C:\\Users\\Me\\", to: "/home/me/" },
          { from: "c:/users/me/Old/proj", to: "/srv/proj" },
          { from: "/home/me/a", to: "/home/me/b" },
        ],
        [],
        "/ignored",
      ),
    ).toEqual({
      home: "/home/me",
      windowsUser: "Me",
      drive: "C",
      relocations: [
        { from: "/home/me/Old/proj", to: "/srv/proj" },
        { from: "/home/me/a", to: "/home/me/b" },
      ],
    })
  })

  it("infers the one Windows profile the sessions live in, or the one a folder rule names", () => {
    expect(mappingFromRules([], ["C:/Users/Robin/x", "C:\\Users\\Robin", "/posix"], "/home/r")).toMatchObject({ home: "/home/r", windowsUser: "Robin", drive: "C" })
    expect(mappingFromRules([{ from: "D:\\Users\\Kim\\work", to: "/w" }], [], "/home/k")).toMatchObject({
      windowsUser: "Kim",
      drive: "D",
      relocations: [{ from: "/home/k/work", to: "/w" }],
    })
    expect(mappingFromRules([], ["/a", "/b"], "/home/x")).toBeNull()
    expect(() => mappingFromRules([], ["C:/Users/A/x", "C:/Users/B/y"], "/h")).toThrow(/several Windows profiles \(c:a, c:b\)/)
  })

  it("moves POSIX folders alone, with a profile that matches nothing", () => {
    const mapping = mappingFromRules([{ from: "/old/", to: "/new" }, { from: "/", to: "/" }], [], "/home/x")
    expect(mapping).toEqual({
      home: "/home/x",
      windowsUser: NO_WINDOWS_PROFILE,
      drive: NO_WINDOWS_PROFILE,
      relocations: [
        { from: "/old", to: "/new" },
        { from: "/", to: "/" },
      ],
    })
    const rewriter = new PathRewriter(mapping!)
    expect(rewriter.rewrite("cd /old/x and C:/Users/Me")).toBe("cd /new/x and C:/Users/Me")
    expect(rewriter.residual("C:/Users/Me")).toBe(false)
  })

  it("refuses rules it cannot apply", () => {
    const refuse = (rules: { from: string; to: string }[], reason: RegExp) => expect(() => mappingFromRules(rules, [], "/h")).toThrow(reason)
    refuse([{ from: "/a", to: "C:\\b" }], /writing Windows paths is not supported/)
    refuse([{ from: "/a", to: "b" }], /must be absolute/)
    refuse([{ from: "a", to: "/b" }], /source folder must be absolute/)
    refuse([{ from: "C:\\Users\\A", to: "/a" }, { from: "C:\\Users\\B", to: "/b" }], /only one Windows profile/)
    refuse([{ from: "C:\\Users\\A", to: "/a" }, { from: "C:\\Users\\B\\x", to: "/b" }], /map the Windows profile it is in as well/)
    refuse([{ from: "C:\\Users\\A", to: "/a" }, { from: "D:\\Users\\A\\x", to: "/b" }], /map the Windows profile it is in as well/)
    expect(new InvalidMapRuleError("a=b", "why").name).toBe("InvalidMapRuleError")
  })
})

describe("session sync rules", () => {
  it("acts on a session by how the histories relate", () => {
    expect(["missing", "source-ahead", "diverged", "same", "target-ahead"].map((relation) => actionFor(relation as never))).toEqual([
      "copy",
      "replace",
      "skip",
      "keep",
      "keep",
    ])
    expect(["further", "keep", "replace", "both"].map(isPrefer)).toEqual([true, true, true, false])
    expect(["missing", "source-ahead", "diverged", "same"].map((relation) => actionFor(relation as never, "fork"))).toEqual(["copy", "replace", "fork", "keep"])
    expect(["skip", "fork", "merge"].map(isDiverged)).toEqual([true, true, false])
  })

  it("explains a format mismatch", () => {
    const error = new OpenCodeFormatMismatchError("/s", "m2", "/t", "m1")
    expect([error.name, error.message]).toEqual([
      "OpenCodeFormatMismatchError",
      "/s is at OpenCode migration m2 and /t at m1: start the same OpenCode version on both once (it migrates its store), then sync again",
    ])
  })
})

describe("parseOptions", () => {
  it("reads options with values, repeated ones and bare flags, and refuses anything else", () => {
    const parsed = parseOptions(["--a", "1", "--b", "2", "--a", "3", "--f"], ["--a", "--b"], ["--f"])
    expect(parsed).toEqual({
      single: new Map([
        ["--a", "3"],
        ["--b", "2"],
      ]),
      many: new Map([
        ["--a", ["1", "3"]],
        ["--b", ["2"]],
      ]),
      flags: new Set(["--f"]),
    })
    expect(parseOptions(["--x", "1"], ["--a"], [])).toBeNull()
    expect(parseOptions(["--a"], ["--a"], [])).toBeNull()
    expect(parseOptions(["--a", "--f"], ["--a"], ["--f"])).toBeNull()
  })
})
