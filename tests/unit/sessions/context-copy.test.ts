import { describe, expect, it } from "bun:test"
import { CopyMagicContextUseCase } from "@session-manager/application/CopyMagicContextUseCase"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { MagicContextTooNewError } from "@session-manager/domain/errors/MagicContextTooNewError"
import { MagicContextUnavailableError } from "@session-manager/domain/errors/MagicContextUnavailableError"
import { MagicContextUpgradeError } from "@session-manager/domain/errors/MagicContextUpgradeError"
import type { MagicContextRelease, MagicContextUpgradeOutcome } from "@session-manager/domain/model/MagicContextRelease"
import { ContextCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/ContextCliAdapter"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { FakeSqlite } from "@test/support/maintenance/fakes/sqlite"

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
    const adapter = new ContextCliAdapter({
      copy: {
        copy: (input) => {
          seen.push(input)
          return { source: input.source, target: input.target, from_format: 1, to_format: 2, upgraded: true, magic_context_version: "x" }
        },
      },
      output,
    })
    return { adapter, output, seen }
  }

  it("copies with --from and --to in any order and prints the report", () => {
    const { adapter, output, seen } = cli()
    expect(adapter.run(["copy", "--to", "/b", "--from", "/a"])).toBe(0)
    expect(seen).toEqual([{ source: "/a", target: "/b" }])
    expect(JSON.parse(output.text())).toMatchObject({ from_format: 1, to_format: 2 })
  })

  it("prints the usage for anything else", () => {
    for (const argv of [[], ["move"], ["copy", "--from", "/a"], ["copy", "--from", "--to"], ["copy", "--from", "/a", "--bad", "/b"], ["copy", "--to"]]) {
      const { adapter, output } = cli()
      expect(adapter.run(argv)).toBe(2)
      expect(output.lines).toEqual(["usage: opencode-session-manager context copy --from <context.db> --to <file>"])
    }
  })
})
