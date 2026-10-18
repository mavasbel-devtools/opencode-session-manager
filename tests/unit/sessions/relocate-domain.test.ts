import { describe, expect, it } from "bun:test"
import { InvalidMapRuleError } from "@session-manager/domain/errors/InvalidMapRuleError"
import { RelocateBusyError } from "@session-manager/domain/errors/RelocateBusyError"
import { RelocateVerificationError } from "@session-manager/domain/errors/RelocateVerificationError"
import { relocateLines, type RelocateReport } from "@session-manager/domain/model/Relocate"
import { PathRewriter } from "@session-manager/domain/services/PathRewriter"
import { relocatedFolder, relocationsFromRules } from "@session-manager/domain/services/RelocateRules"

describe("relocate rules", () => {
  it("moves absolute POSIX folders, also as ~/… below the home, in the order given", () => {
    const relocations = relocationsFromRules(
      [
        { from: "/home/me/old/rel/", to: "/home/me/repos/rel" },
        { from: "/srv/old", to: "/home/me/srv" },
        { from: "/home/me/a", to: "/srv/a" },
      ],
      "/home/me/",
    )
    expect(relocations.folders).toEqual([
      { from: "/home/me/old/rel", to: "/home/me/repos/rel" },
      { from: "/srv/old", to: "/home/me/srv" },
      { from: "/home/me/a", to: "/srv/a" },
    ])
    expect(relocations.mapping.relocations).toEqual([
      { from: "/home/me/old/rel", to: "/home/me/repos/rel" },
      { from: "~/old/rel", to: "~/repos/rel" },
      { from: "/srv/old", to: "/home/me/srv" },
      { from: "/home/me/a", to: "/srv/a" },
      { from: "~/a", to: "/srv/a" },
    ])
    expect(relocations.hints).toEqual(["home/me/old/rel", "~/old/rel", "srv/old", "home/me/a", "~/a"])
    const rewriter = new PathRewriter(relocations.mapping)
    expect(rewriter.rewrite('{"cwd":"/home/me/old/rel/x","link":"file:///home/me/old/rel/y","sh":"cd ~/old/rel && ls ~/a","other":"/home/me/old/rel-2025"}')).toBe(
      '{"cwd":"/home/me/repos/rel/x","link":"file:///home/me/repos/rel/y","sh":"cd ~/repos/rel && ls /srv/a","other":"/home/me/old/rel-2025"}',
    )
    expect(relocatedFolder(relocations.folders, "/home/me/old/rel/sub")).toBe("/home/me/repos/rel/sub")
    expect(relocatedFolder(relocations.folders, "/home/me/old/rel")).toBe("/home/me/repos/rel")
    expect(relocatedFolder(relocations.folders, "/home/me/old/rel-2025")).toBeNull()
  })

  it("refuses no rules, Windows paths, relative folders, the root, and a folder inside the other", () => {
    const refused = (from: string, to: string) => {
      try {
        relocationsFromRules([{ from, to }], "/home/me")
        return null
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidMapRuleError)
        return (error as Error).message
      }
    }
    expect(() => relocationsFromRules([], "/home/me")).toThrow("relocate needs at least one --map <from>=<to>")
    expect(refused("C:\\Users\\Me", "/home/me")).toBe("--map C:\\Users\\Me=/home/me: relocate moves POSIX folders; map Windows paths with sync")
    expect(refused("/a", "C:/b")).toContain("relocate moves POSIX folders")
    expect(refused("a", "/b")).toBe("--map a=/b: both folders must be absolute")
    expect(refused("/a", "b")).toContain("both folders must be absolute")
    expect(refused("/", "/b")).toContain("the folders must differ and neither may be inside the other")
    expect(refused("/a", "/a/b")).toContain("neither may be inside the other")
    expect(refused("/a/b", "/a")).toContain("neither may be inside the other")
    expect(refused("/a", "/a/")).toContain("must differ")
    expect(refused("/home/me", "/srv/me")).toBeNull()
  })
})

describe("relocate text and errors", () => {
  const report = (overrides: Partial<RelocateReport> = {}): RelocateReport => ({
    opencode_db: "/d/opencode/opencode.db",
    context_db: "/d/cortexkit/magic-context/context.db",
    dry_run: false,
    rules: [{ from: "/a", to: "/b" }],
    renames: [],
    sessions: [
      { id: "s1", root: "s1", title: "t", from_directory: "/a", to_directory: "/b", from_project: "p1", to_project: "p2", context_from_project: null, context_to_project: null },
      { id: "s2", root: "s1", title: null, from_directory: "/a", to_directory: "/b", from_project: "p1", to_project: "p2", context_from_project: null, context_to_project: null },
    ],
    skipped: [],
    projects_created: [],
    text: { rows: { part: 2, session_message: 3 }, residual: {}, kept: {} },
    context_text: { rows: { compartments: 4 }, residual: {}, kept: {}, memory_conflicts: 0, snapshots_cleared: 0 },
    projects_merged: [],
    checks: { integrity_ok: true, foreign_keys_ok: true, sessions_ok: true, text_ok: true, context: null },
    failed: [],
    backup_dir: "/d/opencode/relocate-backup-x",
    rollback: "opencode-session-manager rollback /d/opencode/relocate-backup-x --db /d/opencode/opencode.db",
    stale_locks_cleared: [],
    ...overrides,
  })

  it("sums a report up", () => {
    expect(relocateLines(report())).toEqual([
      "Relocated: 2 sessions (1 root sessions with their sub-agent sessions) → /d/opencode/opencode.db",
      "Text: 5 OpenCode rows rewritten, 4 Magic Context rows",
      "Originals kept; undo: opencode-session-manager rollback /d/opencode/relocate-backup-x --db /d/opencode/opencode.db",
    ])
    const merge = { from: "git:a", to: "git:b", memories_copied: 3, memories_already_there: 0, verifications: 0, notes: 0, primers: 0, dream_runs: 0, retrospective_windows: 0, skipped: null }
    expect(
      relocateLines(
        report({
          dry_run: true,
          context_text: null,
          projects_merged: [merge],
          skipped: [{ id: "s3", directory: "/a/x", reason: "folder-missing", to_directory: "/b/x" }],
          failed: ["text_ok"],
          backup_dir: null,
          rollback: null,
        }),
      ),
    ).toEqual([
      "Dry run: 2 sessions (1 root sessions with their sub-agent sessions) → /d/opencode/opencode.db",
      "Text: 5 OpenCode rows rewritten",
      "Magic Context projects merged: git:a → git:b (3 memories)",
      "Skipped: s3 (folder-missing)",
      "Failed checks: text_ok",
      "The stores were not changed.",
    ])
  })

  it("explains a refusal", () => {
    expect(new RelocateBusyError(["s1", "s2"]).message).toBe(
      "Magic Context is working on s1, s2 (a wrapup, or a summary run holding its lease); nothing was moved. Wait for it to finish, then relocate again",
    )
    const failed = new RelocateVerificationError(["text_ok", "context links_ok"])
    expect([failed.message, failed.failed, failed._tag]).toEqual([
      "the relocated copies failed text_ok, context links_ok; the profile's stores were left untouched",
      ["text_ok", "context links_ok"],
      "RelocateVerificationError",
    ])
  })
})
