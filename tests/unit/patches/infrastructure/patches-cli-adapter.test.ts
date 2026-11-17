import { describe, expect, it } from "bun:test"
import { PatchError } from "@session-manager/domain/errors/PatchError"
import type { ActionReport, EffectReport, FollowOutcome, FollowReport, PatchFilter, StatusReport } from "@session-manager/domain/model/patches/Reports"
import type { PatchCommands } from "@session-manager/domain/model/patches/PatchCommands"
import { PatchesCliAdapter, PATCHES_HELP } from "@session-manager/infrastructure/adapters/inbound/cli/PatchesCliAdapter"
import { copy } from "@test/support/patches/fakes"
import { capture } from "@test/support/patches/sandbox"

const installation = { ...copy("0.47.0", "0.47.0", "/root"), loaded: true }
const status: StatusReport = {
  loadedSpec: "0.47.0",
  installations: [installation, { ...copy("0.40.0", "0.40.0", "/old"), loaded: false }, { ...copy("2.0.0", "/i/2.0.0", "/i/2.0.0"), loaded: false }],
  patches: [
    { patch: "p", installation, state: "applied", checked: "auto", files: [{ path: "dist/a.js", state: "patched", sha: "f".repeat(64) }] },
    { patch: "p", installation: { ...installation, loaded: false, version: "0.40.0" }, state: "unchecked-version", checked: null, files: [] },
  ],
}
const action = (outcome: "applied" | "refused", reason: string | null = null): ActionReport => ({
  results: [{ patch: "p", installation, outcome, reason, files: [{ path: "dist/a.js", from: "a".repeat(64), to: null }] }],
  auditLog: "/state/audit.log",
})
const effect = (verdict: EffectReport["verdict"], lastRejection: string | null = null): EffectReport => ({
  log: "/tmp/mc.log",
  since: verdict === "no-data" ? null : 0,
  configured: verdict === "no-data" ? null : 13,
  summary: { linesRead: 2, rejections: lastRejection === null ? 0 : 1, lastRejection, floors: verdict === "no-data" ? {} : { "11": 2 }, effectiveThreshold: verdict === "no-data" ? null : 13 },
  verdict,
})

const follow = (outcome: FollowOutcome, to: string | null = "/i/2.0.0"): FollowReport => ({
  outcome,
  version: outcome === "busy" ? null : "2.0.0",
  from: "@cortexkit/opencode-magic-context@1.0.0",
  to,
  steps: [
    { step: "detect", ok: true, detail: "npm latest is 2.0.0", ms: 1234 },
    { step: "prove", ok: outcome !== "stopped", detail: "isolated server", ms: 56 },
  ],
  evidence: outcome === "adopted" ? "/state/evidence/x.md" : null,
  auditLog: "/state/audit.log",
})

function cli(overrides: Partial<Record<keyof PatchCommands, unknown>> = {}) {
  const calls: Array<[string, unknown]> = []
  const commands = {
    status: { status: async () => status },
    apply: { apply: async (filter: PatchFilter) => (calls.push(["apply", filter]), action("applied")) },
    undo: { undo: async (filter: PatchFilter) => (calls.push(["undo", filter]), action("refused", "file changed")) },
    check: { check: async () => ({ ok: true, loadedSpec: "0.47.0", reason: null, problems: [] }) },
    inspect: {
      inspect: async (version: string) => ({
        version,
        roots: ["/r"],
        findings: [
          {
            patch: "p",
            checkedVersion: "0.47.0",
            find: "min(20)",
            files: [
              { path: "dist/a.js", count: 3, expected: 3, replaced: 0, sha: "a".repeat(64), sameAsChecked: true, snippets: ["x min(20) y"] },
              { path: "dist/b.js", count: 1, expected: null, replaced: 0, sha: "b".repeat(64), sameAsChecked: false, snippets: [] },
            ],
          },
          { patch: "q", checkedVersion: "0.47.0", find: "zzz", files: [] },
        ],
      }),
    },
    effect: { effect: async (since: number | null) => (calls.push(["effect", since]), effect("respected")) },
    notify: { notify: async () => ({ ok: true, notified: false, message: null }) },
    follow: { follow: async (version: string | null) => (calls.push(["follow", version]), follow("adopted")) },
    rollback: { rollback: async () => (calls.push(["rollback", null]), follow("rolled-back", "@cortexkit/opencode-magic-context@1.0.0")) },
    ...overrides,
  } as PatchCommands
  const io = capture()
  return { io, calls, run: (...argv: string[]) => new PatchesCliAdapter(commands, io.output, "9.9.9").run(argv) }
}

describe("PatchesCliAdapter", () => {
  it("prints help and the version", async () => {
    const c = cli()
    expect([await c.run(), await c.run("--help"), await c.run("-h"), await c.run("--version")]).toEqual([2, 0, 0, 0])
    expect(c.io.out).toEqual([PATCHES_HELP, PATCHES_HELP, PATCHES_HELP, "opencode-session-manager 9.9.9"])
  })

  it("rejects unknown commands and arguments as usage errors", async () => {
    const c = cli()
    expect([await c.run("nope"), await c.run("status", "--bogus"), await c.run("apply", "--patch"), await c.run("inspect")]).toEqual([2, 2, 2, 2])
    expect(c.io.err).toEqual([
      "usage error: unknown command nope",
      "run with --help for usage",
      "usage error: unexpected argument --bogus",
      "run with --help for usage",
      "usage error: unexpected argument --patch",
      "run with --help for usage",
      "usage error: inspect needs --version <v>",
      "run with --help for usage",
    ])
    expect(await c.run("effect", "--since", "yesterday-ish")).toBe(2)
  })

  it("prints status as text or JSON", async () => {
    const c = cli()
    expect(await c.run("status")).toBe(0)
    expect(c.io.out[0]).toBe(
      [
        "OpenCode loads Magic Context: 0.47.0",
        "installed copies:",
        "  0.47.0     spec 0.47.0     LOADED  /root",
        "  0.40.0     spec 0.40.0             /old",
        "  2.0.0      spec (folder)           /i/2.0.0",
        "patches:",
        "  p on 0.47.0 (loaded): applied (auto-checked by follow)",
        "      dist/a.js  patched  ffffffffffffffff",
        "  p on 0.40.0: unchecked-version",
      ].join("\n"),
    )
    expect(await c.run("status", "--json")).toBe(0)
    expect(JSON.parse(c.io.out[1]!)).toEqual(JSON.parse(JSON.stringify(status)))
    const empty = cli({ status: { status: async () => ({ loadedSpec: null, installations: [], patches: [] }) } })
    await empty.run("status")
    expect(empty.io.out[0]).toBe("OpenCode loads Magic Context: (not configured in opencode.jsonc)\ninstalled copies:\n  (none)\npatches:")
  })

  it("passes filters to apply and undo, and exits 1 on a refusal", async () => {
    const c = cli()
    expect(await c.run("apply", "--patch", "p", "--version", "0.47.0")).toBe(0)
    expect(await c.run("undo")).toBe(1)
    expect(c.calls).toEqual([
      ["apply", { patch: "p", version: "0.47.0" }],
      ["undo", {}],
    ])
    expect(c.io.out).toEqual([
      "p on 0.47.0 (/root): applied\n    dist/a.js  aaaaaaaaaaaaaaaa → -\naudit log: /state/audit.log",
      "p on 0.47.0 (/root): refused — file changed\n    dist/a.js  aaaaaaaaaaaaaaaa → -\naudit log: /state/audit.log",
    ])
    const failed = cli({ apply: { apply: async () => ({ ...action("applied"), results: [{ ...action("applied").results[0]!, outcome: "failed" }] }) } })
    expect(await failed.run("apply", "--json")).toBe(1)
  })

  it("prints check results and exits by them", async () => {
    const c = cli()
    expect(await c.run("check")).toBe(0)
    const failing = cli({
      check: {
        check: async () => ({ ok: false, loadedSpec: "0.47.0", reason: null, problems: [{ patch: "p", version: "0.47.0", root: "/r", state: "not-applied" }] }),
      },
    })
    expect(await failing.run("check")).toBe(1)
    const reasoned = cli({ check: { check: async () => ({ ok: false, loadedSpec: null, reason: "not configured", problems: [] }) } })
    await reasoned.run("check")
    expect([c.io.out[0], failing.io.out[0], reasoned.io.out[0]]).toEqual([
      "OK: every patch is applied on the loaded Magic Context (0.47.0)",
      "NOT OK\n  p on 0.47.0: not-applied (/r)",
      "NOT OK: not configured",
    ])
  })

  it("prints inspect findings", async () => {
    const c = cli()
    expect(await c.run("inspect", "--version", "0.48.0")).toBe(0)
    expect(c.io.out[0]).toBe(
      [
        "Magic Context 0.48.0: /r",
        'p (checked against 0.47.0): "min(20)"',
        "    dist/a.js: 3 to replace (3 expected), 0 already replaced, sha256 aaaaaaaaaaaaaaaa (same file as the checked version)",
        "        … x min(20) y …",
        "    dist/b.js: 1 to replace (a path the checked version does not change), 0 already replaced, sha256 bbbbbbbbbbbbbbbb (differs from the checked version)",
        'q (checked against 0.47.0): "zzz"',
        "    not found in any dist/**/*.js file",
      ].join("\n"),
    )
  })

  it("prints the effect and exits 0 only when the threshold is respected", async () => {
    const c = cli()
    expect(await c.run("effect", "--since", "2026-10-12T00:00:00Z")).toBe(0)
    expect(c.calls).toEqual([["effect", Date.parse("2026-10-12T00:00:00Z")]])
    expect(c.io.out[0]).toBe(
      [
        "log: /tmp/mc.log",
        "since: 1970-01-01T00:00:00.000Z (2 lines)",
        "configured execute_threshold_percentage: 13",
        "rejections of execute_threshold_percentage: 0",
        "proactive floors logged: 11% ×2",
        "threshold in use: 13%",
        "verdict: respected",
      ].join("\n"),
    )
    const none = cli({ effect: { effect: async () => effect("no-data", "[t] rejected") } })
    expect(await none.run("effect")).toBe(1)
    expect(none.io.out[0]).toBe(
      [
        "log: /tmp/mc.log",
        "since: (all lines) (2 lines)",
        "configured execute_threshold_percentage: (not set)",
        "rejections of execute_threshold_percentage: 1",
        "  last: [t] rejected",
        "proactive floors logged: (none yet)",
        "threshold in use: (unknown yet)",
        "verdict: no-data",
      ].join("\n"),
    )
  })

  it("runs follow and follow --rollback, prints every step, and exits by the outcome", async () => {
    const c = cli()
    expect([await c.run("follow"), await c.run("follow", "--version", "2.0.0"), await c.run("follow", "--rollback", "--json")]).toEqual([0, 0, 0])
    expect(c.calls).toEqual([["follow", null], ["follow", "2.0.0"], ["rollback", null]])
    expect(c.io.out[0]).toBe(
      [
        "follow: adopted (2.0.0)",
        "  ok     detect     1.2 s  npm latest is 2.0.0",
        "  ok     prove      0.1 s  isolated server",
        "opencode.jsonc entry: @cortexkit/opencode-magic-context@1.0.0 → /i/2.0.0",
        "evidence: /state/evidence/x.md",
        "audit log: /state/audit.log",
      ].join("\n"),
    )
    expect(JSON.parse(c.io.out[2]!).outcome).toBe("rolled-back")
    for (const [outcome, code] of [["up-to-date", 0], ["stopped", 1], ["busy", 1]] as const) {
      const other = cli({ follow: { follow: async () => follow(outcome, "@cortexkit/opencode-magic-context@1.0.0") } })
      expect(await other.run("follow")).toBe(code)
      if (outcome === "stopped") expect(other.io.out[0]).toContain("  FAILED prove      0.1 s  isolated server\nopencode.jsonc entry: @cortexkit/opencode-magic-context@1.0.0 (unchanged)")
      if (outcome === "busy") expect(other.io.out[0]!.split("\n")[0]).toBe("follow: busy")
    }
    expect([await c.run("follow", "--rollback", "--version", "1"), await c.run("status", "--rollback")]).toEqual([2, 2])
    expect(c.io.err).toEqual([
      "usage error: follow takes --rollback or --version, not both",
      "run with --help for usage",
      "usage error: unexpected argument --rollback",
      "run with --help for usage",
    ])
  })

  it("prints notify results and exits by them", async () => {
    const c = cli()
    const sent = cli({ notify: { notify: async () => ({ ok: false, notified: true, message: "m" }) } })
    const quiet = cli({ notify: { notify: async () => ({ ok: false, notified: false, message: "m" }) } })
    expect([await c.run("notify"), await sent.run("notify"), await quiet.run("notify")]).toEqual([0, 1, 1])
    expect([c.io.out[0], sent.io.out[0], quiet.io.out[0]]).toEqual(["OK: nothing to notify", "notified: m", "already notified: m"])
  })

  it("reports a refusal from a use case as an error, and lets other failures through", async () => {
    const refused = cli({ status: { status: async () => Promise.reject(new PatchError("not-installed", "Magic Context 1 is not installed")) } })
    expect(await refused.run("status")).toBe(1)
    expect(refused.io.err).toEqual(["error: Magic Context 1 is not installed"])
    const broken = cli({ status: { status: async () => Promise.reject(new Error("disk on fire")) } })
    await expect(broken.run("status")).rejects.toThrow("disk on fire")
  })
})
