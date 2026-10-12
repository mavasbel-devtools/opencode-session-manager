import { describe, expect, it } from "bun:test"
import { GuardService } from "@session-manager/application/GuardService"
import type { ContextBuild, ContextBuildInput } from "@session-manager/application/MagicContextSyncService"
import { SwapService } from "@session-manager/application/SwapService"
import { SyncSessionsUseCase } from "@session-manager/application/SyncSessionsUseCase"
import { BusySessionsError } from "@session-manager/domain/errors/BusySessionsError"
import { DatabaseHeldError } from "@session-manager/domain/errors/DatabaseHeldError"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { InsufficientSpaceError } from "@session-manager/domain/errors/InsufficientSpaceError"
import { OpenCodeFormatMismatchError } from "@session-manager/domain/errors/OpenCodeFormatMismatchError"
import { StoreLockedError } from "@session-manager/domain/errors/StoreLockedError"
import { SwapFailedError } from "@session-manager/domain/errors/SwapFailedError"
import { SyncVerificationError } from "@session-manager/domain/errors/SyncVerificationError"
import type { PathMapping, ProjectIdentity } from "@session-manager/domain/model/PathMapping"
import type { StoredSession } from "@session-manager/domain/model/SessionCatalog"
import type { SessionSyncInput } from "@session-manager/domain/model/SessionSync"
import type { StoreHealth } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import type { SessionCopyPlan, StoredSessionRow } from "@session-manager/domain/ports/outbound/SessionSyncStorePort"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"
import { FakeHolders } from "@test/support/maintenance/fakes/holders"
import { FakeStoreLock, fakeLocks } from "@test/support/maintenance/fakes/locks"
import { FakeProcessList } from "@test/support/maintenance/fakes/processes"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { FakeSqlite } from "@test/support/maintenance/fakes/sqlite"

const STAMP = "2026-09-27-00-00-00"
const WORK = `/tmp/opencode/session-sync-${STAMP}`
const SOURCE = `${WORK}/opencode-source.db`
const TARGET = `${WORK}/opencode-target.db`

interface SessionSpec {
  readonly directory: string
  readonly ids?: readonly string[]
  readonly parent?: string
  readonly project?: string
  readonly generation?: "v1" | "v2"
}

interface World {
  readonly source?: Record<string, SessionSpec>
  readonly target?: Record<string, SessionSpec>
  readonly formats?: { readonly source?: string[]; readonly target?: string[] }
  readonly sourceProjects?: Record<string, string>
  readonly targetProjects?: Record<string, string>
  readonly hidden?: readonly string[]
  /** Folders that exist on this machine, with the project OpenCode derives there. */
  readonly folders?: Record<string, ProjectIdentity | null>
  readonly health?: StoreHealth
  /** What the target holds after the copy (default: what was planned, its project present). */
  readonly stored?: (plan: SessionCopyPlan["sessions"][number]) => StoredSessionRow | null
  readonly context?: boolean
  readonly contextChecksOk?: boolean
  readonly contextCopied?: number
  /** Sessions Magic Context reports busy on the target. */
  readonly contextBusy?: readonly string[]
  readonly holder?: string | null
  readonly free?: number
  readonly failRenameFrom?: string
}

const stored = (id: string, spec: SessionSpec): StoredSession => ({
  id,
  generation: spec.generation ?? "v2",
  projectId: spec.project ?? "global",
  parentId: spec.parent ?? null,
  forkOf: null,
  title: `title ${id}`,
  directory: spec.directory,
  timeCreated: 1,
  timeUpdated: 2,
  timeArchived: null,
  entries: (spec.ids ?? ["m1"]).length,
})

function setup(world: World = {}) {
  const files = new FakeFileSystem()
  for (const path of ["/s/opencode.db", "/t/opencode.db", "/t/opencode.db-wal"]) files.add(path)
  if (world.context !== false) for (const path of ["/s/context.db", "/t/context.db"]) files.add(path)
  for (const [folder, identity] of Object.entries(world.folders ?? {})) if (identity !== undefined) files.add(folder)
  if (world.free !== undefined) files.free = world.free
  if (world.failRenameFrom !== undefined) files.failRenameFrom = world.failRenameFrom
  const sqlite = new FakeSqlite({ onVacuum: (_from, to) => files.add(to, "copy") })
  const runtime = new FakeRuntime()
  runtime.temporary = "/tmp"
  runtime.home = "/home/me"
  runtime.fixedStamp = STAMP
  const holders = new FakeHolders()
  holders.holder = world.holder ?? null
  const lock = new FakeStoreLock()
  const plans: SessionCopyPlan[] = []
  const builds: ContextBuildInput[] = []
  const mappings: PathMapping[] = []
  const side = (path: string) => (path === SOURCE ? (world.source ?? {}) : (world.target ?? {}))
  const useCase = new SyncSessionsUseCase({
    sqlite,
    sessions: {
      sessions: (path) =>
        Object.entries(side(path)).flatMap(([id, spec]) => (spec.generation === "v1" ? [stored(id, spec)] : [stored(id, { ...spec, generation: "v1" }), stored(id, spec)])),
      messageIds: (path, id) => side(path)[id]?.ids ?? ["m1"],
    },
    store: {
      formatOf: (path) => (path === "/s/opencode.db" ? (world.formats?.source ?? ["m1"]) : (world.formats?.target ?? ["m1"])),
      projects: (path) => Object.entries(path === SOURCE ? (world.sourceProjects ?? {}) : (world.targetProjects ?? {})).map(([id, worktree]) => ({ id, worktree })),
      hiddenRuns: () => world.hidden ?? [],
      copySessions: (_source, _target, list) => {
        plans.push(...list)
        return list.map((plan) => ({ root: plan.root, sessions: plan.sessions.length, rows: 10 * plan.sessions.length, residual_windows_paths: 0 }))
      },
      storedSession: (_path, id) => {
        const plan = plans.flatMap((entry) => entry.sessions).find((session) => session.id === id)!
        return world.stored === undefined ? { projectId: plan.projectId, directory: plan.directory, projectExists: true } : world.stored(plan)
      },
      health: () => world.health ?? { integrity_ok: true, foreign_keys_ok: true },
    },
    identity: { resolve: (directory) => world.folders?.[directory] ?? null },
    contexts: {
      build: (input): ContextBuild => {
        builds.push(input)
        files.add(`${input.workDir}/context-target.db`, "context")
        const ok = world.contextChecksOk !== false
        return {
          workTarget: `${input.workDir}/context-target.db`,
          format: 94,
          sessions: input.sessions.map((request) =>
            world.contextBusy?.includes(request.id) === true
              ? { id: request.id, status: "skipped", reason: "busy", relation: "same", counts: null, residual_windows_paths: 0 }
              : { id: request.id, status: "copied", reason: null, relation: "same", counts: null, residual_windows_paths: 0 },
          ),
          projects: [],
          user_memories_copied: 0,
          checks: { integrity_ok: true, foreign_keys_ok: true, anchors_ok: ok, counts_ok: true },
          copied: world.contextCopied ?? input.sessions.length,
          changed: (world.contextCopied ?? input.sessions.length) > 0,
        }
      },
    },
    guard: new GuardService(files, new FakeProcessList(), holders),
    locks: fakeLocks(runtime, lock),
    swap: new SwapService(files),
    fileSystem: files,
    runtime,
    rewriterFor: (mapping) => {
      mappings.push(mapping)
      return {
        rewrite: (text) => {
          let out = text.replaceAll("C:/Users/Me", mapping.home)
          for (const relocation of mapping.relocations) if (out.startsWith(relocation.from)) out = relocation.to + out.slice(relocation.from.length)
          return out
        },
        residual: (text) => text.includes("C:/"),
      }
    },
  })
  return { useCase, files, plans, builds, mappings, sqlite, lock }
}

const input = (extra: Partial<SessionSyncInput> = {}): SessionSyncInput => ({
  source: { opencodeDb: "/s/opencode.db", contextDb: "/s/context.db", readableOpencodeDb: null, readableContextDb: null },
  target: { opencodeDb: "/t/opencode.db", contextDb: "/t/context.db", readableOpencodeDb: null, readableContextDb: null },
  sessions: "all",
  maps: [],
  prefer: "further",
  context: "all",
  dryRun: false,
  ...extra,
})

const identity = (id: string, worktree: string, real: string): ProjectIdentity => ({ id, worktree, vcs: "git", real })

describe("SyncSessionsUseCase", () => {
  it("copies, replaces, keeps and skips each session by its history, then swaps both stores in with one backup", () => {
    const { useCase, files, plans, builds } = setup({
      source: {
        ses_new: { directory: "C:/Users/Me/repo", project: "p_win" },
        ses_child: { directory: "C:/Users/Me/elsewhere/deep/er", parent: "ses_new", project: "p_win" },
        ses_rep: { directory: "C:/Users/Me/rep", ids: ["a", "b"], project: "p_rep" },
        ses_rep_child: { directory: "C:/Users/Me/rep", parent: "ses_rep", project: "p_rep" },
        ses_src: { directory: "C:/Users/Me/gone/x", project: "p_gone" },
        ses_global: { directory: "C:/Users/Me/nowhere", project: "p_unknown" },
        ses_same: { directory: "C:/Users/Me/same", ids: ["a"] },
        ses_ahead: { directory: "C:/Users/Me/same", ids: ["a"] },
        ses_div: { directory: "C:/Users/Me/same", ids: ["a", "x"] },
        ses_hid: { directory: "C:/Users/Me", generation: "v1" },
      },
      target: {
        ses_rep: { directory: "/home/me/moved/rep", ids: ["a"], project: "p_here" },
        ses_same: { directory: "/home/me/same", ids: ["a"], project: "p_same" },
        ses_ahead: { directory: "/home/me/same", ids: ["a", "b"] },
        ses_div: { directory: "/home/me/same", ids: ["a", "y"] },
      },
      sourceProjects: { p_win: "C:/Users/Me/repo", p_gone: "C:/Users/Me/gone" },
      targetProjects: { p_here: "/home/me/moved", p_else: "/home/me/elsewhere", p_deep: "/home/me/elsewhere/deep", global: "/" },
      hidden: ["ses_hid"],
      folders: { "/home/me/repo": identity("p_repo", "/home/me/repo", "/home/me/repo") },
    })
    const report = useCase.sync(input())

    expect(report.sessions.map((session) => [session.id, session.relation, session.action, session.reason, session.sessions_written, session.project_source])).toEqual([
      ["ses_new", "missing", "copy", null, 2, "derived"],
      ["ses_rep", "source-ahead", "replace", null, 2, "target"],
      ["ses_src", "missing", "copy", null, 1, "source"],
      ["ses_global", "missing", "copy", null, 1, "source"],
      ["ses_same", "same", "keep", null, 0, null],
      ["ses_ahead", "target-ahead", "keep", null, 0, null],
      ["ses_div", "diverged", "skip", "diverged", 0, null],
      ["ses_hid", null, "skip", "hidden-run", 0, null],
    ])
    expect(plans.map((plan) => [plan.root, plan.sessions, plan.projects])).toEqual([
      [
        "ses_new",
        [
          { id: "ses_new", projectId: "p_repo", directory: "/home/me/repo", path: null },
          { id: "ses_child", projectId: "p_deep", directory: "/home/me/elsewhere/deep/er", path: "er" },
        ],
        [{ id: "p_repo", worktree: "/home/me/repo", vcs: "git", templateId: "p_win" }],
      ],
      [
        "ses_rep",
        [
          { id: "ses_rep", projectId: "p_here", directory: "/home/me/moved/rep", path: "rep" },
          { id: "ses_rep_child", projectId: "p_here", directory: "/home/me/moved/rep", path: "rep" },
        ],
        [],
      ],
      ["ses_src", [{ id: "ses_src", projectId: "p_gone", directory: "/home/me/gone/x", path: "x" }], [{ id: "p_gone", worktree: "/home/me/gone", vcs: null, templateId: "p_gone" }]],
      ["ses_global", [{ id: "ses_global", projectId: "p_unknown", directory: "/home/me/nowhere", path: "home/me/nowhere" }], [{ id: "p_unknown", worktree: "/", vcs: null, templateId: null }]],
    ])
    expect(plans[1]!.rewriter!.rewrite("C:/Users/Me/rep/file")).toBe("/home/me/moved/rep/file")
    expect(builds[0]!.sessions).toEqual([
      { id: "ses_new", resolution: "replace" },
      { id: "ses_child", resolution: "replace" },
      { id: "ses_rep", resolution: "replace" },
      { id: "ses_rep_child", resolution: "replace" },
      { id: "ses_src", resolution: "replace" },
      { id: "ses_global", resolution: "replace" },
      { id: "ses_same", resolution: "further" },
      { id: "ses_ahead", resolution: "further" },
    ])
    expect(builds[0]).toMatchObject({ sourceOpencodeDb: SOURCE, targetOpencodeDb: TARGET, workDir: WORK })
    expect(builds[0]!.mappingFor!(stored("ses_rep", { directory: "x" }), stored("ses_rep", { directory: "y" }))?.relocations).toEqual([
      { from: "/home/me/rep", to: "/home/me/moved/rep" },
    ])
    expect(builds[0]!.mappingFor!(stored("ses_unplanned", { directory: "x" }), stored("ses_unplanned", { directory: "y" }))).toBeNull()

    const backup = `/t/sync-backup-${STAMP}`
    expect(report).toMatchObject({
      dry_run: false,
      backup_dir: backup,
      rollback: `opencode-session-manager rollback ${backup} --db /t/opencode.db --db /t/context.db`,
      checks: { integrity_ok: true, foreign_keys_ok: true, sessions_ok: true, context: { anchors_ok: true } },
      source_context_db: "/s/context.db",
    })
    expect(report.sessions[0]).toMatchObject({ rows_written: 20, context: { status: "copied" } })
    expect(report.sessions[6]!.context).toBeNull()
    for (const name of ["opencode.db", "opencode.db-wal", "context.db"]) expect(files.has(`${backup}/${name}`)).toBe(true)
    expect(files.has("/t/opencode.db") && files.has("/t/context.db")).toBe(true)
    expect(files.has(WORK)).toBe(false)
  })

  it("takes named sessions, keeps the target's folder for a session it has, and moves POSIX folders by rule", () => {
    const { useCase, plans, builds } = setup({
      source: { ses_a: { directory: "/old/a", ids: ["a", "b"] }, ses_b: { directory: "/old/b" } },
      target: { ses_a: { directory: "/new/a", ids: ["a"], project: "p" } },
      targetProjects: { p: "/new" },
      context: false,
    })
    const report = useCase.sync(input({ sessions: ["ses_b", "ses_a", "ses_b", "ses_none"], maps: [{ from: "/old", to: "/new" }], prefer: "keep" }))
    expect(report.sessions.map((session) => [session.id, session.action, session.reason, session.target_directory])).toEqual([
      ["ses_b", "copy", null, "/new/b"],
      ["ses_a", "replace", null, "/new/a"],
      ["ses_none", "skip", "not-on-source", null],
    ])
    expect(plans.map((plan) => plan.sessions[0]!.projectId)).toEqual(["p", "p"])
    expect(builds).toEqual([])
    expect(report).toMatchObject({ source_context_db: null, target_context_db: null, checks: { context: null } })
    expect(report.rollback).toEndWith("--db /t/opencode.db")
  })

  it("moves a kept folder without any profile mapping, and only swaps the store that changed", () => {
    const { useCase, builds, files } = setup({
      source: { ses_a: { directory: "/w/a" } },
      target: { ses_a: { directory: "/v/a", project: "p" } },
      contextCopied: 1,
    })
    const report = useCase.sync(input({ prefer: "replace" }))
    expect(builds[0]!.mappingFor!(stored("ses_a", { directory: "/w/a" }), stored("ses_a", { directory: "/v/a" }))).toEqual({
      home: "/home/me",
      windowsUser: "\u0000",
      drive: "\u0000",
      relocations: [{ from: "/w/a", to: "/v/a" }],
    })
    expect(builds[0]!.sessions).toEqual([{ id: "ses_a", resolution: "replace" }])
    expect(report.sessions[0]).toMatchObject({ action: "keep", context: { status: "copied" } })
    expect(report.rollback).toBe(`opencode-session-manager rollback /t/sync-backup-${STAMP} --db /t/context.db`)
    expect(files.has(`/t/sync-backup-${STAMP}/opencode.db`)).toBe(false)
  })

  it("changes nothing on a dry run or when nothing is to be written, and reads snapshots when given", () => {
    const dry = setup({ source: { ses_a: { directory: "/w" } } })
    const report = dry.useCase.sync(input({ dryRun: true, prefer: "keep" }))
    expect(report).toMatchObject({ dry_run: true, backup_dir: null, rollback: null })
    expect(dry.files.has("/t/sync-backup-" + STAMP)).toBe(false)

    const idle = setup({ source: { ses_a: { directory: "/w" } }, target: { ses_a: { directory: "/w" } }, contextCopied: 0 })
    expect(idle.useCase.sync(input()).backup_dir).toBeNull()

    const snap = setup({ source: { ses_a: { directory: "/w" } }, context: false })
    snap.files.add("/snap/opencode.db")
    snap.useCase.sync(
      input({ source: { opencodeDb: "/s/opencode.db", contextDb: "/s/context.db", readableOpencodeDb: "/snap/opencode.db", readableContextDb: "/snap/context.db" }, dryRun: true }),
    )
    expect(snap.sqlite.calls).toEqual([`vacuumInto:/snap/opencode.db->${SOURCE}`, `vacuumInto:/t/opencode.db->${TARGET}`])
  })

  it("refuses missing stores, a held target, different OpenCode formats and too little space", () => {
    const missing = setup()
    missing.files.remove("/t/opencode.db")
    expect(() => missing.useCase.sync(input())).toThrow(DatabaseNotFoundError)
    expect(() => setup({ holder: "opencode (pid 7)" }).useCase.sync(input())).toThrow(DatabaseHeldError)
    expect(() => setup({ holder: "opencode (pid 7)", context: false }).useCase.sync(input())).toThrow(DatabaseHeldError)
    expect(setup({ holder: "opencode (pid 7)" }).useCase.sync(input({ dryRun: true })).dry_run).toBe(true)
    expect(() => setup({ formats: { source: ["m1", "m2"] } }).useCase.sync(input())).toThrow(new OpenCodeFormatMismatchError("/s/opencode.db", "m2", "/t/opencode.db", "m1"))
    expect(() => setup({ formats: { source: [], target: ["m1"] } }).useCase.sync(input())).toThrow(new OpenCodeFormatMismatchError("/s/opencode.db", "none", "/t/opencode.db", "m1"))
    expect(() => setup({ formats: { source: ["m1"], target: [] } }).useCase.sync(input())).toThrow(/at none:/)
    expect(() => setup({ source: { ses_a: { directory: "/w" } }, free: 1 }).useCase.sync(input())).toThrow(InsufficientSpaceError)
  })

  it("--strict refuses the whole sync when Magic Context is busy with a requested session; by default only that session's state is skipped", () => {
    const world = { source: { ses_a: { directory: "/w" }, ses_b: { directory: "/w" } }, contextBusy: ["ses_b"] }
    const strict = setup(world)
    expect(() => strict.useCase.sync(input({ strict: true }))).toThrow(new BusySessionsError(["ses_b"]))
    expect([strict.files.has(`/t/sync-backup-${STAMP}/opencode.db`), strict.lock.held.size]).toEqual([false, 0])
    expect(() => setup(world).useCase.sync(input({ strict: true, dryRun: true }))).toThrow(BusySessionsError)
    const loose = setup(world).useCase.sync(input())
    expect([loose.sessions.map((session) => session.context?.reason ?? null), loose.backup_dir]).toEqual([[null, "busy"], `/t/sync-backup-${STAMP}`])
  })

  it("writes under both target stores' locks, reports stale ones, and refuses while another writer holds one", () => {
    const world = { source: { ses_a: { directory: "/w" } } }
    const run = setup(world)
    run.lock.stale = [{ file: "/t/opencode.db.session-manager.lock", pid: 3, command: "run", since: "t" }]
    expect(run.useCase.sync(input()).stale_locks_cleared).toEqual(run.lock.stale)
    expect([run.lock.taken, run.lock.releases]).toEqual([[["/t/opencode.db", "/t/context.db"]], 1])
    const noContext = setup({ ...world, context: false })
    noContext.useCase.sync(input())
    expect(noContext.lock.taken).toEqual([["/t/opencode.db"]])
    const dry = setup(world)
    expect([dry.useCase.sync(input({ dryRun: true })).stale_locks_cleared, dry.lock.taken]).toEqual([[], []])
    const locked = setup(world)
    locked.lock.held.set("/t/context.db", { pid: 8, command: "context sync", since: "t" })
    expect(() => locked.useCase.sync(input())).toThrow(StoreLockedError)
    expect(locked.files.has(`/t/sync-backup-${STAMP}/opencode.db`)).toBe(false)
  })

  it("leaves both targets untouched when a check fails", () => {
    const world: World = { source: { ses_a: { directory: "C:/Users/Me/a" } } }
    const cases: [World, string[]][] = [
      [{ ...world, health: { integrity_ok: false, foreign_keys_ok: true } }, ["integrity_ok"]],
      [{ ...world, health: { integrity_ok: true, foreign_keys_ok: false } }, ["foreign_keys_ok"]],
      [{ ...world, stored: () => null }, ["sessions_ok"]],
      [{ ...world, stored: (plan) => ({ projectId: plan.projectId, directory: plan.directory, projectExists: false }) }, ["sessions_ok"]],
      [{ ...world, stored: (plan) => ({ projectId: plan.projectId, directory: "/elsewhere", projectExists: true }) }, ["sessions_ok"]],
      // A folder the rules leave on a Windows drive.
      [{ source: { ses_a: { directory: "C:/Other/a" } } }, ["sessions_ok"]],
      [{ ...world, contextChecksOk: false }, ["anchors_ok"]],
    ]
    for (const [state, failed] of cases) {
      const { useCase, files } = setup(state)
      expect(() => useCase.sync(input({ maps: [{ from: "/x", to: "/y" }] }))).toThrow(new SyncVerificationError(failed))
      expect(files.has(`/t/sync-backup-${STAMP}`)).toBe(false)
    }
  })

  it("undoes the first swap when the second fails, and removes the incoming copies", () => {
    const { useCase, files } = setup({ source: { ses_a: { directory: "/w" } }, failRenameFrom: `/t/context.db.incoming-${STAMP}` })
    expect(() => useCase.sync(input())).toThrow(SwapFailedError)
    expect(files.has("/t/opencode.db") && files.has("/t/opencode.db-wal") && files.has("/t/context.db")).toBe(true)
    expect(files.has(`/t/sync-backup-${STAMP}/opencode.db`)).toBe(false)
    expect(files.has(`/t/opencode.db.incoming-${STAMP}`) || files.has(`/t/context.db.incoming-${STAMP}`)).toBe(false)
  })
})
