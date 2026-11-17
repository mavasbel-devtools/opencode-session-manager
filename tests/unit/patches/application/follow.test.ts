import { describe, expect, it } from "bun:test"
import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"
import { stepLog } from "@session-manager/domain/model/patches/StepLog"
import {
  FOLLOW_TITLE,
  LAST_FOLLOW_NOTIFICATION,
  loadsEntry,
  loadsFrom,
  packageRoot,
  PREVIOUS_ENTRY,
} from "@session-manager/domain/services/patches/FollowRules"
import { encode, FakeClock, sha } from "@test/support/patches/fakes"
import {
  CONFIG,
  configText,
  followPatch,
  followWorld,
  INSTALLS,
  NPM_ENTRY,
  published,
  RELEASE_FILES,
  reviewedPatch,
  rootOf,
} from "@test/support/patches/follow-fakes"

const steps = (report: { steps: readonly { step: string; ok: boolean }[] }) => report.steps.map((s) => `${s.step}:${s.ok ? "ok" : "failed"}`)
const failure = (report: { steps: readonly { ok: boolean; detail: string }[] }) => report.steps.find((s) => !s.ok)?.detail
const ROOT = rootOf("2.0.0")
const STAMP = "[2026-10-11T12:00:01.000Z]"

describe("stepLog", () => {
  it("records each step with the time since the previous one, and the first failure", () => {
    const clock = new FakeClock(1000)
    const log = stepLog(clock)
    expect(log.failure()).toBeNull()
    clock.at = 1500
    expect(log.pass("detect", "a")).toBe(true)
    clock.at = 1600
    expect(log.fail("stage", "b")).toBe(false)
    log.fail("locate", "c")
    expect(log.steps()).toEqual([
      { step: "detect", ok: true, detail: "a", ms: 500 },
      { step: "stage", ok: false, detail: "b", ms: 100 },
      { step: "locate", ok: false, detail: "c", ms: 0 },
    ])
    expect(log.failure()).toBe("stage: b")
  })

  it("matches sources to folders and entries", () => {
    expect([loadsFrom("/a/b/index.js", "/a/b"), loadsFrom("/a/b", "/a/b"), loadsFrom("/a/bc/index.js", "/a/b"), loadsFrom("/a/bc", "/a/b"), loadsFrom(null, "/a")]).toEqual([
      true,
      true,
      false,
      false,
      false,
    ])
    expect([loadsEntry("/x/index.js", "/x"), loadsEntry(NPM_ENTRY, NPM_ENTRY), loadsEntry("/x/index.js", NPM_ENTRY)]).toEqual([true, true, false])
    expect(packageRoot("/i/1.0.0")).toBe("/i/1.0.0/node_modules/@cortexkit/opencode-magic-context")
  })
})

describe("follow: adopting a release", () => {
  it("stages, locates, patches, proves, switches the entry, confirms and records", async () => {
    const w = followWorld({ log: `${STAMP} [magic-context] v2 setup\n[t] unstamped` })
    w.managed.seed("0.9.0")
    w.managed.seed("1.5.0")
    const report = await w.follow.follow(null)
    expect(steps(report)).toEqual(["detect:ok", "stage:ok", "locate:ok", "patch:ok", "prove:ok", "publish:ok", "confirm:ok", "record:ok"])
    expect([report.outcome, report.version, report.from, report.to]).toEqual(["adopted", "2.0.0", NPM_ENTRY, ROOT])
    expect(w.entryNow()).toBe(ROOT)
    expect(w.files.text(CONFIG)).toBe(configText(ROOT))
    expect(w.text(`${ROOT}/dist/a.js`)).toBe("const site = 1; NEW;\n")
    expect(w.text(`${ROOT}/dist/v2/b.js`)).toBe("const site = 2; NEW;\n")
    expect(w.text(`${ROOT}/dist/c.js`)).toBe("nothing here\n")
    expect(w.sandbox.calls).toEqual([{ root: ROOT, config: '{ "execute_threshold_percentage": 13 }' }])
    expect(w.derived.releases).toEqual([
      {
        patch: "follow-patch",
        release: {
          version: "2.0.0",
          files: [
            { path: "dist/a.js", before: sha(RELEASE_FILES["dist/a.js"]!), after: sha("const site = 1; NEW;\n"), replacements: [followPatch.matcher.sites[0]!.shapes[0]!] },
            { path: "dist/v2/b.js", before: sha(RELEASE_FILES["dist/v2/b.js"]!), after: sha("const site = 2; NEW;\n"), replacements: [followPatch.matcher.sites[0]!.shapes[0]!] },
          ],
        },
      },
    ])
    expect(await w.store.get(PREVIOUS_ENTRY)).toBe(NPM_ENTRY)
    expect(w.managed.removed).toEqual([`${INSTALLS}/0.9.0`, `${INSTALLS}/1.5.0`])
    expect(w.audit.records.map((r) => [r.action, r.patch, r.path, r.outcome])).toEqual([
      ["follow", "follow-patch", "dist/a.js", "applied"],
      ["follow", "follow-patch", "dist/v2/b.js", "applied"],
      ["follow", "plugin-entry", "opencode.jsonc", "adopted"],
    ])
    expect(report.evidence).toBe("/state/evidence/2026-10-11-12-00-magic-context-2.0.0-follow.md")
    const document = [...w.evidence.written.values()][0]!
    expect(document).toContain("# Magic Context 2.0.0, adopted by follow")
    expect(document).toContain(`| follow-patch | \`dist/a.js\` | 1 × \`OLD\` | \`${sha(RELEASE_FILES["dist/a.js"]!)}\``)
    expect(document).toContain("| confirm | ok | 0.5 |")
    expect(document).toContain("older installs removed: 0.9.0, 1.5.0")
    expect(w.notifier.sent).toEqual([{ title: FOLLOW_TITLE, body: `Adopted Magic Context 2.0.0, already patched. Evidence: ${report.evidence}` }])
    expect(w.lock.released).toBe(1)
    expect(report.steps.find((s) => s.step === "confirm")!.detail).toContain("2 locations load it (active): /work/0, /work/1")
    expect(report.steps.find((s) => s.step === "confirm")!.detail).toContain("execute threshold verdict no-data")
  })

  it("keeps the folder the previous entry names, and escapes | in the evidence", async () => {
    const w = followWorld({ entry: rootOf("1.5.0") })
    w.managed.seed("1.5.0")
    w.managed.seed("0.8.0")
    w.managed.seed("0.9.0")
    w.live.answer = (entry) => [{ directory: "/w|x", source: entry === ROOT ? `${ROOT}/index.js` : `${entry}/index.js`, status: "active" }]
    const report = await w.follow.follow(null)
    expect(report.outcome).toBe("adopted")
    expect(w.managed.removed).toEqual([`${INSTALLS}/0.8.0`, `${INSTALLS}/0.9.0`])
    expect([...w.evidence.written.values()][0]).toContain("/w\\|x")
  })

  it("never removes a folder a location still loads while pruning", async () => {
    const w = followWorld()
    w.managed.seed("0.9.0")
    // Call 1 is the confirm (every location on the new copy); from call 2, pruning, a new location appears on 0.9.0.
    w.live.answer = (_, call) => [
      { directory: "/w", source: `${ROOT}/index.js`, status: "active" },
      ...(call >= 2 ? [{ directory: "/late", source: `${rootOf("0.9.0")}/index.js`, status: "active" }] : []),
    ]
    const report = await w.follow.follow(null)
    expect(report.outcome).toBe("adopted")
    expect(w.managed.removed).toEqual([])
    expect([...w.evidence.written.values()][0]).toContain("older installs removed: none")
  })

  it("adopts a version asked for even when it is not newer, and checks a reviewed version's checksums", async () => {
    const w = followWorld({ patches: [reviewedPatch()] })
    w.registry.known = [published("2.0.0")]
    w.installations.copies = [{ spec: "3.0.0", root: "/cache/3", version: "3.0.0" }]
    w.files.contents.set(CONFIG, encode(configText(`${NPM_ENTRY.split("@1")[0]}@3.0.0`)))
    const report = await w.follow.follow("2.0.0")
    expect([report.outcome, report.steps[0]!.detail]).toEqual(["adopted", expect.stringContaining("asked for 2.0.0")])
  })

  it("says what it found when no server runs, or the server has no location loaded", async () => {
    const none = followWorld()
    none.live.answer = () => null
    const report = await none.follow.follow(null)
    expect([report.outcome, report.steps.find((s) => s.step === "confirm")!.detail]).toEqual(["adopted", `no OpenCode server answers; it loads ${ROOT} when it starts`])
    const empty = followWorld()
    empty.live.locations = 0
    expect((await empty.follow.follow(null)).steps.find((s) => s.step === "confirm")!.detail).toContain("the running server has no location loaded")
  })

  it("waits for every location to reload, polling", async () => {
    const w = followWorld()
    w.live.answer = (entry, call) => [{ directory: "/w", source: call < 4 ? NPM_ENTRY : `${entry}/index.js`, status: "active" }]
    const report = await w.follow.follow(null)
    expect(report.outcome).toBe("adopted")
    // Calls 1–3 still report the old entry: three polls, then the settle wait.
    expect(w.clock.slept).toEqual([1000, 1000, 1000, 500])
  })
})

describe("follow: nothing to do", () => {
  it("is up to date when npm latest is not newer than what OpenCode loads", async () => {
    const w = followWorld()
    w.registry.latestVersion = published("1.0.0")
    const report = await w.follow.follow(null)
    expect([report.outcome, steps(report), report.to]).toEqual(["up-to-date", ["detect:ok"], NPM_ENTRY])
    expect(report.steps[0]!.detail).toBe(`npm latest is 1.0.0; OpenCode loads 1.0.0 (${NPM_ENTRY})`)
    expect(w.notifier.sent).toEqual([])
  })

  it("is up to date when OpenCode already loads the patched copy of that version", async () => {
    const w = followWorld({ entry: ROOT, copies: [] })
    w.managed.seed("2.0.0")
    const report = await w.follow.follow(null)
    expect([report.outcome, report.steps[0]!.detail]).toEqual(["up-to-date", `2.0.0 is published; OpenCode loads an uninstalled copy (${ROOT}), the patched copy this tool installed`])
  })
})

describe("follow: stopping", () => {
  const stopped = async (w: ReturnType<typeof followWorld>, version: string | null = null) => {
    const report = await w.follow.follow(version)
    expect(report.outcome).toBe("stopped")
    expect(w.entryNow()).toBe(report.from)
    return report
  }

  it("is busy while another run holds the lock", async () => {
    const w = followWorld()
    w.lock.held = true
    expect(await w.follow.follow(null)).toMatchObject({ outcome: "busy", version: null, steps: [{ step: "detect", ok: false, detail: "another follow run holds the lock" }] })
  })

  it("stops without an entry, without a registry, or for a version never published", async () => {
    expect(failure(await stopped(followWorld({ entry: null })))).toBe("opencode.jsonc has no Magic Context entry")
    const offline = followWorld()
    offline.registry.latestVersion = new Error("ENOTFOUND")
    expect(failure(await stopped(offline))).toBe("the npm registry did not answer: ENOTFOUND")
    const unknown = followWorld()
    const report = await stopped(unknown, "9.9.9")
    expect(failure(report)).toBe("Magic Context 9.9.9 was never published")
    expect(unknown.audit.records.map((r) => [r.outcome, r.version, r.reason])).toEqual([["stopped", "9.9.9", "detect: Magic Context 9.9.9 was never published"]])
    expect(unknown.notifier.sent[0]!.body).toBe(
      "Stopped on 9.9.9: detect: Magic Context 9.9.9 was never published. OpenCode keeps what it loaded. Run `opencode-magic-context-patches follow` to see every step.",
    )
  })

  it("notifies the same stop once, and again after it changed", async () => {
    const w = followWorld()
    w.registry.latestVersion = new Error("down")
    await w.follow.follow(null)
    await w.follow.follow(null)
    expect(w.notifier.sent.length).toBe(1)
    w.registry.latestVersion = new Error("still down")
    await w.follow.follow(null)
    expect(w.notifier.sent.length).toBe(2)
    expect(await w.store.get(LAST_FOLLOW_NOTIFICATION)).toContain("still down")
  })

  it("leaves alone a published folder the server still loads, and replaces one nothing loads", async () => {
    const loaded = followWorld()
    loaded.managed.seed("2.0.0")
    loaded.live.answer = () => [{ directory: "/w", source: `${INSTALLS}/2.0.0/node_modules/x/index.js`, status: "active" }]
    expect(failure(await stopped(loaded))).toBe(`the running server still loads ${INSTALLS}/2.0.0, which opencode.jsonc no longer names; it is left alone`)
    const stale = followWorld()
    stale.managed.seed("2.0.0")
    expect((await stale.follow.follow(null)).outcome).toBe("adopted")
    expect(stale.managed.removed[0]).toBe(`${INSTALLS}/2.0.0`)
  })

  it("stops when the installer resolves another version, another integrity, or fails", async () => {
    const version = followWorld()
    version.installer.override = { version: "2.0.1" }
    expect(failure(await stopped(version))).toBe("the installer resolved 2.0.1, not 2.0.0")
    expect(version.managed.removed).toEqual([`${INSTALLS}/.staging-2.0.0-1`])
    const integrity = followWorld()
    integrity.installer.override = { integrity: null }
    expect(failure(await stopped(integrity))).toBe("tarball integrity (none) differs from the registry's sha512-2.0.0")
    const other = followWorld()
    other.installer.override = { integrity: "sha512-x" }
    expect(failure(await stopped(other))).toBe("tarball integrity sha512-x differs from the registry's sha512-2.0.0")
    const broken = followWorld()
    broken.installer.override = new Error("ETARGET")
    expect(failure(await stopped(broken))).toBe("installing 2.0.0 failed: ETARGET")
    const thrown = followWorld()
    thrown.installer.override = "plain" as never
    thrown.installer.install = async () => {
      throw "plain"
    }
    expect(failure(await stopped(thrown))).toBe("installing 2.0.0 failed: plain")
  })

  it("stops when a matcher does not hold", async () => {
    const shape = followWorld()
    shape.installer.contents = { ...RELEASE_FILES, "dist/c.js": "site OLD OLD\n" }
    expect(failure(await stopped(shape))).toBe('follow-patch: dist/c.js: expected 1 × "OLD", found 2')
  })

  it("composes two patches that change the same file, in matcher order, each onto the previous one's result", async () => {
    const second: PatchDefinition = {
      ...followPatch,
      id: "second",
      matcher: { ...followPatch.matcher, sites: [{ name: "spot", files: 2, shapes: [{ find: "site", replace: "spot", count: 1 }], anchor: "const", window: 20 }] },
    }
    const w = followWorld({ patches: [followPatch, second] })
    const report = await w.follow.follow(null)
    expect([report.outcome, steps(report)]).toEqual(["adopted", ["detect:ok", "stage:ok", "locate:ok", "patch:ok", "prove:ok", "publish:ok", "confirm:ok", "record:ok"]])
    expect(w.text(`${ROOT}/dist/a.js`)).toBe("const spot = 1; NEW;\n")
    expect(w.text(`${ROOT}/dist/v2/b.js`)).toBe("const spot = 2; NEW;\n")
    const first = w.derived.releases.find((r) => r.patch === "follow-patch")!.release.files
    const later = w.derived.releases.find((r) => r.patch === "second")!.release.files
    expect(later.map((file) => [file.path, file.before === first.find((entry) => entry.path === file.path)!.after])).toEqual([
      ["dist/a.js", true],
      ["dist/v2/b.js", true],
    ])
  })

  it("stops when a patched file no longer parses, reads back wrong, or differs from the reviewed release", async () => {
    const parse = followWorld({ patches: [{ ...followPatch, matcher: { ...followPatch.matcher, sites: [{ ...followPatch.matcher.sites[0]!, shapes: [{ find: "OLD", replace: "SYNTAX", count: 1 }] }] } }] })
    expect(failure(await stopped(parse))).toBe("follow-patch: dist/a.js no longer parses after patching: Unexpected token")
    const readBack = followWorld()
    readBack.files.corruptReplace.add(`${INSTALLS}/.staging-2.0.0-1/node_modules/@cortexkit/opencode-magic-context/dist/a.js`)
    expect(failure(await stopped(readBack))).toBe(`follow-patch: dist/a.js did not read back with sha256 ${sha("const site = 1; NEW;\n")}`)
    const reviewed = followWorld({ patches: [reviewedPatch((text) => text.replace("OLD", "OTHER"))] })
    expect(failure(await stopped(reviewed))).toBe("follow-patch: dist/a.js does not give the reviewed 2.0.0 checksums")
    const missing = followWorld({ patches: [{ ...reviewedPatch(), releases: [{ version: "2.0.0", files: [] }] }] })
    expect(failure(await stopped(missing))).toBe("follow-patch: dist/a.js does not give the reviewed 2.0.0 checksums")
  })

  it("stops when moving the copy into place fails", async () => {
    const w = followWorld()
    w.managed.publishFails = true
    expect(failure(await stopped(w))).toBe(`moving ${INSTALLS}/.staging-2.0.0-1 into place failed: rename failed`)
    expect(w.managed.removed).toEqual([`${INSTALLS}/.staging-2.0.0-1`])
  })

  it("stops and removes the published copy when the proof fails", async () => {
    const cases: Array<[Parameters<typeof followWorld>[0], (root: string) => object, string]> = [
      [{}, () => ({ status: null, source: null, lines: [], error: "spawn ENOENT" }), "the isolated OpenCode server could not run: spawn ENOENT"],
      [{}, () => ({ status: "failed: boom", source: null, lines: [], error: null }), "the isolated OpenCode server reports the plugin failed: boom"],
      [{}, () => ({ status: null, source: null, lines: [], error: null }), "the isolated OpenCode server reports the plugin missing"],
      [{}, () => ({ status: "active", source: null, lines: [], error: null }), `the isolated OpenCode server loaded nothing, not ${ROOT}`],
      [{}, () => ({ status: "active", source: "/elsewhere/index.js", lines: [], error: null }), `the isolated OpenCode server loaded /elsewhere/index.js, not ${ROOT}`],
      [
        { magicContextConfig: null },
        (root) => ({ status: "active", source: `${root}/index.js`, lines: ["[t] [config] config reload failed x: invalid value (number 13)"], error: null }),
        "Magic Context rejected its configuration: [t] [config] config reload failed x: invalid value (number 13)",
      ],
    ]
    for (const [options, proof, reason] of cases) {
      const w = followWorld(options)
      w.sandbox.proof = proof as never
      expect(failure(await stopped(w))).toBe(reason)
      expect(w.managed.removed).toEqual([`${INSTALLS}/2.0.0`])
    }
  })

  it("puts the previous entry back when the running server does not reload in time", async () => {
    const w = followWorld()
    w.live.answer = (entry) => [{ directory: "/w", source: entry === ROOT ? NPM_ENTRY : entry, status: "active" }]
    const report = await stopped(w)
    expect(steps(report)).toEqual(["detect:ok", "stage:ok", "locate:ok", "patch:ok", "prove:ok", "publish:ok", "confirm:failed", "rollback:ok", "confirm:ok"])
    expect(failure(report)).toBe(`after 10 s the running server reports /w: ${NPM_ENTRY} active`)
    expect([report.to, w.entryNow()]).toEqual([NPM_ENTRY, NPM_ENTRY])
    expect(w.managed.removed).toEqual([`${INSTALLS}/2.0.0`])
  })

  it("keeps the published copy when the server still loads it after the revert", async () => {
    const w = followWorld()
    w.live.answer = () => [{ directory: "/w", source: `${ROOT}/index.js`, status: "failed: x" }]
    const report = await stopped(w)
    expect(steps(report).slice(-3)).toEqual(["confirm:failed", "rollback:ok", "confirm:failed"])
    expect(failure(report)).toBe(`after 10 s the running server reports /w: ${ROOT}/index.js failed: x`)
    expect(w.managed.removed).toEqual([])
  })

  it("reports a location that lists no Magic Context", async () => {
    const w = followWorld()
    w.live.answer = () => [{ directory: "/w", source: null, status: null }]
    expect(failure(await stopped(w))).toBe("after 10 s the running server reports /w: (not listed)")
  })

  it("puts the previous entry back when Magic Context rejects its configuration after the switch", async () => {
    const w = followWorld({ log: `${STAMP} [config] config reload failed ~/x: invalid value\n[2026-10-11T11:00:00.000Z] [config] config reload failed old` })
    const report = await stopped(w)
    expect(failure(report)).toBe("Magic Context rejected its configuration after the change: [config] config reload failed ~/x: invalid value")
  })

  it("puts the previous entry back when the threshold in use differs from the configured one", async () => {
    const w = followWorld({ log: `${STAMP} transform threshold: proactiveFloor=63%`, magicContextConfig: '{ "execute_threshold_percentage": 13 }' })
    expect(failure(await stopped(w))).toBe("the execute threshold in use differs from /config/mc.jsonc")
    const unset = followWorld({ log: null, magicContextConfig: null })
    expect((await unset.follow.follow(null)).outcome).toBe("adopted")
  })

  it("stops without reverting when the entry cannot be changed", async () => {
    const two = followWorld()
    two.files.contents.set(CONFIG, encode(`${configText(NPM_ENTRY)}// "${NPM_ENTRY}"\n["${NPM_ENTRY}"]`))
    const report = await two.follow.follow(null)
    expect(failure(report)).toBe(`${CONFIG} does not have exactly one Magic Context entry`)
    expect(steps(report).at(-1)).toBe("publish:failed")
  })
})

describe("the entry editor", () => {
  it("refuses a missing file, and puts the original back when the write does not read back", async () => {
    const w = followWorld()
    w.files.contents.delete(CONFIG)
    expect(await w.editor.set(ROOT)).toEqual({ ok: false, reason: `${CONFIG} does not exist` })
    expect(await w.editor.current()).toBeNull()
    w.files.contents.set(CONFIG, encode(configText(NPM_ENTRY)))
    w.files.corruptReplace.add(CONFIG)
    const change = await w.editor.set(ROOT)
    expect(change).toEqual({ ok: false, reason: expect.stringContaining("did not read back as written; the original is back") })
    // The corrupting fake also corrupts the restore; a real file is restored byte for byte (e2e).
    w.files.corruptReplace.clear()
    w.files.contents.set(CONFIG, encode(configText(NPM_ENTRY)))
    const read = w.files.read.bind(w.files)
    w.files.read = async (file) => (file === CONFIG && w.files.replaces.length > 2 ? null : read(file))
    expect((await w.editor.set(ROOT)).ok).toBe(false)
    expect(w.editor.location()).toBe(CONFIG)
  })
})

describe("follow --rollback", () => {
  it("puts back the previous entry and makes the replaced one the next rollback target", async () => {
    const w = followWorld()
    await w.follow.follow(null)
    const report = await w.rollback.rollback()
    expect([report.outcome, report.from, report.to, w.entryNow()]).toEqual(["rolled-back", ROOT, NPM_ENTRY, NPM_ENTRY])
    expect(steps(report)).toEqual(["rollback:ok", "confirm:ok"])
    expect(await w.store.get(PREVIOUS_ENTRY)).toBe(ROOT)
    expect(w.audit.records.at(-1)).toMatchObject({ action: "rollback", outcome: "rolled-back", reason: `"${ROOT}" → "${NPM_ENTRY}"` })
    expect((await w.rollback.rollback()).to).toBe(ROOT)
  })

  it("rolls back to a previous folder entry that still exists", async () => {
    const w = followWorld({ entry: rootOf("2.0.0") })
    const folder = rootOf("1.5.0")
    w.files.contents.set(`${folder}/index.js`, encode("module.exports = {}"))
    await w.store.set(PREVIOUS_ENTRY, folder)
    const report = await w.rollback.rollback()
    expect([report.outcome, steps(report), report.to, w.entryNow()]).toEqual(["rolled-back", ["rollback:ok", "confirm:ok"], folder, folder])
    expect(await w.store.get(PREVIOUS_ENTRY)).toBe(rootOf("2.0.0"))
  })

  it("refuses a previous folder entry that no longer exists, changing nothing", async () => {
    const w = followWorld()
    const missing = rootOf("9.9.9")
    await w.store.set(PREVIOUS_ENTRY, missing)
    const report = await w.rollback.rollback()
    expect([report.outcome, failure(report), report.from, report.to, w.entryNow()]).toEqual(["stopped", `previous entry ${missing} no longer exists`, NPM_ENTRY, NPM_ENTRY, NPM_ENTRY])
    expect(await w.store.get(PREVIOUS_ENTRY)).toBe(missing)
    expect(w.lock.released).toBe(1)
  })

  it("refuses a previous folder entry it cannot list, changing nothing", async () => {
    const w = followWorld()
    const missing = rootOf("9.9.9")
    await w.store.set(PREVIOUS_ENTRY, missing)
    w.files.list = async () => {
      throw new Error("EACCES")
    }
    expect(failure(await w.rollback.rollback())).toBe(`previous entry ${missing} no longer exists`)
  })

  it("is busy under the lock, and stops when nothing was adopted or the revert fails", async () => {
    const w = followWorld()
    w.lock.held = true
    expect((await w.rollback.rollback()).outcome).toBe("busy")
    w.lock.held = false
    const none = await w.rollback.rollback()
    expect([none.outcome, failure(none), none.to]).toEqual(["stopped", "no previous entry is recorded: follow has not adopted anything", NPM_ENTRY])
    await w.store.set(PREVIOUS_ENTRY, ROOT)
    w.files.contents.set(`${ROOT}/index.js`, encode("module.exports = {}"))
    w.files.contents.set(CONFIG, encode("{}"))
    const failed = await w.rollback.rollback()
    expect([failed.outcome, failure(failed)]).toEqual(["stopped", `${CONFIG} does not have exactly one Magic Context entry`])
    expect(w.lock.released).toBe(2)
  })
})
