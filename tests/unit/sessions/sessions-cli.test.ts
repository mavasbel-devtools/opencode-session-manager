import { describe, expect, it } from "bun:test"
import type { Profile } from "@session-manager/domain/model/Profile"
import type { ProfileCatalog } from "@session-manager/domain/model/SessionCatalog"
import { SessionsCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/SessionsCliAdapter"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"

function cli(available: boolean) {
  const seen: Profile[] = []
  const output = new FakeOutput()
  const runtime = new FakeRuntime()
  runtime.home = "/home/me"
  const adapter = new SessionsCliAdapter({
    catalog: {
      catalog: (profile): ProfileCatalog => {
        seen.push(profile)
        return {
          profile,
          magicContext: { available, schemaVersion: available ? 94 : null },
          sessions: [
            {
              id: "ses_a",
              generation: "v2",
              projectId: "global",
              parentId: null,
              forkOf: null,
              title: "A title",
              directory: "/home/me/x",
              timeCreated: 0,
              timeUpdated: Date.UTC(2026, 9, 7, 12, 30),
              timeArchived: null,
              entries: 4,
              magicContext: { compartments: 2, tags: 9, lastTag: 9, notes: 0, memoriesOriginated: 1, project: "dir:1" },
            },
            {
              id: "ses_b",
              generation: "v1",
              projectId: "global",
              parentId: null,
              forkOf: null,
              title: null,
              directory: "/home/me/y",
              timeCreated: 0,
              timeUpdated: 0,
              timeArchived: null,
              entries: 1,
              magicContext: null,
            },
          ],
        }
      },
    },
    output,
    runtime,
    environment: {},
  })
  return { adapter, output, seen }
}

describe("SessionsCliAdapter", () => {
  it("prints a profile's sessions as a table, from the default data home", () => {
    const { adapter, output, seen } = cli(true)
    expect(adapter.run([])).toBe(0)
    expect(seen[0]?.dataHome).toBe("/home/me/.local/share")
    expect(output.lines).toEqual([
      "opencode.db: /home/me/.local/share/opencode/opencode.db (2 sessions)",
      "context.db: /home/me/.local/share/cortexkit/magic-context/context.db (Magic Context format 94)",
      "ID\tGEN\tENTRIES\tSUMMARIES\tTAGS\tUPDATED\tDIRECTORY\tTITLE",
      "ses_a\tv2\t4\t2\t9\t2026-10-07 12:30\t/home/me/x\tA title",
      "ses_b\tv1\t1\t-\t-\t1970-01-01 00:00\t/home/me/y\t",
    ])
  })

  it("prints JSON for another data home, and says when Magic Context is absent", () => {
    const { adapter, output, seen } = cli(false)
    expect(adapter.run(["--data", "/mnt/win", "--json"])).toBe(0)
    expect(seen[0]?.opencodeDb).toBe("/mnt/win/opencode/opencode.db")
    expect(JSON.parse(output.text()).magicContext).toEqual({ available: false, schemaVersion: null })
    const plain = cli(false)
    plain.adapter.run([])
    expect(plain.output.lines[1]).toEndWith("(no Magic Context store)")
  })

  it("prints the usage and exits 2 for anything it does not know", () => {
    for (const argv of [["--data"], ["--data", "--json"], ["--bogus"]]) {
      const { adapter, output } = cli(true)
      expect(adapter.run(argv)).toBe(2)
      expect(output.lines).toEqual(["usage: opencode-session-manager sessions [--data <dataHome>] [--json]"])
    }
  })
})
