import { describe, expect, it } from "bun:test"
import { EffectUseCase } from "@session-manager/application/patches/EffectUseCase"
import { InspectUseCase } from "@session-manager/application/patches/InspectUseCase"
import { LAST_NOTIFICATION, NotifyUseCase, TITLE } from "@session-manager/application/patches/NotifyUseCase"
import type { CheckReport } from "@session-manager/domain/model/patches/Reports"
import { copy, FakeKeyValue, FakeNotifier, FakeService, FakeText, ORIGINAL_A, PATCHED_B, sha, smallPatch } from "@test/support/patches/fakes"
import { world } from "@test/support/patches/world"

describe("InspectUseCase", () => {
  it("finds the replaced text in a new version's scripts, against the newest checked release", async () => {
    const w = world()
    w.installations.copies = [copy("2.0.0", "2.0.0", "/new"), copy("2.0.0", "latest", "/new-latest")]
    w.files.contents.set("/new/dist/a.js", new TextEncoder().encode(ORIGINAL_A))
    w.files.contents.set("/new/dist/renamed-b.js", new TextEncoder().encode(PATCHED_B))
    w.files.contents.set("/new/dist/other.js", new TextEncoder().encode("nothing here"))
    w.files.contents.set("/new/dist/notes.txt", new TextEncoder().encode("min(20).max(90"))
    const inspect = new InspectUseCase(w.catalog, w.files, w.hash, [smallPatch])
    const report = await inspect.inspect("2.0.0")
    expect(report.roots).toEqual(["/new", "/new-latest"])
    expect(report.findings).toEqual([
      {
        patch: "small",
        checkedVersion: "1.0.0",
        find: "min(20).max(90",
        files: [
          {
            path: "dist/a.js",
            count: 2,
            expected: 2,
            replaced: 0,
            sha: sha(ORIGINAL_A),
            sameAsChecked: true,
            snippets: ["a: min(20).max(90) b: min(20).max(90) ", "a: min(20).max(90) b: min(20).max(90) "],
          },
          {
            path: "dist/renamed-b.js",
            count: 0,
            expected: null,
            replaced: 1,
            sha: sha(PATCHED_B),
            sameAsChecked: false,
            snippets: ["only min(1).max(90) here "],
          },
        ],
      },
    ])
  })

  it("refuses a version that is not installed", async () => {
    const w = world()
    await expect(new InspectUseCase(w.catalog, w.files, w.hash, [smallPatch]).inspect("5.0.0")).rejects.toThrow(
      "Magic Context 5.0.0 is not installed",
    )
  })
})

describe("EffectUseCase", () => {
  const log = '[2026-10-12T02:00:00.000Z] [magic-context][s] compartment trigger: not firing at 5.0% — below proactive floor (11%)'

  it("reads the log since the server started and compares with the configured value", async () => {
    const effect = new EffectUseCase(new FakeText(log, "/tmp/mc.log"), new FakeService(Date.parse("2026-10-12T01:00:00Z")), new FakeText('{"execute_threshold_percentage": 13}'))
    const report = await effect.effect(null)
    expect([report.log, report.since, report.configured, report.summary.effectiveThreshold, report.verdict]).toEqual([
      "/tmp/mc.log",
      Date.parse("2026-10-12T01:00:00Z"),
      13,
      13,
      "respected",
    ])
  })

  it("uses the given time, and copes with no log, no server and no configuration", async () => {
    const effect = new EffectUseCase(new FakeText(null), new FakeService(null), new FakeText(null))
    const report = await effect.effect(5)
    expect([report.since, report.configured, report.summary.linesRead, report.verdict]).toEqual([5, null, 0, "no-data"])
  })
})

describe("NotifyUseCase", () => {
  const failing = (state: string): CheckReport => ({
    ok: false,
    loadedSpec: "1.0.0",
    reason: null,
    problems: [{ patch: "small", version: "1.0.0", root: "/r", state: state as "not-applied" }],
  })

  it("announces a problem once, again when it changes, and forgets it once fixed", async () => {
    let report: CheckReport = failing("not-applied")
    const notifier = new FakeNotifier()
    const store = new FakeKeyValue()
    const notify = new NotifyUseCase({ check: async () => report }, notifier, store)
    expect(await notify.notify()).toEqual({
      ok: false,
      notified: true,
      message: "small on 1.0.0: not-applied. Run `opencode-session-manager patches status`.",
    })
    expect((await notify.notify()).notified).toBe(false)
    report = failing("unchecked-version")
    expect((await notify.notify()).notified).toBe(true)
    report = { ok: true, loadedSpec: "1.0.0", reason: null, problems: [] }
    expect(await notify.notify()).toEqual({ ok: true, notified: false, message: null })
    expect(store.values.has(LAST_NOTIFICATION)).toBe(false)
    report = { ok: false, loadedSpec: null, reason: "not configured", problems: [] }
    await notify.notify()
    expect(notifier.sent.map((n) => [n.title, n.body])).toEqual([
      [TITLE, "small on 1.0.0: not-applied. Run `opencode-session-manager patches status`."],
      [TITLE, "small on 1.0.0: unchecked-version. Run `opencode-session-manager patches status`."],
      [TITLE, "not configured. Run `opencode-session-manager patches status`."],
    ])
  })
})
