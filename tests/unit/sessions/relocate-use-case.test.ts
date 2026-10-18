import { describe, expect, it } from "bun:test"
import { GuardService } from "@session-manager/application/GuardService"
import { JointSwapService } from "@session-manager/application/JointSwapService"
import { RelocateSessionsUseCase } from "@session-manager/application/RelocateSessionsUseCase"
import { SwapService } from "@session-manager/application/SwapService"
import { DatabaseHeldError } from "@session-manager/domain/errors/DatabaseHeldError"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { RelocateBusyError } from "@session-manager/domain/errors/RelocateBusyError"
import { RelocateVerificationError } from "@session-manager/domain/errors/RelocateVerificationError"
import type { ProjectIdentity } from "@session-manager/domain/model/PathMapping"
import { relocateLines, type ContextTextRewriteCounts, type RelocateInput, type TextRewriteCounts } from "@session-manager/domain/model/Relocate"
import type { StoredSession } from "@session-manager/domain/model/SessionCatalog"
import type { ContextLink } from "@session-manager/domain/ports/outbound/MagicContextRelocationStorePort"
import type { CopyOptions, StoreHealth } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import type { SessionMove, TextRewrite } from "@session-manager/domain/ports/outbound/RelocationStorePort"
import type { ProjectPlan } from "@session-manager/domain/ports/outbound/SessionSyncStorePort"
import { NameRewriter } from "@session-manager/domain/services/NameRewriter"
import { CompositeTextRewriter } from "@session-manager/domain/services/CompositeTextRewriter"
import { PathRewriter } from "@session-manager/domain/services/PathRewriter"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"
import { FakeHolders } from "@test/support/maintenance/fakes/holders"
import { FakeStoreLock, fakeLocks } from "@test/support/maintenance/fakes/locks"
import { FakeProcessList } from "@test/support/maintenance/fakes/processes"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { FakeSqlite } from "@test/support/maintenance/fakes/sqlite"

const STAMP = "2026-10-12-00-00-00"
const WORK = `/tmp/opencode/relocate-${STAMP}`
const OPENCODE = "/d/opencode/opencode.db"
const CONTEXT = "/d/cortexkit/magic-context/context.db"

const session = (id: string, directory: string, extra: Partial<StoredSession> = {}): StoredSession => ({
  id,
  generation: "v2",
  projectId: "p_old",
  parentId: null,
  forkOf: null,
  title: `title ${id}`,
  directory,
  timeCreated: 1,
  timeUpdated: 2,
  timeArchived: null,
  entries: 1,
  ...extra,
})

const identity = (id: string, worktree: string, real: string): ProjectIdentity => ({ id, worktree, vcs: "git", real })

interface World {
  readonly context?: boolean
  readonly holder?: string | null
  readonly busy?: readonly string[]
  readonly health?: StoreHealth
  readonly contextHealth?: StoreHealth
  readonly text?: Partial<TextRewriteCounts>
  readonly contextText?: Partial<ContextTextRewriteCounts>
  /** The project a session is stored under after the move (default: as planned). */
  readonly storedProject?: string
  readonly relinked?: number
  readonly moved?: number
  readonly linkedProject?: string
  readonly sessions?: readonly StoredSession[]
}

function setup(world: World = {}) {
  const files = new FakeFileSystem()
  files.add(OPENCODE)
  if (world.context !== false) files.add(CONTEXT)
  for (const folder of ["/new/rel", "/new/rel/sub", "/new/rel/link"]) files.add(folder)
  const vacuums: { from: string; to: string }[] = []
  const sqlite = new FakeSqlite({
    onVacuum: (from, to) => {
      vacuums.push({ from, to })
      files.add(to, "copy")
    },
  })
  const runtime = new FakeRuntime()
  runtime.temporary = "/tmp"
  runtime.home = "/home/me"
  runtime.fixedStamp = STAMP
  const holders = new FakeHolders()
  holders.holder = world.holder ?? null
  const lock = new FakeStoreLock()
  const guard = new GuardService(files, new FakeProcessList(), holders)
  const calls = {
    moves: [] as SessionMove[],
    projects: [] as ProjectPlan[],
    rewrites: [] as { db: string; rewrite: TextRewrite }[],
    links: [] as ContextLink[],
    merges: [] as { from: string; to: string; options: CopyOptions }[],
  }
  const sessions = world.sessions ?? [
    session("ses_a", "/old/rel", { generation: "v1" }),
    session("ses_a", "/old/rel"),
    session("ses_a1", "/old/rel/sub", { parentId: "ses_a" }),
    session("ses_a2", "/else", { parentId: "ses_a1" }),
    session("ses_b", "/old/rel/gone"),
    session("ses_c", "/else"),
    session("ses_orphan", "/old/rel/link", { parentId: "ses_missing" }),
  ]
  const folders: Record<string, ProjectIdentity> = {
    "/new/rel": identity("p_new", "/new/rel", "/new/rel"),
    "/new/rel/sub": identity("p_new", "/new/rel", "/new/rel/sub"),
    "/new/rel/link": identity("p_known", "/elsewhere", "/new/rel/link"),
  }
  const recorded: Record<string, string> = { ses_a: "git:old", ses_a1: "git:new" }
  const contextIds: Record<string, string> = { "/new/rel": "git:new", "/new/rel/sub": "git:new" }
  const useCase = new RelocateSessionsUseCase({
    sqlite,
    sessions: { sessions: () => sessions, messageIds: () => [] },
    opencode: {
      formatOf: () => [],
      projects: () => [{ id: "p_known", worktree: "/elsewhere" }],
      hiddenRuns: () => [],
      copySessions: () => [],
      forkSessions: () => [],
      storedSession: (_db, id) => {
        const move = calls.moves.find((entry) => entry.id === id)!
        return { projectId: world.storedProject ?? move.projectId, directory: move.directory, projectExists: true }
      },
      health: () => world.health ?? { integrity_ok: true, foreign_keys_ok: true },
    },
    relocation: {
      moveSessions: (_db, moves, projects) => {
        calls.moves.push(...moves)
        calls.projects.push(...projects)
        return world.moved ?? moves.length
      },
      rewriteText: (db, rewrite) => {
        calls.rewrites.push({ db, rewrite })
        return { rows: { session_message: 3 }, residual: {}, kept: { project: 1 }, ...world.text }
      },
    },
    context: {
      sourceState: () => ({ harness: null, anchors: [], project: null, reach: 0 }),
      recordedProject: (_db, id) => (calls.links.length > 0 ? (world.linkedProject ?? calls.links.find((link) => link.sessionId === id)?.project ?? null) : (recorded[id] ?? null)),
      copySessions: (from, to, copies, options) => {
        expect(copies).toEqual([])
        calls.merges.push({ from, to, options })
        return {
          sessions: [],
          projects: options.projects.map((merge) => ({ from: merge.from, to: merge.to, memories_copied: 2, memories_already_there: 0, verifications: 0, notes: 0, primers: 0, dream_runs: 0, retrospective_windows: 0, skipped: null })),
          user_memories_copied: 0,
        }
      },
      authorityManaged: () => false,
      stateOf: () => ({ compartments: 0, tags: 0, notes: 0, anchors: [] }),
      health: () => world.contextHealth ?? { integrity_ok: true, foreign_keys_ok: true },
      busy: (_db, id) => world.busy?.includes(id) === true,
      vitals: () => {
        throw new Error("not used")
      },
    },
    contextRelocation: {
      relink: (_db, links) => {
        calls.links.push(...links)
        return world.relinked ?? links.length
      },
      rewriteText: (db, rewrite) => {
        calls.rewrites.push({ db, rewrite })
        return { rows: { compartments: 1 }, residual: {}, kept: {}, memory_conflicts: 0, snapshots_cleared: 0, ...world.contextText }
      },
    },
    identity: { resolve: (directory) => folders[directory] ?? null },
    contextIdentity: { identityOf: (directory) => contextIds[directory] ?? null },
    guard,
    locks: fakeLocks(runtime, lock),
    joint: new JointSwapService(files, guard, new SwapService(files)),
    fileSystem: files,
    runtime,
    rewriterFor: (mapping) => new PathRewriter(mapping),
    nameRewriterFor: (renames) => new NameRewriter(renames),
    combinedRewriter: (parts) => new CompositeTextRewriter(parts),
  })
  return { useCase, files, vacuums, lock, calls }
}

const input = (extra: Partial<RelocateInput> = {}): RelocateInput => ({
  profile: { opencodeDb: OPENCODE, contextDb: CONTEXT, readableOpencodeDb: null, readableContextDb: null },
  maps: [{ from: "/old/rel", to: "/new/rel" }],
  renames: [],
  sessions: "all",
  dryRun: false,
  ...extra,
})

describe("RelocateSessionsUseCase", () => {
  it("moves whole families on working copies, merges Magic Context projects, checks, and swaps both stores in under their locks", () => {
    const { useCase, files, vacuums, lock, calls } = setup()
    const report = useCase.relocate(input())
    expect(vacuums).toEqual([
      { from: OPENCODE, to: `${WORK}/opencode.db` },
      { from: CONTEXT, to: `${WORK}/context-before.db` },
      { from: CONTEXT, to: `${WORK}/context.db` },
    ])
    expect(calls.moves).toEqual([
      { id: "ses_a", directory: "/new/rel", projectId: "p_new", path: null },
      { id: "ses_a1", directory: "/new/rel/sub", projectId: "p_new", path: "sub" },
      { id: "ses_orphan", directory: "/new/rel/link", projectId: "p_known", path: null },
    ])
    expect(calls.projects).toEqual([{ id: "p_new", worktree: "/new/rel", vcs: "git", templateId: null }])
    expect(calls.links).toEqual([
      { sessionId: "ses_a", project: "git:new" },
      { sessionId: "ses_a1", project: "git:new" },
    ])
    expect(calls.merges.map(({ from, to, options }) => [from, to, options.projects.map((merge) => [merge.from, merge.to]), options.userMemories, options.originatedMemories])).toEqual([
      [`${WORK}/context-before.db`, `${WORK}/context.db`, [["git:old", "git:new"]], false, false],
    ])
    expect(calls.rewrites.map(({ db, rewrite }) => [db, rewrite.scope, rewrite.hints])).toEqual([
      [`${WORK}/opencode.db`, "all", ["old/rel"]],
      [`${WORK}/context.db`, "all", ["old/rel"]],
    ])
    expect(report.sessions.map((moved) => [moved.id, moved.root, moved.context_from_project, moved.context_to_project])).toEqual([
      ["ses_a", "ses_a", "git:old", "git:new"],
      ["ses_a1", "ses_a", "git:new", "git:new"],
      ["ses_orphan", "ses_orphan", null, null],
    ])
    expect(report.skipped).toEqual([{ id: "ses_b", directory: "/old/rel/gone", reason: "folder-missing", to_directory: "/new/rel/gone" }])
    expect(report.projects_created).toEqual(["p_new"])
    expect(report.failed).toEqual([])
    expect(report.checks.context).toEqual({ integrity_ok: true, foreign_keys_ok: true, links_ok: true, text_ok: true })
    const backup = `/d/opencode/relocate-backup-${STAMP}`
    expect([report.backup_dir, report.rollback]).toEqual([backup, `opencode-session-manager rollback ${backup} --db ${OPENCODE} --db ${CONTEXT}`])
    expect(files.has(`${backup}/opencode.db`) && files.has(`${backup}/context.db`)).toBe(true)
    expect(lock.taken).toEqual([[OPENCODE, CONTEXT]])
    expect(lock.held.size).toBe(0)
    expect(files.has(WORK)).toBe(false)
  })

  it("with --rename, moves the renamed folder's sessions too and replaces its old name everywhere, also in project records", () => {
    const { useCase, calls } = setup()
    const report = useCase.relocate(input({ dryRun: true, renames: [{ from: "/srv/2026-02-rel", to: "rel" }] }))
    expect(report.renames).toEqual([{ parent: "/srv", from: "2026-02-rel", to: "rel" }])
    expect(report.rules).toEqual([
      { from: "/old/rel", to: "/new/rel" },
      { from: "/srv/2026-02-rel", to: "/srv/rel" },
    ])
    const rewrite = calls.rewrites[0]!.rewrite
    expect([rewrite.hints, rewrite.names?.needles]).toEqual([["old/rel", "srv/2026-02-rel"], ["2026-02-rel"]])
    expect(rewrite.rewriter.rewrite("/old/rel/a and 2026-02-rel/b")).toBe("/new/rel/a and rel/b")
    expect(rewrite.names!.rewriter.rewrite("/old/rel/a and 2026-02-rel/b")).toBe("/old/rel/a and rel/b")
    expect(relocateLines(report)).toContain("Renamed: 2026-02-rel → rel")
    // Without --rename, nothing is a renamed name.
    expect(setup().useCase.relocate(input({ dryRun: true })).renames).toEqual([])
  })

  it("on a dry run takes no lock and swaps nothing; --session moves those families only, reading the readable copies", () => {
    const { useCase, vacuums, lock, calls, files } = setup()
    files.add("/snap/opencode.db")
    files.add("/snap/context.db")
    const report = useCase.relocate(
      input({
        dryRun: true,
        sessions: ["ses_a2", "ses_c", "ses_x", "ses_b", "ses_a"],
        profile: { opencodeDb: OPENCODE, contextDb: CONTEXT, readableOpencodeDb: "/snap/opencode.db", readableContextDb: "/snap/context.db" },
      }),
    )
    expect(vacuums.map((vacuum) => vacuum.from)).toEqual(["/snap/opencode.db", "/snap/context.db", "/snap/context.db"])
    expect(report.sessions.map((moved) => moved.id)).toEqual(["ses_a", "ses_a1"])
    expect(report.skipped).toEqual([
      { id: "ses_c", directory: "/else", reason: "not-mapped", to_directory: null },
      { id: "ses_x", directory: null, reason: "not-found", to_directory: null },
      { id: "ses_b", directory: "/old/rel/gone", reason: "folder-missing", to_directory: "/new/rel/gone" },
    ])
    expect(calls.rewrites[0]!.rewrite.scope).toEqual({ sessions: ["ses_a", "ses_a1"] })
    expect([report.dry_run, report.backup_dir, report.rollback, lock.taken]).toEqual([true, null, null, []])
  })

  it("moves the OpenCode store alone when the profile has no Magic Context store, and swaps nothing when nothing changed", () => {
    const alone = setup({ context: false }).useCase.relocate(input())
    expect([alone.context_db, alone.context_text, alone.checks.context, alone.projects_merged]).toEqual([null, null, null, []])
    expect(alone.rollback).toBe(`opencode-session-manager rollback /d/opencode/relocate-backup-${STAMP} --db ${OPENCODE}`)

    const { useCase, lock } = setup({ sessions: [session("ses_c", "/else")], moved: 0, relinked: 0, text: { rows: {} }, contextText: { rows: {} } })
    const report = useCase.relocate(input())
    expect([report.sessions, report.backup_dir, report.rollback, lock.taken]).toEqual([[], null, null, [[OPENCODE, CONTEXT]]])
  })

  it("refuses a missing store, a held store, and sessions Magic Context is working on", () => {
    const missing = setup()
    missing.files.remove(OPENCODE)
    expect(() => missing.useCase.relocate(input())).toThrow(DatabaseNotFoundError)
    expect(() => setup({ holder: "opencode (pid 7)" }).useCase.relocate(input())).toThrow(DatabaseHeldError)
    const busy = setup({ busy: ["ses_a1"] })
    expect(() => busy.useCase.relocate(input())).toThrow(new RelocateBusyError(["ses_a1"]))
    expect(busy.files.has(`/d/opencode/relocate-backup-${STAMP}`)).toBe(false)
  })

  it("refuses to swap copies that fail a check; a dry run reports the failed checks", () => {
    const failing: World = {
      health: { integrity_ok: false, foreign_keys_ok: true },
      text: { residual: { part: 1 } },
      storedProject: "p_other",
      contextText: { residual: { notes: 1 } },
      linkedProject: "git:else",
    }
    const failed = ["integrity_ok", "sessions_ok", "text_ok", "context links_ok", "context text_ok"]
    const run = setup(failing)
    expect(() => run.useCase.relocate(input())).toThrow(new RelocateVerificationError(failed))
    expect(run.files.has(`/d/opencode/relocate-backup-${STAMP}`)).toBe(false)
    expect(setup(failing).useCase.relocate(input({ dryRun: true })).failed).toEqual(failed)
  })
})
