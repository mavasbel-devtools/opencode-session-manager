import { describe, expect, it } from "bun:test"
import { InvalidRenameRuleError } from "@session-manager/domain/errors/InvalidRenameRuleError"
import { CompositeTextRewriter } from "@session-manager/domain/services/CompositeTextRewriter"
import { dashEncoded, NameRewriter } from "@session-manager/domain/services/NameRewriter"
import { PathRewriter } from "@session-manager/domain/services/PathRewriter"
import { relocationsFromRules } from "@session-manager/domain/services/RelocateRules"
import { renamesFromRules } from "@session-manager/domain/services/RenameRules"
import { RENAME_CASES, RENAMES } from "@test/support/sessions/rename-cases"

describe("whole-name replacement of renamed folders", () => {
  const rewriter = new NameRewriter(RENAMES)
  for (const entry of RENAME_CASES)
    it(entry.name, () => {
      expect(rewriter.rewrite(entry.input)).toBe(entry.expected)
      // Once replaced, nothing is left to replace, and a second pass changes nothing.
      expect(rewriter.residual(rewriter.rewrite(entry.input))).toBe(false)
      expect(rewriter.rewrite(entry.expected)).toBe(entry.expected)
    })

  it("finds what is left to replace, and returns text without a renamed name as it is", () => {
    expect(rewriter.residual("in 2026-02-relational-dbs/x")).toBe(true)
    expect(rewriter.residual("2026-02-relational-dbs_v2")).toBe(false)
    const text = "nothing here"
    expect(rewriter.rewrite(text)).toBe(text)
  })

  it("renames nothing without renames", () => {
    const none = new NameRewriter([])
    expect(none.rewrite("2026-02-relational-dbs")).toBe("2026-02-relational-dbs")
    expect(none.residual("2026-02-relational-dbs")).toBe(false)
  })

  it("encodes a path the way Claude Code names its project folders", () => {
    expect(dashEncoded("/home/m/Dev/repos/ITAM")).toBe("-home-m-Dev-repos-ITAM")
    expect(dashEncoded("/a.b_c d")).toBe("-a-b-c-d")
  })
})

describe("several rewriters as one", () => {
  it("rewrites in order, and is residual when any part is", () => {
    const relocations = relocationsFromRules([{ from: "/old/ITAM/2026-02-relational-dbs", to: "/home/m/Dev/repos/ITAM/2026-02-relational-dbs" }], "/home/m")
    const both = new CompositeTextRewriter([new PathRewriter(relocations.mapping), new NameRewriter(RENAMES)])
    expect(both.rewrite("/old/ITAM/2026-02-relational-dbs/a")).toBe("/home/m/Dev/repos/ITAM/relational-dbs/a")
    expect(both.residual("C:\\Users\\nobody\\x")).toBe(false)
    expect(both.residual("2026-02-relational-dbs/x")).toBe(true)
    expect(new CompositeTextRewriter([]).rewrite("x")).toBe("x")
  })
})

describe("rename rules", () => {
  const refused = (from: string, to: string) => {
    try {
      renamesFromRules([{ from, to }])
      return null
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidRenameRuleError)
      return (error as Error).message
    }
  }

  it("turns <folder>=<name> into a rename in the folder's parent, and the folder move it implies", () => {
    expect(
      renamesFromRules([
        { from: "/home/m/ITAM/2026-02-relational-dbs/", to: "relational-dbs" },
        { from: "/top", to: "renamed.d" },
      ]),
    ).toEqual({
      renames: [
        { parent: "/home/m/ITAM", from: "2026-02-relational-dbs", to: "relational-dbs" },
        { parent: "/", from: "top", to: "renamed.d" },
      ],
      maps: [
        { from: "/home/m/ITAM/2026-02-relational-dbs", to: "/home/m/ITAM/relational-dbs" },
        { from: "/top", to: "/renamed.d" },
      ],
    })
    expect(renamesFromRules([])).toEqual({ renames: [], maps: [] })
  })

  it("refuses a folder that is not absolute, / itself, a name that cannot be one, or no change", () => {
    expect(refused("ITAM/x", "y")).toBe("--rename ITAM/x=y: the folder must be absolute, and not /")
    expect(refused("/", "y")).toContain("the folder must be absolute, and not /")
    expect(refused("/a/b c", "d")).toContain("the folder's name can only hold letters, digits, ., _ and -")
    expect(refused("/a/b", "c/d")).toContain("the new name can only hold letters, digits")
    expect(refused("/a/b", ".hidden")).toContain("cannot start with .")
    expect(refused("/a/b", "b")).toContain("the new name is the old one")
  })

  it("refuses two rules for one name, and a new name another rule renames", () => {
    expect(() => renamesFromRules([{ from: "/a/x", to: "y" }, { from: "/b/x", to: "z" }])).toThrow("--rename /b/x=z: two rules rename the same name")
    expect(() => renamesFromRules([{ from: "/a/x", to: "y" }, { from: "/a/y", to: "z" }])).toThrow("--rename /a/x=y: y is also renamed by another rule")
  })
})
