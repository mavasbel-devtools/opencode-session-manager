import { describe, expect, it } from "bun:test"
import { ApplyQueueUseCase } from "@session-manager/application/ApplyQueueUseCase"
import { MagicContextFormatMismatchError } from "@session-manager/domain/errors/MagicContextFormatMismatchError"
import { SyncVerificationError } from "@session-manager/domain/errors/SyncVerificationError"
import { createBrowser, reduce, type QueueEntry } from "@session-manager/domain/model/Browser"
import { harnessFor, isContextScope, relationOf, projectLines, syncSideOf, type SessionOutcome, type SyncReport } from "@session-manager/domain/model/MagicContextSync"
import { contextOutcomeText, sessionSyncLines, type SessionSyncInput, type SessionSyncOutcome, type SessionSyncReport } from "@session-manager/domain/model/SessionSync"
import { hasContextState } from "@session-manager/domain/model/SessionCatalog"
import { inferWindowsMapping } from "@session-manager/domain/services/WindowsMapping"
import { opened, session } from "@test/support/sessions/catalogs"

const STATS = { compartments: 1, tags: 2, lastTag: 2, notes: 0, memoriesOriginated: 0, project: null }
const entry = (id: string, direction: QueueEntry["direction"], prefer: QueueEntry["prefer"] = "further"): QueueEntry => ({
  id,
  title: id,
  direction,
  source: session({ id, directory: "/w", updated: 1, context: {} }),
  target: null,
  prefer,
  planned: null,
})

const outcome = (id: string, action: SessionSyncOutcome["action"], extra: Partial<SessionSyncOutcome> = {}): SessionSyncOutcome => ({
  id,
  title: id,
  relation: action === "copy" ? "missing" : action === "skip" ? "diverged" : "same",
  action,
  reason: action === "skip" ? "diverged" : null,
  sessions_written: 0,
  rows_written: 0,
  source_directory: null,
  target_directory: null,
  project_id: null,
  project_source: null,
  residual_windows_paths: 0,
  context: null,
  ...extra,
})

const sessionReport = (extra: Partial<SessionSyncReport> = {}): SessionSyncReport => ({
  source_opencode_db: "/s/opencode.db",
  target_opencode_db: "/t/opencode.db",
  source_context_db: "/s/context.db",
  target_context_db: "/t/context.db",
  dry_run: false,
  context: "all",
  sessions: [],
  projects: [],
  user_memories_copied: 0,
  checks: { integrity_ok: true, foreign_keys_ok: true, sessions_ok: true, context: null },
  backup_dir: null,
  rollback: null,
  stale_locks_cleared: [],
  ...extra,
})

const report = (extra: Partial<SyncReport> = {}): SyncReport => ({
  source_context_db: "/s/context.db",
  target_context_db: "/t/context.db",
  format: 94,
  dry_run: false,
  scope: "all",
  sessions: [],
  projects: [],
  user_memories_copied: 0,
  checks: null,
  backup_dir: null,
  stale_locks_cleared: [],
  ...extra,
})

describe("Magic Context sync rules", () => {
  it("labels rows by OpenCode generation", () => {
    expect([harnessFor("v1"), harnessFor("v2")]).toEqual(["opencode", "opencode2"])
  })

  it("relates two message histories", () => {
    expect(relationOf(["a", "b"], ["a", "b"])).toBe("same")
    expect(relationOf(["a"], ["a", "b"])).toBe("target-ahead")
    expect(relationOf(["a", "b", "c"], ["a", "b"])).toBe("source-ahead")
    expect(relationOf(["a", "x"], ["a", "b", "c"])).toBe("diverged")
    expect(relationOf([], [])).toBe("same")
  })

  it("counts summaries, tags or session notes as state, not a project or memories alone", () => {
    expect(hasContextState(null)).toBe(false)
    expect(hasContextState(undefined)).toBe(false)
    expect(hasContextState({ ...STATS, compartments: 0, tags: 0, notes: 0, memoriesOriginated: 5, project: "dir:x" })).toBe(false)
    expect(hasContextState({ ...STATS, compartments: 0, tags: 0, notes: 1 })).toBe(true)
    expect(hasContextState(STATS)).toBe(true)
  })

  it("infers the mapping a session's own folders imply", () => {
    expect(inferWindowsMapping("C:/Users/Me/work/app", "/home/me/work/app", "/home/me")).toEqual({
      home: "/home/me",
      windowsUser: "Me",
      drive: "C",
      relocations: [],
    })
    expect(inferWindowsMapping("d:\\users\\Robin\\x\\", "/srv/x", "/home/r")).toEqual({
      home: "/home/r",
      windowsUser: "Robin",
      drive: "d",
      relocations: [{ from: "/home/r/x", to: "/srv/x" }],
    })
    expect(inferWindowsMapping("C:/Users/Me", "/home/me", "/home/me")?.relocations).toEqual([])
    expect(inferWindowsMapping("/w/app", "/w/app", "/home/me")).toBeNull()
    expect(inferWindowsMapping("C:/Users/Me/app", "D:/app", "/home/me")).toBeNull()
  })

  it("names a sync side by its stores, or by its snapshot when it has one", () => {
    expect(syncSideOf(opened("left", []))).toEqual({
      opencodeDb: "/data/left/opencode/opencode.db",
      contextDb: "/data/left/cortexkit/magic-context/context.db",
      readableOpencodeDb: null,
      readableContextDb: null,
    })
    expect(syncSideOf(opened("right", [], { snapshot: "/tmp/snap" }))).toMatchObject({
      readableOpencodeDb: "/tmp/snap/opencode/opencode.db",
      readableContextDb: "/tmp/snap/cortexkit/magic-context/context.db",
    })
  })

  it("sums up what a sync merged into the target's projects", () => {
    const project = (skipped: "authority-managed" | null) => ({
      from: "dir:s",
      to: "dir:t",
      memories_copied: 5,
      memories_already_there: 1,
      verifications: 2,
      notes: 3,
      primers: 1,
      dream_runs: 4,
      retrospective_windows: 0,
      skipped,
    })
    expect(projectLines(report({ projects: [project(null), project(null), project("authority-managed")], user_memories_copied: 2 }))[0]).toBe(
      "Projects: 2 merged — 10 memories · 6 notes · 2 primers · 8 dreamer runs · 2 user memories (1 managed by Magic Context, left alone)",
    )
    expect(projectLines(report({ projects: [project(null)] }))[0]).toBe("Projects: 1 merged — 5 memories · 3 notes · 1 primers · 4 dreamer runs · 0 user memories")
    expect(projectLines(report())).toEqual([])
    expect([isContextScope("all"), isContextScope("sessions"), isContextScope("none")]).toEqual([true, true, false])
  })

  it("explains format and verification failures", () => {
    expect(new MagicContextFormatMismatchError("/s", 95, "/t", 91).message).toBe(
      "/s has Magic Context format 95 and /t has 91: update Magic Context where the target is used, start OpenCode there once, then sync again",
    )
    expect(new MagicContextFormatMismatchError("/s", 96, "/t", 95).name).toBe("MagicContextFormatMismatchError")
    expect(new MagicContextFormatMismatchError("/s", 90, "/t", 94).message).toEndWith("the installed Magic Context cannot bring the source to the target's format; update Magic Context here")
    const failed = new SyncVerificationError(["counts_ok", "anchors_ok"])
    expect([failed.name, failed.message]).toEqual(["SyncVerificationError", "the synced copy failed counts_ok, anchors_ok; the target store was left untouched"])
  })
})

describe("whole-session sync text", () => {
  it("says what happened to a session's Magic Context state, and sums a report up", () => {
    const copied: SessionOutcome = { id: "a", status: "copied", reason: null, relation: "same", counts: { compartments: 2, tags: 5, notes: 0, memories_copied: 1, memories_already_there: 0, history_rows: 0 }, residual_windows_paths: 0 }
    const kept: SessionOutcome = { ...copied, status: "skipped", reason: "target-further", counts: null }
    expect([contextOutcomeText(null), contextOutcomeText(copied), contextOutcomeText(kept)]).toEqual([null, "Magic Context copied", "Magic Context kept (target further)"])
    const sessions = [
      outcome("a", "copy", { context: copied }),
      outcome("b", "replace", { context: { ...copied, counts: null } }),
      outcome("c", "keep", { context: kept }),
      outcome("d", "skip"),
      outcome("e", "skip", { reason: "hidden-run", relation: null }),
    ]
    expect(sessionSyncLines(sessionReport({ dry_run: true, sessions }))).toEqual([
      "Dry run: 1 copied, 1 replaced, 1 kept, 2 skipped → /t/opencode.db",
      "Magic Context: state copied for 2 of 3 sessions (2 summaries · 5 tags · 1 memories)",
      "Skipped: 1 diverged, 1 plugin run",
      "The target stores were not changed.",
    ])
    expect(sessionSyncLines(sessionReport({ target_context_db: null, rollback: "opencode-session-manager rollback /b --db /t/opencode.db" }))).toEqual([
      "Applied: 0 copied, 0 replaced, 0 kept, 0 skipped → /t/opencode.db",
      "Originals kept; undo: opencode-session-manager rollback /b --db /t/opencode.db",
    ])
  })
})

describe("the browser after an apply", () => {
  it("shows a notice, then the result: a change clears the queue and shows the sides read again", () => {
    const left = opened("left", [session({ id: "ses_a", directory: "/w", updated: 1 })])
    const right = opened("right", [session({ id: "ses_a", directory: "/w", updated: 1, context: {} })])
    const state = { ...createBrowser(left, right, 5), queue: [entry("ses_a", "to-left")], view: "queue" as const }
    expect(reduce(state, { type: "notice", text: "Working…" }).notice).toBe("Working…")
    const fresh = opened("left", [session({ id: "ses_a", directory: "/w", updated: 1, context: { compartments: 3 } })])
    const applied = reduce(state, { type: "applied", result: ["Applied: 1 of 1", "more"], changed: true, left: fresh })
    expect(applied).toMatchObject({ queue: [], queueCursor: 0, lastResult: ["Applied: 1 of 1", "more"], notice: "Applied: 1 of 1" })
    expect(applied.left.catalog.sessions[0]!.magicContext?.compartments).toBe(3)
    expect(applied.right).toEqual(state.right)
    const rightOnly = reduce(state, { type: "applied", result: ["r"], changed: true, right: fresh })
    expect(rightOnly.right!.catalog).toBe(fresh.catalog)
    const checked = reduce({ ...state, queueCursor: 0 }, { type: "applied", result: ["Dry run"], changed: false })
    expect(checked.queue).toEqual(state.queue)
    const alone = reduce(createBrowser(left, null, 5), { type: "applied", result: ["x"], changed: false, right: fresh })
    expect(alone.right).toBeNull()
  })
})

describe("ApplyQueueUseCase", () => {
  const left = opened("left", [])
  const right = opened("right", [])
  function setup(fail?: string) {
    const syncs: SessionSyncInput[] = []
    const events: string[] = []
    const useCase = new ApplyQueueUseCase(
      {
        sync: (input) => {
          syncs.push(input)
          if (fail !== undefined && input.target.opencodeDb.includes(fail)) throw new Error(`cannot write ${fail}`)
          if (fail === "string") throw "plain failure"
          const ids = input.sessions as string[]
          return sessionReport({
            target_opencode_db: input.target.opencodeDb,
            dry_run: input.dryRun,
            sessions: ids.map((id) => outcome(id, "copy")),
            backup_dir: input.dryRun ? null : "/backup",
            rollback: input.dryRun ? null : "opencode-session-manager rollback /backup",
          })
        },
      },
      {
        open: (profile) => {
          events.push(`open ${profile.name}`)
          return opened(profile.name, [session({ id: "new", directory: "/w", updated: 1 })])
        },
        close: (profile) => {
          events.push(`close ${profile.catalog.profile.name}`)
        },
      },
    )
    return { useCase, syncs, events }
  }
  const maps = [{ from: "C:\\Users\\Me", to: "/home/me" }]

  it("syncs left to right, then right to left, with the map rules, scope and preferences, and reads each changed side again", () => {
    const { useCase, syncs, events } = setup()
    const result = useCase.apply({ queue: [entry("b", "to-left"), entry("a", "to-right", "keep")], left, right, dryRun: false, maps, scope: "sessions" })
    expect(syncs.map((input) => [input.source.opencodeDb, input.target.opencodeDb, input.sessions, input.preferFor, input.prefer, input.context, input.maps])).toEqual([
      ["/data/left/opencode/opencode.db", "/data/right/opencode/opencode.db", ["a"], { a: "keep" }, "further", "sessions", maps],
      ["/data/right/opencode/opencode.db", "/data/left/opencode/opencode.db", ["b"], {}, "further", "sessions", maps],
    ])
    expect(events).toEqual(["open right", "close right", "open left", "close left"])
    expect(result.changed).toBe(true)
    expect(result.left?.catalog.sessions[0]?.id).toBe("new")
    expect(result.right?.catalog.sessions[0]?.id).toBe("new")
    expect(result.result[0]).toBe("→ Applied: 1 copied, 0 replaced, 0 kept, 0 skipped → /data/right/opencode/opencode.db")
    expect(result.planned).toEqual({
      a: { action: "copy", relation: "missing", reason: null, context: null },
      b: { action: "copy", relation: "missing", reason: null, context: null },
    })
  })

  it("only checks on a dry run, and skips a direction with nothing queued", () => {
    const { useCase, syncs, events } = setup()
    const result = useCase.apply({ queue: [entry("a", "to-right")], left, right, dryRun: true, maps: [], scope: "all" })
    expect(syncs.length).toBe(1)
    expect(events).toEqual([])
    expect(result).toMatchObject({ changed: false })
    expect(result.result[0]).toStartWith("→ Dry run:")
  })

  it("explains an empty queue and a failure, keeping what was applied", () => {
    expect(setup().useCase.apply({ queue: [], left, right, dryRun: false, maps: [], scope: "all" })).toEqual({ result: ["The queue is empty."], changed: false, planned: {} })
    const partial = setup("/data/left/").useCase.apply({ queue: [entry("a", "to-right"), entry("b", "to-left")], left, right, dryRun: false, maps: [], scope: "all" })
    expect(partial.changed).toBe(true)
    expect(partial.result.at(-1)).toBe("Not applied: cannot write /data/left/")
    expect(setup("string").useCase.apply({ queue: [entry("a", "to-right")], left, right, dryRun: false, maps: [], scope: "all" }).result).toEqual(["Not applied: plain failure"])
  })
})
