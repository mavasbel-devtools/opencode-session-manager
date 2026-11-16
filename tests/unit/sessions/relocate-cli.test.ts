import { describe, expect, it } from "bun:test"
import { InvalidMapRuleError } from "@session-manager/domain/errors/InvalidMapRuleError"
import type { WorktreeLinkOutcome, WorktreeLinkStatus } from "@session-manager/domain/model/GitWorktree"
import type { Relocation } from "@session-manager/domain/model/PathMapping"
import type { RelocatedSession, RelocateInput, RelocateReport } from "@session-manager/domain/model/Relocate"
import type { MapRule } from "@session-manager/domain/model/SessionSync"
import { RELOCATE_USAGE, RelocateCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/RelocateCliAdapter"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { opened } from "@test/support/sessions/catalogs"

interface CliExtras {
  readonly configured?: readonly MapRule[]
  readonly moved?: readonly string[]
  readonly statuses?: Readonly<Record<string, WorktreeLinkStatus>>
  /** The work tree root of a folder, when not the folder itself. */
  readonly roots?: Readonly<Record<string, string>>
}

function movedSession(to: string): RelocatedSession {
  return { id: `ses_${to}`, root: `ses_${to}`, title: null, from_directory: "/old", to_directory: to, from_project: "p", to_project: "q", context_from_project: null, context_to_project: null }
}

function cli(failed: readonly string[] = [], extras: CliExtras = {}) {
  const output = new FakeOutput()
  const ensured: Array<{ directory: string; rules: readonly Relocation[]; dryRun: boolean | undefined }> = []
  const inputs: RelocateInput[] = []
  const events: string[] = []
  const runtime = new FakeRuntime()
  runtime.home = "/home/me"
  const adapter = new RelocateCliAdapter({
    relocate: {
      relocate: (input): RelocateReport => {
        inputs.push(input)
        return {
          opencode_db: input.profile.opencodeDb,
          context_db: null,
          dry_run: input.dryRun,
          rules: input.maps,
          renames: [],
          sessions: (extras.moved ?? []).map(movedSession),
          skipped: [],
          projects_created: [],
          text: { rows: {}, residual: {}, kept: {} },
          context_text: null,
          projects_merged: [],
          checks: { integrity_ok: true, foreign_keys_ok: true, sessions_ok: true, text_ok: failed.length === 0, context: null },
          failed,
          backup_dir: null,
          rollback: null,
          stale_locks_cleared: [],
        }
      },
    },
    profiles: {
      open: (profile) => {
        events.push(`open ${profile.dataHome}`)
        return opened(profile.name, [])
      },
      close: () => {
        events.push("close")
      },
    },
    output,
    runtime,
    environment: { XDG_DATA_HOME: "/xdg" },
    mappings: { mappings: () => extras.configured ?? [] },
    worktrees: {
      ensure: (directory, rules, dryRun): WorktreeLinkOutcome => {
        ensured.push({ directory, rules, dryRun })
        const status = extras.statuses?.[directory] ?? "none"
        return { directory, root: status === "none" ? null : (extras.roots?.[directory] ?? directory), status, command: status === "repaired" || status === "would-repair" ? { cwd: directory, paths: ["/p"] } : null }
      },
    },
  })
  return { adapter, output, inputs, events, ensured }
}

describe("RelocateCliAdapter", () => {
  it("takes --rename rules or --relink alone or with --map, and needs one of them", () => {
    const { adapter, inputs, output } = cli()
    expect(adapter.run(["--rename", "/srv/2026-02-rel=rel", "--all"])).toBe(0)
    expect(adapter.run(["--map", "/old=/new", "--rename", "/srv/a=b", "--rename", "/srv/c=d", "--session", "ses_1"])).toBe(0)
    expect(adapter.run(["--relink", "--all"])).toBe(0)
    expect(inputs.map((input) => [input.maps, input.renames, input.relink])).toEqual([
      [[], [{ from: "/srv/2026-02-rel", to: "rel" }], false],
      [[{ from: "/old", to: "/new" }], [{ from: "/srv/a", to: "b" }, { from: "/srv/c", to: "d" }], false],
      [[], [], true],
    ])
    expect(adapter.run(["--all"])).toBe(2)
    expect(output.lines.at(-1)).toContain("(--map <from>=<to> | --rename <folder>=<name> | --relink | --configured)...")
  })

  it("relocates every session in the mapped folders of the default profile, and prints a summary", () => {
    const { adapter, output, inputs, events } = cli()
    expect(adapter.run(["--map", "/old=/new", "--all", "--dry-run"])).toBe(0)
    expect(inputs).toEqual([
      {
        profile: { opencodeDb: "/data/profile/opencode/opencode.db", contextDb: "/data/profile/cortexkit/magic-context/context.db", readableOpencodeDb: null, readableContextDb: null },
        maps: [{ from: "/old", to: "/new" }],
        renames: [],
        sessions: "all",
        relink: false,
        dryRun: true,
      },
    ])
    expect(events).toEqual(["open /xdg", "close"])
    expect(output.lines).toEqual([
      "Dry run: 0 sessions (0 root sessions with their sub-agent sessions) → /data/profile/opencode/opencode.db",
      "Text: 0 OpenCode rows rewritten",
      "The stores were not changed.",
    ])
  })

  it("relocates named sessions of a given profile, prints the report as JSON, and exits 1 when a check failed", () => {
    const { adapter, output, inputs, events } = cli(["text_ok"])
    expect(adapter.run(["--data", "/p", "--map", "/old=/new", "--session", "ses_a", "--session", "ses_b", "--json"])).toBe(1)
    expect(inputs[0]).toMatchObject({ sessions: ["ses_a", "ses_b"], dryRun: false })
    expect(events[0]).toBe("open /p")
    expect(JSON.parse(output.lines.join("\n")).failed).toEqual(["text_ok"])
  })

  it("prints the usage for missing rules, both or neither of --all and --session, and unknown options", () => {
    for (const argv of [["--all"], ["--map", "/a=/b"], ["--map", "/a=/b", "--all", "--session", "s"], ["--map", "/a=/b", "--all", "--bogus"]]) {
      const { adapter, output, inputs } = cli()
      expect(adapter.run(argv)).toBe(2)
      expect([output.lines, inputs]).toEqual([[RELOCATE_USAGE], []])
    }
  })

  it("adds the plugin's configured location_repair mappings with --configured, counting a repeated rule once", () => {
    const { adapter, inputs } = cli([], { configured: [{ from: "/old", to: "/new" }] })
    expect(adapter.run(["--configured", "--all"])).toBe(0)
    expect(adapter.run(["--configured", "--map", "/old/=/new/", "--map", "/srv/a=/srv/b", "--all"])).toBe(0)
    expect(adapter.run(["--map", "/srv/a=/srv/b", "--all"])).toBe(0)
    expect(inputs.map((input) => input.maps)).toEqual([
      [{ from: "/old", to: "/new" }],
      [
        { from: "/old", to: "/new" },
        { from: "/srv/a", to: "/srv/b" },
      ],
      [{ from: "/srv/a", to: "/srv/b" }],
    ])
  })

  it("refuses a --map that overlaps a different configured mapping before touching any profile", () => {
    for (const map of ["/old=/other", "/old/sub=/new/sub", "/=/x"]) {
      const { adapter, events } = cli([], { configured: [{ from: "/old", to: "/new" }] })
      expect(() => adapter.run(["--configured", "--map", map, "--all"])).toThrow(InvalidMapRuleError)
      expect(events).toEqual([])
    }
  })

  it("repairs the Git links of each moved-to folder once with --repair-worktrees, reporting only what changed or disagrees", () => {
    const { adapter, output, ensured } = cli([], { moved: ["/new/a", "/new/a", "/new/b", "/new/c"], statuses: { "/new/a": "repaired", "/new/b": "healthy", "/new/c": "unproven" } })
    expect(adapter.run(["--map", "/old=/new", "--all", "--repair-worktrees"])).toBe(0)
    expect(ensured).toEqual([
      { directory: "/new/a", rules: [{ from: "/old", to: "/new" }], dryRun: false },
      { directory: "/new/b", rules: [{ from: "/old", to: "/new" }], dryRun: false },
      { directory: "/new/c", rules: [{ from: "/old", to: "/new" }], dryRun: false },
    ])
    expect(output.lines.slice(-2)).toEqual(["Work tree /new/a: repaired (git -C /new/a worktree repair /p)", "Work tree /new/c: unproven"])
  })

  it("plans worktree repairs in a dry run, reports them in JSON, and exits 1 when Git cannot resolve one", () => {
    const dry = cli([], { moved: ["/new/a", "/new/a/sub"], statuses: { "/new/a": "would-repair", "/new/a/sub": "would-repair" }, roots: { "/new/a/sub": "/new/a" } })
    expect(dry.adapter.run(["--map", "/old=/new", "--all", "--repair-worktrees", "--dry-run", "--json"])).toBe(0)
    expect(dry.ensured.map((call) => [call.directory, call.dryRun])).toEqual([
      ["/new/a", true],
      ["/new/a/sub", true],
    ])
    expect(JSON.parse(dry.output.lines.join("\n")).worktrees).toEqual([{ directory: "/new/a", root: "/new/a", status: "would-repair", command: { cwd: "/new/a", paths: ["/p"] } }])
    const broken = cli([], { moved: ["/new/a"], statuses: { "/new/a": "unresolved" } })
    expect(broken.adapter.run(["--map", "/old=/new", "--all", "--repair-worktrees"])).toBe(1)
    expect(broken.output.lines.at(-1)).toBe("Work tree /new/a: unresolved")
  })

  it("does not touch Git when the relocation failed its checks, or without --repair-worktrees", () => {
    const failed = cli(["text_ok"], { moved: ["/new/a"] })
    expect(failed.adapter.run(["--map", "/old=/new", "--all", "--repair-worktrees"])).toBe(1)
    const plain = cli([], { moved: ["/new/a"] })
    expect(plain.adapter.run(["--map", "/old=/new", "--all"])).toBe(0)
    expect([failed.ensured, plain.ensured]).toEqual([[], []])
  })
})
