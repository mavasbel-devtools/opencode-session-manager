import { describe, expect, it } from "bun:test"
import type { RelocateInput, RelocateReport } from "@session-manager/domain/model/Relocate"
import { RELOCATE_USAGE, RelocateCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/RelocateCliAdapter"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { opened } from "@test/support/sessions/catalogs"

function cli(failed: readonly string[] = []) {
  const output = new FakeOutput()
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
          sessions: [],
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
  })
  return { adapter, output, inputs, events }
}

describe("RelocateCliAdapter", () => {
  it("relocates every session in the mapped folders of the default profile, and prints a summary", () => {
    const { adapter, output, inputs, events } = cli()
    expect(adapter.run(["--map", "/old=/new", "--all", "--dry-run"])).toBe(0)
    expect(inputs).toEqual([
      {
        profile: { opencodeDb: "/data/profile/opencode/opencode.db", contextDb: "/data/profile/cortexkit/magic-context/context.db", readableOpencodeDb: null, readableContextDb: null },
        maps: [{ from: "/old", to: "/new" }],
        sessions: "all",
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
})
