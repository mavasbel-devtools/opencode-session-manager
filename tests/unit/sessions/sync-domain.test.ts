import { describe, expect, it } from "bun:test"
import { ApplyQueueUseCase } from "@session-manager/application/ApplyQueueUseCase"
import { MagicContextFormatMismatchError } from "@session-manager/domain/errors/MagicContextFormatMismatchError"
import { SyncVerificationError } from "@session-manager/domain/errors/SyncVerificationError"
import { createBrowser, reduce, requestsFor, type QueueEntry } from "@session-manager/domain/model/Browser"
import { harnessFor, relationOf, syncSideOf, syncSummary, type SyncInput, type SyncReport } from "@session-manager/domain/model/MagicContextSync"
import { hasContextState } from "@session-manager/domain/model/SessionCatalog"
import { inferWindowsMapping } from "@session-manager/domain/services/WindowsMapping"
import { opened, session } from "@test/support/sessions/catalogs"

const STATS = { compartments: 1, tags: 2, lastTag: 2, notes: 0, memoriesOriginated: 0, project: null }
const entry = (id: string, direction: QueueEntry["direction"], resolution: QueueEntry["resolution"], conflict = false): QueueEntry => ({
  id,
  title: id,
  direction,
  source: STATS,
  conflict,
  resolution,
})

const report = (extra: Partial<SyncReport> = {}): SyncReport => ({
  source_context_db: "/s/context.db",
  target_context_db: "/t/context.db",
  format: 94,
  dry_run: false,
  sessions: [],
  checks: null,
  backup_dir: null,
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
      mounts: [],
      relocations: [],
    })
    expect(inferWindowsMapping("d:\\users\\Robin\\x\\", "/srv/x", "/home/r")).toEqual({
      home: "/home/r",
      windowsUser: "Robin",
      drive: "d",
      mounts: [],
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

  it("summarises a report for a person", () => {
    const copied = {
      id: "ses_a",
      status: "copied" as const,
      reason: null,
      relation: "same" as const,
      counts: { compartments: 2, tags: 5, notes: 1, memories_copied: 3, memories_already_there: 1 },
      residual_windows_paths: 0,
    }
    const skipped = (id: string, reason: "no-project" | "stale-anchors") => ({ id, status: "skipped" as const, reason, relation: null, counts: null, residual_windows_paths: 0 })
    expect(syncSummary(report({ sessions: [copied, skipped("b", "no-project"), skipped("c", "no-project"), skipped("d", "stale-anchors")], backup_dir: "/t/b" }))).toEqual([
      "Applied: 1 of 4 sessions copied into /t/context.db",
      "2 summaries · 5 tags · 1 notes · 3 memories copied (1 already there)",
      "Skipped: 2 no project, 1 stale summaries",
      "Original kept in /t/b (undo: opencode-session-manager rollback /t/b --db /t/context.db)",
    ])
    expect(syncSummary(report({ dry_run: true }))).toEqual([
      "Dry run: 0 of 0 sessions copied into /t/context.db",
      "0 summaries · 0 tags · 0 notes · 0 memories copied (0 already there)",
      "Nothing skipped.",
      "The target store was not changed.",
    ])
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

describe("the browser after an apply", () => {
  it("turns the queue into sync requests per direction, only once every conflict is decided", () => {
    const queue = [entry("a", "to-right", "replace"), entry("b", "to-left", "skip", true), entry("c", "to-right", "skip", true)]
    expect(requestsFor(queue, "to-right")).toEqual([
      { id: "a", resolution: "replace" },
      { id: "c", resolution: "skip" },
    ])
    expect(requestsFor(queue, "to-left")).toEqual([{ id: "b", resolution: "skip" }])
    expect(requestsFor([...queue, entry("d", "to-left", null, true)], "to-right")).toBeNull()
  })

  it("shows a notice, then the result: a change clears the queue and shows the sides read again", () => {
    const left = opened("left", [session({ id: "ses_a", directory: "/w", updated: 1 })])
    const right = opened("right", [session({ id: "ses_a", directory: "/w", updated: 1, context: {} })])
    const state = { ...createBrowser(left, right, 5), queue: [entry("ses_a", "to-left", "replace")], view: "queue" as const }
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
    const syncs: SyncInput[] = []
    const events: string[] = []
    const useCase = new ApplyQueueUseCase(
      {
        sync: (input) => {
          syncs.push(input)
          if (fail !== undefined && input.target.contextDb.includes(fail)) throw new Error(`cannot write ${fail}`)
          if (fail === "string") throw "plain failure"
          return report({ target_context_db: input.target.contextDb, dry_run: input.dryRun, backup_dir: input.dryRun ? null : "/backup" })
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

  it("syncs left to right, then right to left, and reads each changed side again", () => {
    const { useCase, syncs, events } = setup()
    const outcome = useCase.apply({ queue: [entry("b", "to-left", "replace"), entry("a", "to-right", "replace")], left, right, dryRun: false })
    expect(syncs.map((input) => [input.source.contextDb, input.target.contextDb, input.sessions])).toEqual([
      ["/data/left/cortexkit/magic-context/context.db", "/data/right/cortexkit/magic-context/context.db", [{ id: "a", resolution: "replace" }]],
      ["/data/right/cortexkit/magic-context/context.db", "/data/left/cortexkit/magic-context/context.db", [{ id: "b", resolution: "replace" }]],
    ])
    expect(events).toEqual(["open right", "close right", "open left", "close left"])
    expect(outcome.changed).toBe(true)
    expect(outcome.left?.catalog.sessions[0]?.id).toBe("new")
    expect(outcome.right?.catalog.sessions[0]?.id).toBe("new")
    expect(outcome.result.length).toBe(8)
  })

  it("only checks on a dry run, and skips a direction with nothing queued", () => {
    const { useCase, syncs, events } = setup()
    const outcome = useCase.apply({ queue: [entry("a", "to-right", "replace")], left, right, dryRun: true })
    expect(syncs.length).toBe(1)
    expect(events).toEqual([])
    expect(outcome).toMatchObject({ changed: false })
    expect(outcome.result[0]).toStartWith("Dry run:")
  })

  it("explains an empty queue, undecided conflicts and a failure, keeping what was applied", () => {
    expect(setup().useCase.apply({ queue: [], left, right, dryRun: false }).result).toEqual(["The queue is empty."])
    expect(setup().useCase.apply({ queue: [entry("a", "to-right", null, true)], left, right, dryRun: false }).result).toEqual([
      "Decide every conflict first: r or s on each, or R or S for all.",
    ])
    const partial = setup("/data/left/").useCase.apply({ queue: [entry("a", "to-right", "replace"), entry("b", "to-left", "replace")], left, right, dryRun: false })
    expect(partial.changed).toBe(true)
    expect(partial.result.at(-1)).toBe("Not applied: cannot write /data/left/")
    expect(setup("string").useCase.apply({ queue: [entry("a", "to-right", "replace")], left, right, dryRun: false }).result).toEqual([
      "Not applied: plain failure",
    ])
  })
})
