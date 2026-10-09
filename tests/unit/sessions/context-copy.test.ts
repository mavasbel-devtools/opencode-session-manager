import { describe, expect, it } from "bun:test"
import { CopyMagicContextUseCase } from "@session-manager/application/CopyMagicContextUseCase"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { MagicContextTooNewError } from "@session-manager/domain/errors/MagicContextTooNewError"
import { MagicContextUnavailableError } from "@session-manager/domain/errors/MagicContextUnavailableError"
import { MagicContextUpgradeError } from "@session-manager/domain/errors/MagicContextUpgradeError"
import type { MagicContextRelease, MagicContextUpgradeOutcome } from "@session-manager/domain/model/MagicContextRelease"
import { CONTEXT_USAGE, ContextCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/ContextCliAdapter"
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
          return { source_context_db: "s", target_context_db: "t", format: 94, dry_run: input.dryRun, sessions: [], checks: null, backup_dir: null }
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
      output,
    })
    return { adapter, output, seen, syncs, events }
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
      dryRun: true,
    })
    expect(named.events).toEqual(["open from /a", "open to /b", "close from", "close to"])
    expect(JSON.parse(named.output.text())).toMatchObject({ dry_run: true })
    const all = cli()
    expect(all.adapter.run(["sync", "--all", "--replace", "--from", "/a", "--to", "/b"])).toBe(0)
    expect(all.syncs[0]).toMatchObject({ sessions: [{ id: "ses_a", resolution: "replace" }], dryRun: false })
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
    ]) {
      const { adapter, output } = cli()
      expect(adapter.run(argv)).toBe(2)
      expect(output.lines).toEqual([CONTEXT_USAGE])
    }
  })
})
