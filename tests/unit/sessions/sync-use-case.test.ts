import { describe, expect, it } from "bun:test"
import { GuardService } from "@session-manager/application/GuardService"
import { SwapService } from "@session-manager/application/SwapService"
import { MagicContextSyncService } from "@session-manager/application/MagicContextSyncService"
import { SyncMagicContextUseCase } from "@session-manager/application/SyncMagicContextUseCase"
import { BusySessionsError } from "@session-manager/domain/errors/BusySessionsError"
import { DatabaseHeldError } from "@session-manager/domain/errors/DatabaseHeldError"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { MagicContextFormatMismatchError } from "@session-manager/domain/errors/MagicContextFormatMismatchError"
import { SwapFailedError } from "@session-manager/domain/errors/SwapFailedError"
import { StoreLockedError } from "@session-manager/domain/errors/StoreLockedError"
import { SyncVerificationError } from "@session-manager/domain/errors/SyncVerificationError"
import type { SyncInput, SyncRequest } from "@session-manager/domain/model/MagicContextSync"
import type { PathMapping } from "@session-manager/domain/model/PathMapping"
import type { MagicContextSessionStats, StoredSession } from "@session-manager/domain/model/SessionCatalog"
import type { CopyOptions, CopyResult, SourceSessionState, StoredSessionState, StoreHealth } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"
import { FakeHolders } from "@test/support/maintenance/fakes/holders"
import { FakeStoreLock, fakeLocks } from "@test/support/maintenance/fakes/locks"
import { FakeProcessList } from "@test/support/maintenance/fakes/processes"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { FakeSqlite } from "@test/support/maintenance/fakes/sqlite"

const WORK = "/tmp/opencode/context-sync-2026-09-27-00-00-00"
const STATS: MagicContextSessionStats = { compartments: 1, tags: 1, lastTag: 1, notes: 0, memoriesOriginated: 0, project: null }

const stored = (id: string, directory: string): StoredSession => ({
  id,
  generation: "v2",
  projectId: "p",
  parentId: null,
  forkOf: null,
  title: id,
  directory,
  timeCreated: 0,
  timeUpdated: 1,
  timeArchived: null,
  entries: 2,
})

interface World {
  readonly formats?: Record<string, number | null>
  readonly upgradedTo?: number
  /** Sessions on each side: id → folder. */
  readonly source?: Record<string, string>
  readonly target?: Record<string, string>
  /** Message ids per session on each side. */
  readonly sourceIds?: Record<string, string[]>
  readonly targetIds?: Record<string, string[]>
  readonly states?: Record<string, SourceSessionState>
  readonly targetState?: Record<string, MagicContextSessionStats>
  readonly recorded?: Record<string, string>
  readonly identities?: Record<string, string>
  readonly health?: StoreHealth
  /** What the target holds after the copy, per session (default: what the copy reported). */
  readonly after?: Record<string, StoredSessionState>
  readonly holder?: string | null
  /** How far the target's own summaries reach, per session. */
  readonly targetReach?: Record<string, number>
  /** Sessions Magic Context is working on in the target store. */
  readonly busy?: readonly string[]
  /** Projects Magic Context's own module manages in the target store. */
  readonly managed?: readonly string[]
}

function setup(world: World = {}) {
  const files = new FakeFileSystem()
  for (const path of ["/s/opencode.db", "/s/context.db", "/t/opencode.db", "/t/context.db", "/t/context.db-wal", "/snap/opencode.db", "/snap/context.db"]) files.add(path)
  const sqlite = new FakeSqlite({ fingerprint: { schema: [], header: { userVersion: 0, applicationId: 0 }, tables: {} } })
  const vacuum = sqlite.vacuumInto.bind(sqlite)
  sqlite.vacuumInto = (from: string, to: string) => {
    vacuum(from, to)
    files.add(to)
  }
  const runtime = new FakeRuntime()
  runtime.temporary = "/tmp"
  runtime.home = "/home/me"
  const holders = new FakeHolders()
  holders.holder = world.holder ?? null
  const formats: Record<string, number | null> = { "/s/context.db": 94, "/t/context.db": 94, "/snap/context.db": 94, ...world.formats }
  const copies: { source: string; target: string }[] = []
  const mappings: PathMapping[] = []
  const copied: CopyResult[] = []
  const results = (ids: string[]): CopyResult[] =>
    ids.map((id) => ({ id, compartments: 1, tags: 2, notes: 0, memories_copied: 1, memories_already_there: 0, history_rows: 3, residual_windows_paths: id === "ses_win" ? 1 : 0 }))
  const optionsSeen: CopyOptions[] = []
  const builder = new MagicContextSyncService({
    sqlite,
    sessions: {
      sessions: (path) => Object.entries(path.startsWith("/s") ? (world.source ?? {}) : (world.target ?? {})).map(([id, dir]) => stored(id, dir)),
      messageIds: (path, id) => (path.startsWith("/s") ? world.sourceIds : world.targetIds)?.[id] ?? ["m1", "m2"],
    },
    contexts: {
      summary: () => ({ available: true, schemaVersion: 94, sessions: world.targetState ?? {} }),
      formatVersion: (path) => (Object.hasOwn(formats, path) ? formats[path]! : null),
    },
    syncStore: {
      sourceState: (path, id) =>
        path.endsWith("context-target.db")
          ? { harness: "opencode2", anchors: [], project: null, reach: world.targetReach?.[id] ?? 0 }
          : (world.states?.[id] ?? { harness: "opencode2", anchors: ["m1"], project: "dir:src", reach: 5 }),
      recordedProject: (_path, id) => world.recorded?.[id] ?? null,
      copySessions: (_source, _target, planned, options) => {
        optionsSeen.push(options)
        const out = results(planned.map((entry) => entry.copy.id))
        copied.push(...out)
        return {
          sessions: out,
          projects: options.projects.map((merge) => ({ from: merge.from, to: merge.to, memories_copied: 1, memories_already_there: 0, verifications: 0, notes: 0, primers: 0, dream_runs: 0, retrospective_windows: 0, skipped: null })),
          user_memories_copied: options.userMemories ? 1 : 0,
        }
      },
      authorityManaged: (_path, project) => world.managed?.includes(project) ?? false,
      stateOf: (_path, id) => world.after?.[id] ?? { compartments: 1, tags: 2, notes: 0, anchors: ["m1"] },
      health: () => world.health ?? { integrity_ok: true, foreign_keys_ok: true },
      busy: (_path, id) => world.busy?.includes(id) ?? false,
    },
    identity: { identityOf: (directory) => world.identities?.[directory] ?? null },
    copier: {
      copy: (input) => {
        copies.push(input)
        return { source: input.source, target: input.target, from_format: 91, to_format: world.upgradedTo ?? 94, upgraded: true, magic_context_version: "x" }
      },
    },
    runtime,
    rewriterFor: (mapping) => {
      mappings.push(mapping)
      return { rewrite: (text) => text, residual: () => false }
    },
  })
  const lock = new FakeStoreLock()
  const useCase = new SyncMagicContextUseCase({ builder, guard: new GuardService(files, new FakeProcessList(), holders), locks: fakeLocks(runtime, lock), swap: new SwapService(files), fileSystem: files, runtime })
  return { useCase, files, sqlite, holders, copies, mappings, copied, optionsSeen, lock }
}

const input = (sessions: SyncRequest[], extra: Partial<SyncInput> = {}): SyncInput => ({
  source: { opencodeDb: "/s/opencode.db", contextDb: "/s/context.db", readableOpencodeDb: null, readableContextDb: null },
  target: { opencodeDb: "/t/opencode.db", contextDb: "/t/context.db", readableOpencodeDb: null, readableContextDb: null },
  sessions,
  scope: "sessions",
  dryRun: false,
  ...extra,
})
const replace = (...ids: string[]): SyncRequest[] => ids.map((id) => ({ id, resolution: "replace" }))

describe("SyncMagicContextUseCase", () => {
  it("copies a session both sides hold, checks the copy, and swaps it in with a backup", () => {
    const { useCase, files, sqlite, copied } = setup({ source: { ses_a: "/w/a" }, target: { ses_a: "/w/a" }, identities: { "/w/a": "git:root" } })
    const report = useCase.sync(input(replace("ses_a", "ses_a")))
    expect(report).toEqual({
      source_context_db: "/s/context.db",
      target_context_db: "/t/context.db",
      format: 94,
      dry_run: false,
      scope: "sessions",
      sessions: [
        {
          id: "ses_a",
          status: "copied",
          reason: null,
          relation: "same",
          counts: { compartments: 1, tags: 2, notes: 0, memories_copied: 1, memories_already_there: 0, history_rows: 3 },
          residual_windows_paths: 0,
        },
      ],
      projects: [],
      user_memories_copied: 0,
      checks: { integrity_ok: true, foreign_keys_ok: true, anchors_ok: true, counts_ok: true },
      backup_dir: "/t/context-sync-backup-2026-09-27-00-00-00",
      stale_locks_cleared: [],
    })
    expect(copied.map((result) => result.id)).toEqual(["ses_a"])
    expect(sqlite.calls).toEqual([`vacuumInto:/s/context.db->${WORK}/context-source.db`, `vacuumInto:/t/context.db->${WORK}/context-target.db`])
    expect(files.has("/t/context-sync-backup-2026-09-27-00-00-00/context.db")).toBe(true)
    expect(files.has("/t/context-sync-backup-2026-09-27-00-00-00/context.db-wal")).toBe(true)
    expect(files.has("/t/context.db")).toBe(true)
    expect(files.has("/t/context.db.incoming-2026-09-27-00-00-00")).toBe(false)
  })

  it("explains every session it leaves alone", () => {
    const { useCase, copied } = setup({
      source: { ses_choice: "/w", ses_nostate: "/w", ses_ahead: "/w", ses_div: "/w", ses_stale: "/w", ses_noproject: "/w", ses_notarget: "/w" },
      target: { ses_choice: "/w", ses_nostate: "/w", ses_ahead: "/w", ses_div: "/w", ses_stale: "/w", ses_noproject: "/w", ses_nosource: "/w" },
      targetState: { ses_choice: STATS },
      states: {
        ses_nostate: { harness: null, anchors: [], project: null, reach: 0 },
        ses_stale: { harness: "opencode", anchors: ["gone"], project: "dir:src", reach: 5 },
        ses_noproject: { harness: "opencode2", anchors: [], project: "dir:src", reach: 5 },
      },
      sourceIds: { ses_ahead: ["m1", "m2", "m3"], ses_div: ["m1", "x"] },
      identities: { "/w": "dir:w" },
      recorded: {},
    })
    const report = useCase.sync(
      input([
        { id: "ses_choice", resolution: "skip" },
        ...replace("ses_nosource", "ses_notarget", "ses_nostate", "ses_ahead", "ses_div", "ses_stale"),
      ]),
    )
    expect(report.sessions.map((session) => [session.id, session.reason, session.relation])).toEqual([
      ["ses_choice", "resolution-skip", "same"],
      ["ses_nosource", "not-on-source", null],
      ["ses_notarget", "not-on-target", null],
      ["ses_nostate", "no-state", "same"],
      ["ses_ahead", "source-ahead", "source-ahead"],
      ["ses_div", "diverged", "diverged"],
      ["ses_stale", "stale-anchors", "same"],
    ])
    expect(report.backup_dir).toBeNull()
    expect(copied).toEqual([])
  })

  it("finds the target project: as recorded, else from the folder, else a git identity of the source, else none", () => {
    const { useCase, copied } = setup({
      source: { ses_rec: "/w", ses_dir: "/w", ses_git: "/x", ses_none: "/x", ses_kept: "/w" },
      target: { ses_rec: "/w", ses_dir: "/w", ses_git: "/x", ses_none: "/x", ses_kept: "/w" },
      recorded: { ses_rec: "dir:recorded" },
      identities: { "/w": "dir:here" },
      states: {
        ses_git: { harness: "opencode2", anchors: [], project: "git:abc", reach: 5 },
        ses_none: { harness: "opencode2", anchors: [], project: "dir:elsewhere", reach: 5 },
        ses_kept: { harness: "opencode2", anchors: [], project: null, reach: 5 },
      },
      targetIds: { ses_dir: ["m1", "m2", "m3"] },
      targetState: { ses_kept: STATS },
    })
    const report = useCase.sync(input([...replace("ses_rec", "ses_dir", "ses_git", "ses_none"), { id: "ses_kept", resolution: "replace" }], { dryRun: true }))
    expect(report.sessions.map((session) => [session.id, session.status, session.reason, session.relation])).toEqual([
      ["ses_rec", "copied", null, "same"],
      ["ses_dir", "copied", null, "target-ahead"],
      ["ses_git", "copied", null, "same"],
      ["ses_none", "skipped", "no-project", "same"],
      ["ses_kept", "copied", null, "same"],
    ])
    expect(report.backup_dir).toBeNull()
    expect(copied.length).toBe(4)
  })

  it("rewrites the text of a session that moved from a Windows profile to this machine", () => {
    const { useCase, mappings } = setup({
      source: { ses_win: "C:/Users/Me/work/app", ses_posix: "/w" },
      target: { ses_win: "/home/me/apps/app", ses_posix: "/w" },
      identities: { "/home/me/apps/app": "dir:app", "/w": "dir:w" },
    })
    const report = useCase.sync(input(replace("ses_win", "ses_posix"), { dryRun: true }))
    expect(mappings).toEqual([
      { home: "/home/me", windowsUser: "Me", drive: "C", relocations: [{ from: "/home/me/work/app", to: "/home/me/apps/app" }] },
    ])
    expect(report.sessions[0]!.residual_windows_paths).toBe(1)
  })

  it("brings an older source to the target's format with the installed Magic Context, and reads snapshots when given", () => {
    const { useCase, copies, sqlite } = setup({ formats: { "/snap/context.db": 91 }, source: {}, target: {} })
    const report = useCase.sync(
      input([], {
        source: { opencodeDb: "/s/opencode.db", contextDb: "/s/context.db", readableOpencodeDb: "/snap/opencode.db", readableContextDb: "/snap/context.db" },
      }),
    )
    expect(copies).toEqual([{ source: "/snap/context.db", target: `${WORK}/context-source.db` }])
    expect(sqlite.calls).toEqual([`vacuumInto:/t/context.db->${WORK}/context-target.db`])
    expect(report).toMatchObject({ sessions: [], backup_dir: null, source_context_db: "/s/context.db" })
  })

  it("with scope all, merges each source project into its target project once, and the user memories; a managed project's sessions are left alone", () => {
    const { useCase, optionsSeen } = setup({
      source: { ses_a: "/w", ses_b: "/w", ses_c: "/v", ses_m: "/m" },
      target: { ses_a: "/w", ses_b: "/w", ses_c: "/v", ses_m: "/m" },
      identities: { "/w": "dir:w", "/v": "dir:v", "/m": "dir:m" },
      managed: ["dir:m"],
    })
    const report = useCase.sync(input(replace("ses_a", "ses_b", "ses_c", "ses_m"), { scope: "all" }))
    expect(optionsSeen[0]).toMatchObject({ originatedMemories: false, userMemories: true, now: expect.any(Number) })
    expect(optionsSeen[0]!.projects.map((merge) => [merge.from, merge.to])).toEqual([
      ["dir:src", "dir:w"],
      ["dir:src", "dir:v"],
      ["dir:src", "dir:m"],
    ])
    expect(report.projects.map((project) => project.to)).toEqual(["dir:w", "dir:v", "dir:m"])
    expect(report.user_memories_copied).toBe(1)
    expect(report.sessions.find((session) => session.id === "ses_m")).toMatchObject({ status: "skipped", reason: "authority-managed" })

    const none = setup({ source: { ses_a: "/w" }, target: { ses_a: "/w" }, identities: { "/w": "dir:w" }, states: { ses_a: { harness: "opencode2", anchors: [], project: null, reach: 1 } } })
    none.useCase.sync(input(replace("ses_a"), { scope: "all", dryRun: true }))
    expect(none.optionsSeen[0]).toMatchObject({ projects: [], userMemories: false })
    const empty = setup({})
    empty.useCase.sync(input([], { scope: "all", dryRun: true }))
    expect(empty.optionsSeen[0]).toMatchObject({ projects: [], userMemories: false })
  })

  it("with \"further\", replaces the target's state only when the source's summaries reach further, and leaves a busy session alone", () => {
    const { useCase } = setup({
      source: { ses_behind: "/w", ses_ahead: "/w", ses_fresh: "/w", ses_busy: "/w" },
      target: { ses_behind: "/w", ses_ahead: "/w", ses_fresh: "/w", ses_busy: "/w" },
      identities: { "/w": "dir:w" },
      targetState: { ses_behind: STATS, ses_ahead: STATS },
      targetReach: { ses_behind: 5, ses_ahead: 3 },
      busy: ["ses_busy"],
    })
    const further = (...ids: string[]): SyncRequest[] => ids.map((id) => ({ id, resolution: "further" }))
    const report = useCase.sync(input(further("ses_behind", "ses_ahead", "ses_fresh", "ses_busy"), { dryRun: true }))
    expect(report.sessions.map((session) => [session.id, session.status, session.reason])).toEqual([
      ["ses_behind", "skipped", "target-further"],
      ["ses_ahead", "copied", null],
      ["ses_fresh", "copied", null],
      ["ses_busy", "skipped", "busy"],
    ])
  })

  it("--strict refuses the whole sync when a requested session is busy, before writing anything", () => {
    const world = { source: { ses_a: "/w", ses_busy: "/w" }, target: { ses_a: "/w", ses_busy: "/w" }, identities: { "/w": "dir:w" }, busy: ["ses_busy"] }
    const requests: SyncRequest[] = [
      { id: "ses_a", resolution: "replace" },
      { id: "ses_busy", resolution: "replace" },
    ]
    const strict = setup(world)
    expect(() => strict.useCase.sync(input(requests, { strict: true }))).toThrow(new BusySessionsError(["ses_busy"]))
    expect(strict.files.has("/t/context-sync-backup-2026-09-27-00-00-00/context.db")).toBe(false)
    expect([strict.lock.taken, strict.lock.held.size]).toEqual([[["/t/context.db"]], 0])
    expect(() => setup(world).useCase.sync(input(requests, { strict: true, dryRun: true }))).toThrow(BusySessionsError)
    expect(setup(world).useCase.sync(input(requests)).sessions.map((session) => session.reason)).toEqual([null, "busy"])
    expect(setup(world).useCase.sync(input([requests[0]!], { strict: true })).backup_dir).not.toBeNull()
  })

  it("writes under the target store's lock, reports stale locks, and refuses while another writer holds it", () => {
    const world = { source: { ses_a: "/w" }, target: { ses_a: "/w" }, identities: { "/w": "dir:w" } }
    const run = setup(world)
    run.lock.stale = [{ file: "/t/context.db.session-manager.lock", pid: 3, command: "sync", since: "t" }]
    expect(run.useCase.sync(input(replace("ses_a", "ses_a"))).stale_locks_cleared).toEqual(run.lock.stale)
    expect([run.lock.taken, run.lock.releases]).toEqual([[["/t/context.db"]], 1])
    const dry = setup(world)
    expect(dry.useCase.sync(input(replace("ses_a", "ses_a"), { dryRun: true })).stale_locks_cleared).toEqual([])
    expect(dry.lock.taken).toEqual([])
    const locked = setup(world)
    locked.lock.held.set("/t/context.db", { pid: 8, command: "rollback", since: "t" })
    expect(() => locked.useCase.sync(input(replace("ses_a", "ses_a")))).toThrow(StoreLockedError)
  })

  it("refuses missing stores, a held target, a newer source and an upgrade that misses the target's format", () => {
    expect(() => setup().useCase.sync(input([], { target: { opencodeDb: "/t/opencode.db", contextDb: "/nope.db", readableOpencodeDb: null, readableContextDb: null } }))).toThrow(
      DatabaseNotFoundError,
    )
    expect(() => setup({ holder: "opencode (pid 7)" }).useCase.sync(input([]))).toThrow(DatabaseHeldError)
    expect(setup({ holder: "opencode (pid 7)" }).useCase.sync(input([], { dryRun: true })).dry_run).toBe(true)
    expect(() => setup({ formats: { "/s/context.db": 95 } }).useCase.sync(input([]))).toThrow(
      new MagicContextFormatMismatchError("/s/context.db", 95, "/t/context.db", 94),
    )
    expect(() => setup({ formats: { "/s/context.db": null, "/t/context.db": null } }).useCase.sync(input([]))).not.toThrow()
    const missed = setup({ formats: { "/s/context.db": 80 }, upgradedTo: 95 })
    expect(() => missed.useCase.sync(input([]))).toThrow(new MagicContextFormatMismatchError("/s/context.db", 95, "/t/context.db", 94))
    expect(missed.files.has(`${WORK}/context-source.db`)).toBe(false)
  })

  it("leaves the target untouched when the copy fails a check", () => {
    const world = { source: { ses_a: "/w" }, target: { ses_a: "/w" }, identities: { "/w": "dir:w" } }
    const cases: [World, string][] = [
      [{ ...world, health: { integrity_ok: false, foreign_keys_ok: true } }, "integrity_ok"],
      [{ ...world, health: { integrity_ok: true, foreign_keys_ok: false } }, "foreign_keys_ok"],
      [{ ...world, after: { ses_a: { compartments: 1, tags: 2, notes: 0, anchors: ["elsewhere"] } } }, "anchors_ok"],
      [{ ...world, after: { ses_a: { compartments: 0, tags: 2, notes: 0, anchors: [] } } }, "counts_ok"],
      [{ ...world, after: { ses_a: { compartments: 1, tags: 9, notes: 0, anchors: [] } } }, "counts_ok"],
      [{ ...world, after: { ses_a: { compartments: 1, tags: 2, notes: 9, anchors: [] } } }, "counts_ok"],
    ]
    for (const [state, check] of cases) {
      const { useCase, files } = setup(state)
      expect(() => useCase.sync(input(replace("ses_a")))).toThrow(new SyncVerificationError([check]))
      expect(files.has("/t/context.db")).toBe(true)
      expect(files.has("/t/context-sync-backup-2026-09-27-00-00-00")).toBe(false)
    }
  })

  it("removes the incoming copy when the swap fails, and a copy result missing for a session fails the counts", () => {
    const { useCase, files } = setup({ source: { ses_a: "/w" }, target: { ses_a: "/w" }, identities: { "/w": "dir:w" } })
    files.failRenameFrom = "/t/context.db.incoming-2026-09-27-00-00-00"
    expect(() => useCase.sync(input(replace("ses_a")))).toThrow(SwapFailedError)
    expect(files.has("/t/context.db.incoming-2026-09-27-00-00-00")).toBe(false)
    expect(files.has("/t/context.db")).toBe(true)
  })
})
