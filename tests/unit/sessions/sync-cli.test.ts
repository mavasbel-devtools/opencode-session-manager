import { describe, expect, it } from "bun:test"
import type { SessionSyncInput, SessionSyncReport } from "@session-manager/domain/model/SessionSync"
import { SYNC_USAGE, SyncCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/SyncCliAdapter"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { opened } from "@test/support/sessions/catalogs"

function cli() {
  const output = new FakeOutput()
  const syncs: SessionSyncInput[] = []
  const events: string[] = []
  const adapter = new SyncCliAdapter({
    sync: {
      sync: (input): SessionSyncReport => {
        syncs.push(input)
        return {
          source_opencode_db: input.source.opencodeDb,
          target_opencode_db: input.target.opencodeDb,
          source_context_db: null,
          target_context_db: null,
          dry_run: input.dryRun,
          context: input.context,
          sessions: [],
          projects: [],
          user_memories_copied: 0,
          checks: { integrity_ok: true, foreign_keys_ok: true, sessions_ok: true, context: null },
          backup_dir: null,
          rollback: null,
          stale_locks_cleared: [],
        }
      },
    },
    profiles: {
      open: (profile) => {
        events.push(`open ${profile.name} ${profile.dataHome}`)
        if (profile.dataHome === "/broken") throw new Error("broken profile")
        return opened(profile.name, [], profile.name === "to" ? { snapshot: "/snap" } : {})
      },
      close: (profile) => {
        events.push(`close ${profile.catalog.profile.name}`)
      },
    },
    output,
  })
  return { adapter, output, syncs, events }
}

describe("SyncCliAdapter", () => {
  it("syncs every session, with rules, preferring the further Magic Context state by default", () => {
    const { adapter, output, syncs, events } = cli()
    expect(adapter.run(["--from", "/a", "--to", "/b", "--all", "--map", "C:\\Users\\Me=/home/me", "--map", "/x=/y", "--dry-run"])).toBe(0)
    expect(syncs[0]).toEqual({
      source: { opencodeDb: "/data/from/opencode/opencode.db", contextDb: "/data/from/cortexkit/magic-context/context.db", readableOpencodeDb: null, readableContextDb: null },
      target: {
        opencodeDb: "/data/to/opencode/opencode.db",
        contextDb: "/data/to/cortexkit/magic-context/context.db",
        readableOpencodeDb: "/snap/opencode/opencode.db",
        readableContextDb: "/snap/cortexkit/magic-context/context.db",
      },
      sessions: "all",
      maps: [
        { from: "C:\\Users\\Me", to: "/home/me" },
        { from: "/x", to: "/y" },
      ],
      prefer: "further",
      context: "all",
      dryRun: true,
      strict: false,
    })
    expect(events).toEqual(["open from /a", "open to /b", "close from", "close to"])
    expect(JSON.parse(output.text())).toMatchObject({ dry_run: true })
  })

  it("syncs named sessions with the chosen preference", () => {
    const { adapter, syncs } = cli()
    expect(adapter.run(["--session", "ses_a", "--session", "ses_b", "--prefer", "keep", "--context", "sessions", "--from", "/a", "--to", "/b"])).toBe(0)
    expect(syncs[0]).toMatchObject({ sessions: ["ses_a", "ses_b"], prefer: "keep", context: "sessions", maps: [], dryRun: false })
    const strict = cli()
    expect(strict.adapter.run(["--all", "--from", "/a", "--to", "/b", "--strict"])).toBe(0)
    expect(strict.syncs[0]).toMatchObject({ strict: true, dryRun: false })
  })

  it("closes what it opened when a profile fails, and refuses a bad rule", () => {
    const failing = cli()
    expect(() => failing.adapter.run(["--from", "/a", "--to", "/broken", "--all"])).toThrow("broken profile")
    expect(failing.events).toEqual(["open from /a", "open to /broken", "close from"])
    expect(() => cli().adapter.run(["--from", "/a", "--to", "/b", "--all", "--map", "nonsense"])).toThrow("--map nonsense: expected <from>=<to>")
  })

  it("prints the usage for anything else", () => {
    for (const argv of [
      [],
      ["--from", "/a", "--to", "/b"],
      ["--from", "/a", "--to", "/b", "--all", "--session", "x"],
      ["--to", "/b", "--all"],
      ["--from", "/a", "--all"],
      ["--from", "/a", "--to", "/b", "--all", "--prefer", "both"],
      ["--from", "/a", "--to", "/b", "--all", "--context", "none"],
      ["--from", "/a", "--to", "/b", "--all", "--bogus"],
    ]) {
      const { adapter, output } = cli()
      expect(adapter.run(argv)).toBe(2)
      expect(output.lines).toEqual([SYNC_USAGE])
    }
  })
})
