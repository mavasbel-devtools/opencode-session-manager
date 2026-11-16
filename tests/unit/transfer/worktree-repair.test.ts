import { describe, expect, it } from "bun:test"
import { RepairWorktreeLinksUseCase } from "@session-manager/application/RepairWorktreeLinksUseCase"
import { worktreeAllowsMove, worktreeNoteworthy, type GitWorkTree, type WorktreeLinkStatus } from "@session-manager/domain/model/GitWorktree"
import { locationRepairMessage, locationRepairNeedsAttention, type LocationRepairReport } from "@session-manager/domain/model/LocationRepair"
import type { GitWorktreePort } from "@session-manager/domain/ports/outbound/GitWorktreePort"
import { mainOfAdmin, worktreeRepairPlan, type WorktreeProbe } from "@session-manager/domain/services/WorktreeRepairPlanner"
import { FakeFileSystemAdapter } from "@test/support/fakes/transfer-ports"

const RULES = [{ from: "/old", to: "/new" }]

function probe(directories: readonly string[], gitFiles: Record<string, string> = {}): WorktreeProbe {
  const set = new Set(directories)
  return { isDirectory: (path) => set.has(path), gitFile: (folder) => gitFiles[folder] ?? null }
}

function linked(root: string, admin: string | null, recorded: string | null): GitWorkTree {
  return { root, kind: "linked", admin, recorded, worktrees: [] }
}

function main(root: string, worktrees: GitWorkTree["worktrees"] = []): GitWorkTree {
  return { root, kind: "main", admin: null, recorded: null, worktrees }
}

describe("mainOfAdmin", () => {
  it("names the main work tree, or the bare repository, of an administrative folder", () => {
    expect(mainOfAdmin("/new/repo/.git/worktrees/feature")).toBe("/new/repo")
    expect(mainOfAdmin("/new/repo/.git/worktrees/feature/")).toBe("/new/repo")
    expect(mainOfAdmin("/srv/repo.git/worktrees/feature")).toBe("/srv/repo.git")
    expect(mainOfAdmin("/.git/worktrees/feature")).toBe("/")
    expect(mainOfAdmin("/new/repo/.git/modules/feature")).toBeNull()
    expect(mainOfAdmin("/worktrees/x")).toBeNull()
  })
})

describe("worktreeRepairPlan for a linked work tree", () => {
  it("needs nothing when its administrative folder records it back", () => {
    expect(worktreeRepairPlan(linked("/new/wt", "/repo/.git/worktrees/wt", "/new/wt"), RULES, probe(["/repo/.git/worktrees/wt"]))).toEqual({ kind: "none" })
  })

  it("repairs inside it when the administrative folder records its old, mapped, missing path", () => {
    expect(worktreeRepairPlan(linked("/new/wt", "/repo/.git/worktrees/wt", "/old/wt"), RULES, probe(["/repo/.git/worktrees/wt"]))).toEqual({
      kind: "repair",
      command: { cwd: "/new/wt", paths: [] },
    })
  })

  it("never steals a link that still names an existing folder, an unmapped one, or an unreadable one", () => {
    const present = probe(["/repo/.git/worktrees/wt", "/old/wt"])
    expect(worktreeRepairPlan(linked("/new/wt", "/repo/.git/worktrees/wt", "/old/wt"), RULES, present)).toEqual({ kind: "unproven" })
    expect(worktreeRepairPlan(linked("/new/wt", "/repo/.git/worktrees/wt", "/elsewhere/wt"), RULES, probe(["/repo/.git/worktrees/wt"]))).toEqual({ kind: "unproven" })
    expect(worktreeRepairPlan(linked("/new/wt", "/repo/.git/worktrees/wt", null), RULES, probe(["/repo/.git/worktrees/wt"]))).toEqual({ kind: "unproven" })
    expect(worktreeRepairPlan(linked("/new/wt", null, null), RULES, probe([]))).toEqual({ kind: "unproven" })
  })

  it("repairs from the moved main work tree when its missing administrative folder maps to an existing one", () => {
    expect(worktreeRepairPlan(linked("/wt", "/old/repo/.git/worktrees/wt", "/wt"), RULES, probe(["/new/repo/.git/worktrees/wt"]))).toEqual({
      kind: "repair",
      command: { cwd: "/new/repo", paths: ["/wt"] },
    })
  })

  it("leaves a missing administrative folder that no rule maps, maps nowhere, or is not under worktrees/", () => {
    expect(worktreeRepairPlan(linked("/wt", "/gone/repo/.git/worktrees/wt", "/wt"), RULES, probe([]))).toEqual({ kind: "unproven" })
    expect(worktreeRepairPlan(linked("/wt", "/old/repo/.git/worktrees/wt", "/wt"), RULES, probe([]))).toEqual({ kind: "unproven" })
    expect(worktreeRepairPlan(linked("/wt", "/old/repo/.git/modules/wt", "/wt"), RULES, probe(["/new/repo/.git/modules/wt"]))).toEqual({ kind: "unproven" })
  })
})

describe("worktreeRepairPlan for a main work tree", () => {
  const admin = "/new/repo/.git/worktrees/wt"

  it("needs nothing without registered work trees, with linked ones, or with gone, unmapped, or unreadable ones", () => {
    expect(worktreeRepairPlan(main("/new/repo"), RULES, probe([]))).toEqual({ kind: "none" })
    expect(worktreeRepairPlan(main("/new/repo", [{ admin, recorded: "/wt", points: admin }]), RULES, probe(["/wt"]))).toEqual({ kind: "none" })
    expect(worktreeRepairPlan(main("/new/repo", [{ admin, recorded: "/gone/wt", points: null }]), RULES, probe([]))).toEqual({ kind: "none" })
    expect(worktreeRepairPlan(main("/new/repo", [{ admin, recorded: null, points: null }]), RULES, probe([]))).toEqual({ kind: "none" })
  })

  it("names a registered work tree that moved by a mapping and whose .git names this administrative folder or its old path", () => {
    const tree = main("/new/repo", [{ admin, recorded: "/old/wt", points: null }])
    expect(worktreeRepairPlan(tree, RULES, probe(["/new/wt"], { "/new/wt": admin }))).toEqual({ kind: "repair", command: { cwd: "/new/repo", paths: ["/new/wt"] } })
    expect(worktreeRepairPlan(tree, RULES, probe(["/new/wt"], { "/new/wt": "/old/repo/.git/worktrees/wt" }))).toEqual({
      kind: "repair",
      command: { cwd: "/new/repo", paths: ["/new/wt"] },
    })
  })

  it("refuses a mapped work tree that is missing, has no .git file, or belongs to another repository", () => {
    const tree = main("/new/repo", [{ admin, recorded: "/old/wt", points: null }])
    expect(worktreeRepairPlan(tree, RULES, probe([]))).toEqual({ kind: "unproven" })
    expect(worktreeRepairPlan(tree, RULES, probe(["/new/wt"]))).toEqual({ kind: "unproven" })
    expect(worktreeRepairPlan(tree, RULES, probe(["/new/wt"], { "/new/wt": "/other/.git/worktrees/wt" }))).toEqual({ kind: "unproven" })
  })

  it("repairs from the main work tree when an existing registered work tree names its missing, mapped old administrative folder", () => {
    const tree = main("/new/repo", [{ admin, recorded: "/wt", points: "/old/repo/.git/worktrees/wt" }])
    expect(worktreeRepairPlan(tree, RULES, probe(["/wt"]))).toEqual({ kind: "repair", command: { cwd: "/new/repo", paths: [] } })
  })

  it("leaves a registered work tree that names an existing or unexplained administrative folder", () => {
    expect(worktreeRepairPlan(main("/new/repo", [{ admin, recorded: "/wt", points: "/other/.git/worktrees/wt" }]), RULES, probe(["/wt", "/other/.git/worktrees/wt"]))).toEqual({
      kind: "unproven",
    })
    expect(worktreeRepairPlan(main("/new/repo", [{ admin, recorded: "/wt", points: "/gone/.git/worktrees/wt" }]), RULES, probe(["/wt"]))).toEqual({ kind: "unproven" })
    expect(worktreeRepairPlan(main("/new/repo", [{ admin, recorded: "/wt", points: null }]), RULES, probe(["/wt"]))).toEqual({ kind: "unproven" })
  })
})

describe("work tree outcomes", () => {
  it("only blocks a move Git cannot resolve, and only reports what changed or disagrees", () => {
    const statuses: WorktreeLinkStatus[] = ["none", "healthy", "repaired", "would-repair", "incomplete", "unproven", "unresolved"]
    const outcomes = statuses.map((status) => ({ directory: "/d", root: "/d", status, command: null }))
    expect(outcomes.map(worktreeAllowsMove)).toEqual([true, true, true, true, true, true, false])
    expect(outcomes.map(worktreeNoteworthy)).toEqual([false, false, true, true, true, true, true])
  })
})

/** Git in memory: `trees` per folder before and after the repair; `resolving` the folders Git resolves. */
class FakeGitWorktree implements GitWorktreePort {
  public repairs: Array<{ cwd: string; paths: readonly string[] }> = []
  public repaired = false

  constructor(
    public before: GitWorkTree | null,
    public after: GitWorkTree | null,
    public resolving: { before: boolean; after: boolean },
    public gitFiles: Record<string, string> = {},
  ) {}

  locate(): GitWorkTree | null {
    return this.repaired ? this.after : this.before
  }

  gitFile(folder: string): string | null {
    return this.gitFiles[folder] ?? null
  }

  repair(cwd: string, paths: readonly string[]): boolean {
    this.repairs.push({ cwd, paths })
    this.repaired = true
    return false
  }

  resolves(): boolean {
    return this.repaired ? this.resolving.after : this.resolving.before
  }
}

describe("RepairWorktreeLinksUseCase", () => {
  const admin = "/repo/.git/worktrees/wt"
  const moved = linked("/new/wt", admin, "/old/wt")
  const fixed = linked("/new/wt", admin, "/new/wt")

  function files(...directories: string[]): FakeFileSystemAdapter {
    const fake = new FakeFileSystemAdapter()
    for (const directory of directories) fake.directories.add(directory)
    return fake
  }

  it("reports a folder outside Git without running anything", () => {
    const git = new FakeGitWorktree(null, null, { before: false, after: false })
    expect(new RepairWorktreeLinksUseCase(git, files()).ensure("/new/plain", RULES)).toEqual({ directory: "/new/plain", root: null, status: "none", command: null })
    expect(git.repairs).toEqual([])
  })

  it("reports healthy, unproven, and unresolved work trees without running Git's repair", () => {
    expect(new RepairWorktreeLinksUseCase(new FakeGitWorktree(fixed, null, { before: true, after: false }), files(admin)).ensure("/new/wt", RULES).status).toBe("healthy")
    expect(new RepairWorktreeLinksUseCase(new FakeGitWorktree(linked("/new/wt", null, null), null, { before: true, after: false }), files()).ensure("/new/wt", RULES).status).toBe("unproven")
    const broken = new FakeGitWorktree(linked("/new/wt", null, null), null, { before: false, after: false })
    expect(new RepairWorktreeLinksUseCase(broken, files()).ensure("/new/wt", RULES)).toEqual({ directory: "/new/wt", root: "/new/wt", status: "unresolved", command: null })
    expect(broken.repairs).toEqual([])
  })

  it("plans a proven repair in a dry run without running it", () => {
    const git = new FakeGitWorktree(moved, fixed, { before: true, after: true })
    expect(new RepairWorktreeLinksUseCase(git, files(admin)).ensure("/new/wt", RULES, true)).toEqual({
      directory: "/new/wt",
      root: "/new/wt",
      status: "would-repair",
      command: { cwd: "/new/wt", paths: [] },
    })
    expect(git.repairs).toEqual([])
  })

  it("runs the proven repair and judges it by what Git resolves afterwards, not by its exit status", () => {
    const git = new FakeGitWorktree(moved, fixed, { before: true, after: true })
    expect(new RepairWorktreeLinksUseCase(git, files(admin)).ensure("/new/wt", RULES)).toEqual({
      directory: "/new/wt",
      root: "/new/wt",
      status: "repaired",
      command: { cwd: "/new/wt", paths: [] },
    })
    expect(git.repairs).toEqual([{ cwd: "/new/wt", paths: [] }])
  })

  it("reports a repair that left a link disagreeing, or a folder Git no longer resolves or finds", () => {
    expect(new RepairWorktreeLinksUseCase(new FakeGitWorktree(moved, moved, { before: true, after: true }), files(admin)).ensure("/new/wt", RULES).status).toBe("incomplete")
    expect(new RepairWorktreeLinksUseCase(new FakeGitWorktree(moved, fixed, { before: true, after: false }), files(admin)).ensure("/new/wt", RULES).status).toBe("unresolved")
    expect(new RepairWorktreeLinksUseCase(new FakeGitWorktree(moved, null, { before: true, after: true }), files(admin)).ensure("/new/wt", RULES)).toEqual({
      directory: "/new/wt",
      root: "/new/wt",
      status: "unresolved",
      command: { cwd: "/new/wt", paths: [] },
    })
  })

  it("asks the Git port for a moved work tree's .git file while planning from the main work tree", () => {
    const repoAdmin = "/new/repo/.git/worktrees/wt"
    const tree = main("/new/repo", [{ admin: repoAdmin, recorded: "/old/wt", points: null }])
    const after = main("/new/repo", [{ admin: repoAdmin, recorded: "/new/wt", points: repoAdmin }])
    const git = new FakeGitWorktree(tree, after, { before: true, after: true }, { "/new/wt": repoAdmin })
    expect(new RepairWorktreeLinksUseCase(git, files("/new/wt")).ensure("/new/repo", RULES).status).toBe("repaired")
    expect(git.repairs).toEqual([{ cwd: "/new/repo", paths: ["/new/wt"] }])
  })
})

describe("location repair messages", () => {
  const base: LocationRepairReport = { rules: RULES, repaired: [], skipped: [], worktrees: [], busy: false }
  const tree = (status: WorktreeLinkStatus) => ({ directory: "/new/wt", root: "/new/wt", status, command: null })

  it("says nothing without mappings, and says when another window holds the lock", () => {
    expect(locationRepairMessage({ ...base, rules: [] })).toBeNull()
    expect(locationRepairMessage({ ...base, busy: true })).toBe("Another OpenCode window is repairing session locations; nothing was changed.")
  })

  it("counts repairs, repaired work trees, missing targets, unresolved and disagreeing work trees", () => {
    expect([locationRepairMessage(base), locationRepairNeedsAttention(base)]).toEqual(["No stale mapped session locations needed repair.", false])
    const report: LocationRepairReport = {
      ...base,
      repaired: [
        { session_id: "a", from_directory: "/old/a", to_directory: "/new/a" },
        { session_id: "b", from_directory: "/old/b", to_directory: "/new/b" },
      ],
      skipped: [
        { session_id: "c", directory: "/old/c", reason: "target-missing", to_directory: "/new/c" },
        { session_id: "d", directory: "/old/d", reason: "worktree-unresolved", to_directory: "/new/d" },
        { session_id: "e", directory: "/old/e", reason: "directory-present", to_directory: null },
      ],
      worktrees: [tree("repaired"), tree("unproven"), tree("incomplete")],
    }
    expect(locationRepairMessage(report)).toBe(
      "Repaired 2 session locations. Repaired Git links of 1 work tree. 1 mapped folder missing. 1 session left: Git cannot resolve the mapped work tree. 2 work trees with Git links no mapping explains.",
    )
    expect(locationRepairNeedsAttention(report)).toBe(true)
    expect(locationRepairMessage({ ...base, repaired: [report.repaired[0]!] })).toBe("Repaired 1 session location.")
    expect([tree("unresolved"), tree("unproven"), tree("incomplete")].map((outcome) => locationRepairNeedsAttention({ ...base, worktrees: [outcome] }))).toEqual([true, true, true])
    expect(locationRepairNeedsAttention({ ...base, skipped: [report.skipped[0]!] })).toBe(true)
    expect(locationRepairNeedsAttention({ ...base, worktrees: [tree("repaired")] })).toBe(false)
  })
})
