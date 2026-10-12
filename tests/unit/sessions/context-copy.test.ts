import { describe, expect, it } from "bun:test"
import { CopyMagicContextUseCase } from "@session-manager/application/CopyMagicContextUseCase"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { MagicContextTooNewError } from "@session-manager/domain/errors/MagicContextTooNewError"
import { MagicContextUnavailableError } from "@session-manager/domain/errors/MagicContextUnavailableError"
import { MagicContextUpgradeError } from "@session-manager/domain/errors/MagicContextUpgradeError"
import type { MagicContextRelease, MagicContextUpgradeOutcome } from "@session-manager/domain/model/MagicContextRelease"
import { CONTEXT_USAGE, ContextCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/ContextCliAdapter"
import { REBUILD_GRACE_MS, REBUILD_POLL_MS, REBUILD_TIMEOUT_MINUTES } from "@session-manager/domain/model/Rebuild"
import type { RebuildInput } from "@session-manager/domain/ports/inbound/RebuildContextPort"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { FakeSqlite } from "@test/support/maintenance/fakes/sqlite"
import { opened, session } from "@test/support/sessions/catalogs"
import type { SyncInput } from "@session-manager/domain/model/MagicContextSync"

const RELEASE: MagicContextRelease = { version: "0.45.0", latestFormat: 94, packageDirectory: "/pkg" }

function setup(options: { release?: MagicContextRelease | null; formats: Record<string, number | null>; outcome?: MagicContextUpgradeOutcome }) {
  const files = new FakeFileSystem()
  files.add("/live/context.db")
  const sqlite = new FakeSqlite({ fingerprint: { schema: [], header: { userVersion: 0, applicationId: 0 }, tables: {} } })
  const formats = { ...options.formats }
  const upgrades: string[] = []
  const useCase = new CopyMagicContextUseCase(
    sqlite,
    { summary: () => ({ available: true, schemaVersion: null, sessions: {} }), formatVersion: (path) => formats[path] ?? null },
    {
      installed: () => (options.release === undefined ? RELEASE : options.release),
      searched: () => ["/cache/opencode"],
      upgrade: (_release, path) => {
        upgrades.push(path)
        const outcome = options.outcome ?? { ok: true, format: 94 }
        if (outcome.ok) formats[path] = outcome.format
        return outcome
      },
    },
    files,
  )
  return { useCase, sqlite, upgrades }
}

describe("CopyMagicContextUseCase", () => {
  it("copies an older store and upgrades the copy with the installed release", () => {
    const { useCase, sqlite, upgrades } = setup({ formats: { "/live/context.db": 91 } })
    expect(useCase.copy({ source: "/live/context.db", target: "/w/copy.db" })).toEqual({
      source: "/live/context.db",
      target: "/w/copy.db",
      from_format: 91,
      to_format: 94,
      upgraded: true,
      magic_context_version: "0.45.0",
    })
    expect(sqlite.calls).toEqual(["vacuumInto:/live/context.db->/w/copy.db"])
    expect(upgrades).toEqual(["/w/copy.db"])
  })

  it("copies a current store without running any migration, and upgrades a store with no recorded format", () => {
    const current = setup({ formats: { "/live/context.db": 94, "/w/copy.db": 94 } })
    expect(current.useCase.copy({ source: "/live/context.db", target: "/w/copy.db" }).upgraded).toBe(false)
    expect(current.upgrades).toEqual([])
    const unrecorded = setup({ formats: {} })
    expect(unrecorded.useCase.copy({ source: "/live/context.db", target: "/w/copy.db" })).toMatchObject({ from_format: null, upgraded: true })
  })

  it("refuses a missing source, a missing release, a newer store, a refused upgrade and a wrong result", () => {
    expect(() => setup({ formats: {} }).useCase.copy({ source: "/nope.db", target: "/w/c.db" })).toThrow(DatabaseNotFoundError)
    expect(() => setup({ release: null, formats: {} }).useCase.copy({ source: "/live/context.db", target: "/w/c.db" })).toThrow(
      new MagicContextUnavailableError(["/cache/opencode"]),
    )
    const newer = setup({ formats: { "/live/context.db": 95 } })
    expect(() => newer.useCase.copy({ source: "/live/context.db", target: "/w/c.db" })).toThrow(MagicContextTooNewError)
    expect(newer.sqlite.calls).toEqual([])
    expect(() =>
      setup({ formats: { "/live/context.db": 90 }, outcome: { ok: false, detail: "fenced" } }).useCase.copy({ source: "/live/context.db", target: "/w/c.db" }),
    ).toThrow(new MagicContextUpgradeError("/w/c.db", "fenced"))
    expect(() =>
      setup({ formats: { "/live/context.db": 90 }, outcome: { ok: true, format: 93 } }).useCase.copy({ source: "/live/context.db", target: "/w/c.db" }),
    ).toThrow("the copy reports format 93, expected 94")
  })
})

describe("ContextCliAdapter", () => {
  const cli = () => {
    const output = new FakeOutput()
    const seen: unknown[] = []
    const syncs: SyncInput[] = []
    const events: string[] = []
    const rebuilds: RebuildInput[] = []
    const adapter = new ContextCliAdapter({
      copy: {
        copy: (input) => {
          seen.push(input)
          return { source: input.source, target: input.target, from_format: 1, to_format: 2, upgraded: true, magic_context_version: "x" }
        },
      },
      sync: {
        sync: (input) => {
          syncs.push(input)
          return { source_context_db: "s", target_context_db: "t", format: 94, dry_run: input.dryRun, scope: input.scope, sessions: [], projects: [], user_memories_copied: 0, checks: null, backup_dir: null, stale_locks_cleared: [] }
        },
      },
      profiles: {
        open: (profile) => {
          events.push(`open ${profile.name} ${profile.dataHome}`)
          if (profile.dataHome === "/broken") throw new Error("broken profile")
          return profile.name === "from"
            ? opened("from", [
                session({ id: "ses_a", directory: "/w", updated: 3, context: {} }),
                session({ id: "ses_a", directory: "/w", updated: 2, context: {} }),
                session({ id: "ses_b", directory: "/w", updated: 1 }),
                session({ id: "ses_c", directory: "/w", updated: 1, context: {} }),
              ])
            : opened("to", [session({ id: "ses_a", directory: "/w", updated: 1 }), session({ id: "ses_b", directory: "/w", updated: 1 })], { snapshot: "/snap" })
        },
        close: (profile) => {
          events.push(`close ${profile.catalog.profile.name}`)
        },
      },
      rebuild: {
        rebuild: async (input) => {
          rebuilds.push(input)
          input.onProgress?.({ session_id: input.sessions[0]!, snapshot: { summaries: 1, reach: 9, wrapup: "running", leased: false, staged: 0, runs: [] }, elapsed_ms: 4000 })
          const status = input.sessions.includes("ses_fail") ? ("failed" as const) : ("finished" as const)
          const sessions = input.sessions.map((id) => ({
            session_id: id,
            command: input.command,
            status,
            detail: null,
            summaries_before: 1,
            summaries_after: 2,
            reach_before: 9,
            reach_after: 20,
            runs: 1,
            failed_runs: 0,
            elapsed_ms: 8000,
          }))
          return { server: "http://s", context_db: input.contextDb, command: input.command, sessions, ok: status === "finished" }
        },
      },
      output,
      runtime: { homeDirectory: () => "/home/me" },
      environment: {},
    })
    return { adapter, output, seen, syncs, events, rebuilds }
  }

  it("copies with --from and --to in any order and prints the report", () => {
    const { adapter, output, seen } = cli()
    expect(adapter.run(["copy", "--to", "/b", "--from", "/a"])).toBe(0)
    expect(seen).toEqual([{ source: "/a", target: "/b" }])
    expect(JSON.parse(output.text())).toMatchObject({ from_format: 1, to_format: 2 })
  })

  it("syncs named sessions or --all the source has state for, keeping the target's state unless --replace", () => {
    const named = cli()
    expect(named.adapter.run(["sync", "--from", "/a", "--to", "/b", "--session", "ses_x", "--session", "ses_y", "--dry-run"])).toBe(0)
    expect(named.syncs[0]).toEqual({
      source: { opencodeDb: "/data/from/opencode/opencode.db", contextDb: "/data/from/cortexkit/magic-context/context.db", readableOpencodeDb: null, readableContextDb: null },
      target: {
        opencodeDb: "/data/to/opencode/opencode.db",
        contextDb: "/data/to/cortexkit/magic-context/context.db",
        readableOpencodeDb: "/snap/opencode/opencode.db",
        readableContextDb: "/snap/cortexkit/magic-context/context.db",
      },
      sessions: [
        { id: "ses_x", resolution: "skip" },
        { id: "ses_y", resolution: "skip" },
      ],
      scope: "all",
      dryRun: true,
      strict: false,
    })
    expect(named.events).toEqual(["open from /a", "open to /b", "close from", "close to"])
    expect(JSON.parse(named.output.text())).toMatchObject({ dry_run: true })
    const all = cli()
    expect(all.adapter.run(["sync", "--all", "--replace", "--from", "/a", "--to", "/b"])).toBe(0)
    expect(all.syncs[0]).toMatchObject({ sessions: [{ id: "ses_a", resolution: "replace" }], dryRun: false, strict: false })
    const strict = cli()
    expect(strict.adapter.run(["sync", "--all", "--strict", "--from", "/a", "--to", "/b"])).toBe(0)
    expect(strict.syncs[0]).toMatchObject({ strict: true })
    const further = cli()
    expect(further.adapter.run(["sync", "--all", "--prefer", "further", "--from", "/a", "--to", "/b"])).toBe(0)
    expect(further.syncs[0]).toMatchObject({ sessions: [{ id: "ses_a", resolution: "further" }] })
    const replace = cli()
    expect(replace.adapter.run(["sync", "--session", "ses_a", "--prefer", "replace", "--from", "/a", "--to", "/b"])).toBe(0)
    expect(replace.syncs[0]).toMatchObject({ sessions: [{ id: "ses_a", resolution: "replace" }] })
    const scoped = cli()
    expect(scoped.adapter.run(["sync", "--all", "--context", "sessions", "--from", "/a", "--to", "/b"])).toBe(0)
    expect(scoped.syncs[0]).toMatchObject({ scope: "sessions" })
  })

  it("closes what it opened when a profile fails", () => {
    const { adapter, events } = cli()
    expect(() => adapter.run(["sync", "--from", "/a", "--to", "/broken", "--all"])).toThrow("broken profile")
    expect(events).toEqual(["open from /a", "open to /broken", "close from"])
  })

  it("prints the usage for anything else", () => {
    for (const argv of [
      [],
      ["move"],
      ["copy", "--from", "/a"],
      ["copy", "--from", "--to"],
      ["copy", "--from", "/a", "--bad", "/b"],
      ["copy", "--to"],
      ["sync", "--from", "/a", "--to", "/b"],
      ["sync", "--from", "/a", "--to", "/b", "--all", "--session", "x"],
      ["sync", "--to", "/b", "--all"],
      ["sync", "--from", "/a", "--all"],
      ["sync", "--from", "/a", "--to", "/b", "--all", "--bogus"],
      ["sync", "--from", "/a", "--to", "/b", "--all", "--prefer", "both"],
      ["sync", "--from", "/a", "--to", "/b", "--all", "--context", "none"],
    ]) {
      const { adapter, output } = cli()
      expect(adapter.run(argv)).toBe(2)
      expect(output.lines).toEqual([CONTEXT_USAGE])
    }
  })

  describe("wrapup and recomp", () => {
  it("runs /ctx-wrapup on this machine's profile, waiting and printing progress, then the outcome", async () => {
    const { adapter, output, rebuilds } = cli()
    expect(await adapter.run(["wrapup", "--session", "ses_a", "--keep", "30", "--session", "ses_b"])).toBe(0)
    expect(rebuilds[0]).toMatchObject({
      contextDb: "/home/me/.local/share/cortexkit/magic-context/context.db",
      sessions: ["ses_a", "ses_b"],
      command: "wrapup",
      keep: 30,
      server: null,
      wait: true,
      timeoutMs: REBUILD_TIMEOUT_MINUTES * 60_000,
      pollMs: REBUILD_POLL_MS,
      graceMs: REBUILD_GRACE_MS,
    })
    expect(output.lines).toEqual([
      "ses_a: running · 1 summaries to message 9 · 4 s",
      "/ctx-wrapup through http://s: 2 finished",
      "ses_a: finished · summaries 1 → 2, to message 9 → to message 20 · 1 runs (0 failed) · 8 s",
      "ses_b: finished · summaries 1 → 2, to message 9 → to message 20 · 1 runs (0 failed) · 8 s",
      "OK",
    ])
  })

  it("runs /ctx-recomp on another profile and server without waiting, as JSON, and fails when a session did not finish", async () => {
    const { adapter, output, rebuilds } = cli()
    expect(await adapter.run(["recomp", "--session", "ses_fail", "--data", "/d", "--server", "http://other", "--no-wait", "--timeout", "5", "--json"])).toBe(1)
    expect(rebuilds[0]).toMatchObject({ contextDb: "/d/cortexkit/magic-context/context.db", command: "recomp", keep: null, server: "http://other", wait: false, timeoutMs: 300_000 })
    expect(rebuilds[0]!.onProgress).toBeUndefined()
    expect(JSON.parse(output.text())).toMatchObject({ ok: false, sessions: [{ status: "failed" }] })
  })

  it("prints the usage for a missing session, --keep on recomp, a bad number or an unknown option", async () => {
    for (const argv of [
      ["wrapup"],
      ["recomp", "--session", "s", "--keep", "3"],
      ["wrapup", "--session", "s", "--keep", "x"],
      ["wrapup", "--session", "s", "--timeout", "0"],
      ["wrapup", "--session", "s", "--timeout", "-1"],
      ["wrapup", "--session", "s", "--fast"],
    ]) {
      const { adapter, output, rebuilds } = cli()
      expect(await adapter.run(argv)).toBe(2)
      expect([output.text(), rebuilds.length]).toEqual([CONTEXT_USAGE, 0])
    }
  })
})
})
