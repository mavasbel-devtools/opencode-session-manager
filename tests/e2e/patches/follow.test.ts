import { afterEach, beforeEach, describe, expect, it, setDefaultTimeout, spyOn } from "bun:test"
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"
import { magicContextEntry, MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { buildContainer } from "@session-manager/main/cli-container"
import { patchesPlatformAdapters } from "@session-manager/main/cli/platform"
import { createPatchCommands, type Seams } from "@session-manager/main/patches-container"
import { resolvePatchPaths } from "@session-manager/main/cli/patches-paths"
import { executeThresholdMin } from "@session-manager/domain/patch-definitions/execute-threshold-min"
import { PATCHES } from "@session-manager/domain/patch-definitions/index"
import { noSessionModelFallback } from "@session-manager/domain/patch-definitions/no-session-model-fallback"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { currentPlatform, onlyOn } from "@test/support/platform"
import { sha } from "@test/support/patches/fakes"
import { LocalRegistry, tarball } from "@test/support/patches/registry"
import { Sandbox, write } from "@test/support/patches/sandbox"

// Each test runs several installs and isolated servers; the silent server takes its 10 s kill grace.
setDefaultTimeout(60_000)

const PINNED = `${MAGIC_CONTEXT_PACKAGE}@0.49.15`
const FALLBACK = "...!primary && args.fallbackModelId ? [{ model: args.fallbackModelId }] : []"
const TOAST_SITE = "if (managedError instanceof UnresolvedHistoryBoundaryError ||"
const edit = (file: string, change: (text: string) => string) => (root: string) => writeFileSync(path.join(root, file), change(readFileSync(path.join(root, file), "utf8")))
/** Releases whose sites have shapes the matchers must refuse, each built from 0.49.35's files. */
const CRAFTED: Array<[string, string, (root: string) => void, string]> = [
  ["0.49.98", "a fourth threshold site", edit("dist/index-nxrsns5x.js", (t) => `${t}\n// execute_threshold_percentage min(20).max(90\n`), 'execute-threshold-min: dist/index-nxrsns5x.js: expected 3 × "min(20).max(90", found 4'],
  ["0.49.97", "the fallback site gone from one bundle", edit("dist/index-4bgk5ztz.js", (t) => t.replace(FALLBACK, "...[]")), 'no-session-model-fallback: expected site "session-model spread" in 2 files, found it in 1 (dist/v2/server-fqj6ddpr.js)'],
  ["0.49.96", "both fallback shapes in one bundle", edit("dist/index-4bgk5ztz.js", (t) => `${t}\n// ...args.fallbackModelId ? [{ model: args.fallbackModelId }] : []\n`), 'no-session-model-fallback: dist/index-4bgk5ztz.js contains 2 different shapes of site "session-model spread"'],
  ["0.49.95", "a threshold already patched", edit("dist/v2/server-24g8r2d0.js", (t) => `${t}\n// min(1).max(90\n`), 'execute-threshold-min: dist/v2/server-24g8r2d0.js already contains the replacement "min(1).max(90"'],
  ["0.49.94", "the fallback function renamed", edit("dist/index-4bgk5ztz.js", (t) => t.replace("async function runFallbackHistorianPass(args) {", "async function runHistorianFallbacks(args) {")), "no-session-model-fallback: dist/index-4bgk5ztz.js: the hit at offset"],
  ["0.49.93", "the refusal toast gone from the live bundle", edit("dist/context-fk8e3h9p.js", (t) => t.replace(TOAST_SITE, "if (managedError instanceof UnresolvedHistoryBoundaryError || false ||")), 'refusal-recovery: expected site "refusal toast" in 2 files, found it in 1 (dist/v2/context-znqfkap4.js)'],
]
// The patches reviewed against the 0.49.35 tarball this suite serves; the fold patches are only reviewed for 0.49.15 and 0.49.50.
const ON_035 = PATCHES.filter((patch) => patch.releases.some((release) => release.version === "0.49.35"))
const latest = (patch: PatchDefinition) => patch.releases.find((r) => r.version === "0.49.35")!.files
const reviewed = ON_035.flatMap(latest)
/** The state each file is left in once every patch of 0.49.35 has run, in apply order. */
const composed = ON_035.reduce((state, patch) => {
  for (const file of latest(patch)) state.set(file.path, file.after)
  return state
}, new Map<string, string>())
// fold-provenance-heal has no reviewed 0.49.35 release, but its site predates the identity change and
// its matcher finds it there, so follow derives it on top of refusal-recovery: the pinned results.
const HEALED_035 = new Map([
  ["dist/context-fk8e3h9p.js", "7ff1f7be1936f6a5d432c40e361abc71dd94a6b3d29adb569ca36d1f9f85b924"],
  ["dist/v2/context-znqfkap4.js", "404b023f8840d843e98db7ab1a610b1d076e70d42b5f30126999e5acd35e2792"],
])
const composedFiles = [...composed].map(([path, after]) => ({ path, after: HEALED_035.get(path) ?? after }))
/** The state each file starts in: the first patch of 0.49.35 that changes it, its original. */
const composedBefore = ON_035.reduce((state, patch) => {
  for (const file of latest(patch)) if (!state.has(file.path)) state.set(file.path, file.before)
  return state
}, new Map<string, string>())
const composedBeforeFiles = [...composedBefore].map(([path, before]) => ({ path, before }))

let box: Sandbox
let registry: LocalRegistry
let live: ReturnType<typeof Bun.serve> | null
let env: Record<string, string>
let notifications: string
let liveAnswer: ((entry: string | null, pathname: string) => Response | null) | null

beforeEach(() => {
  box = new Sandbox()
  box.install("0.49.15")
  box.pin("0.49.15")
  // Shaped like the real magic-context.jsonc: comments and escaped quotes.
  write(path.join(box.config, "cortexkit", "magic-context.jsonc"), '{\n  // the threshold\n  /* 13 % */ "note": "a \\"q\\"",\n  "execute_threshold_percentage": 13,\n}\n')
  registry = new LocalRegistry([
    tarball(box.home, "0.49.15"),
    // 0.49.19 has none of refusal-recovery's sites.
    tarball(box.home, "0.49.19"),
    tarball(box.home, "0.49.35"),
    // 0.49.36 and 0.49.99: nobody reviewed them; their files are 0.49.35's, so the matchers must hold.
    tarball(box.home, "0.49.35", "0.49.36"),
    tarball(box.home, "0.49.35", "0.49.99"),
    ...CRAFTED.map(([version, , change]) => tarball(box.home, "0.49.35", version, change)),
  ])
  registry.latest = "0.49.35"
  liveAnswer = null
  live = box.liveServer(2, (entry, pathname) => liveAnswer?.(entry, pathname) ?? null)
  const notifier = box.notifier()
  notifications = notifier.calls
  env = box.env({
    OPENCODE_SESSION_MANAGER_PATCHES_REGISTRY: registry.url,
    OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN: box.opencodeStandIn("ok"),
    OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN: notifier.command,
    OPENCODE_SESSION_MANAGER_PATCHES_TIMEOUT_MS: "3000",
    OPENCODE_SESSION_MANAGER_PATCHES_SETTLE_MS: "10",
  })
})
afterEach(() => {
  live?.stop(true)
  registry.stop()
  box.dispose()
})

const configFile = () => path.join(box.config, "opencode", "opencode.jsonc")
const entry = () => magicContextEntry(readFileSync(configFile(), "utf8"))
const installed = (version: string) => path.join(box.data, "opencode-session-manager", "patches", "installs", version, "node_modules", MAGIC_CONTEXT_PACKAGE)
const installs = () => readdirSync(path.join(box.data, "opencode-session-manager", "patches", "installs")).sort()
async function run(...argv: string[]) {
  const output = new FakeOutput()
  const errors: string[] = []
  const write = spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    errors.push(String(chunk).replace(/\n$/, ""))
    return true
  })
  try {
    const code = await (await buildContainer(env as CliEnvironment, { output })).run(["patches", ...argv])
    return { code, out: output.text(), err: errors.join("\n") }
  } finally {
    write.mockRestore()
  }
}
const follow = async (...argv: string[]) => {
  const result = await run("follow", ...argv, "--json")
  return { code: result.code, report: JSON.parse(result.out) }
}
const steps = (report: { steps: ReadonlyArray<{ step: string; ok: boolean }> }) => report.steps.map((s) => `${s.step}:${s.ok ? "ok" : "failed"}`)
const failure = (report: { steps: ReadonlyArray<{ ok: boolean; detail: string }> }) => report.steps.find((s) => !s.ok)?.detail
const commands = async (patches: readonly PatchDefinition[], seams: Seams = {}) =>
  createPatchCommands(
    resolvePatchPaths(env as CliEnvironment, box.home),
    patches,
    await patchesPlatformAdapters(currentPlatform(), {
      proc: env.OPENCODE_SESSION_MANAGER_PATCHES_PROC ?? "/proc",
      notifyCommand: env.OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN,
    }),
    seams,
  )

describe("follow, through the whole program, on copies of the real Magic Context files", () => {
  it("adopts npm latest already patched, is then up to date, and rolls back and forth", async () => {
    const before = readFileSync(configFile(), "utf8")
    const { code, report } = await follow()
    if (code !== 0) console.log(JSON.stringify(report.steps, null, 2))
    expect([code, report.outcome, report.version, report.from, report.to]).toEqual([0, "adopted", "0.49.35", PINNED, installed("0.49.35")])
    expect(steps(report)).toEqual(["detect:ok", "stage:ok", "locate:ok", "patch:ok", "prove:ok", "publish:ok", "confirm:ok", "record:ok"])
    expect(readFileSync(configFile(), "utf8")).toBe(before.replace(`"${PINNED}"`, JSON.stringify(installed("0.49.35"))))
    for (const file of composedFiles) expect([file.path, sha(readFileSync(path.join(installed("0.49.35"), file.path)))]).toEqual([file.path, file.after])
    expect(installs()).toEqual(["0.49.35"])
    expect(readFileSync(report.evidence, "utf8")).toContain("# Magic Context 0.49.35, adopted by follow")
    expect(readFileSync(notifications, "utf8")).toContain("Adopted Magic Context 0.49.35, already patched.")
    expect((await run("check")).out).toBe(`OK: every patch is applied on the loaded Magic Context (${installed("0.49.35")})`)
    expect((await run("status")).out).toContain("execute-threshold-min on 0.49.35 (loaded): applied\n")

    const again = await follow()
    expect([again.code, again.report.outcome, steps(again.report)]).toEqual([0, "up-to-date", ["detect:ok"]])

    const back = await follow("--rollback")
    expect([back.code, back.report.outcome, entry()]).toEqual([0, "rolled-back", PINNED])
    expect(readFileSync(configFile(), "utf8")).toBe(before)
    expect((await follow("--rollback")).report.to).toBe(installed("0.49.35"))
    const text = await run("follow", "--rollback")
    expect(text.out.split("\n")[0]).toBe("follow: rolled-back")
    const audit = readFileSync(path.join(box.state, "opencode-session-manager", "patches", "audit.log"), "utf8").trim().split("\n").map((line) => JSON.parse(line))
    expect(audit.map((r) => [r.action, r.patch, r.outcome])).toEqual([
      ["follow", "execute-threshold-min", "applied"],
      ["follow", "execute-threshold-min", "applied"],
      ["follow", "no-session-model-fallback", "applied"],
      ["follow", "no-session-model-fallback", "applied"],
      ["follow", "refusal-recovery", "applied"],
      ["follow", "refusal-recovery", "applied"],
      ["follow", "refusal-recovery", "applied"],
      ["follow", "fold-provenance-heal", "applied"],
      ["follow", "fold-provenance-heal", "applied"],
      ["follow", "plugin-entry", "adopted"],
      ["rollback", "plugin-entry", "rolled-back"],
      ["rollback", "plugin-entry", "rolled-back"],
      ["rollback", "plugin-entry", "rolled-back"],
    ])
  })

  it("adopts a version nobody reviewed through the matchers, marks it auto-checked, and can undo and re-apply it", async () => {
    const { report } = await follow("--version", "0.49.99")
    expect(report.outcome).toBe("adopted")
    const status = JSON.parse((await run("status", "--json")).out)
    const loaded = status.patches.filter((p: { installation: { loaded: boolean } }) => p.installation.loaded)
    expect(loaded.map((p: { patch: string; state: string; checked: string }) => [p.patch, p.state, p.checked])).toEqual([
      ["execute-threshold-min", "applied", "auto"],
      ["no-session-model-fallback", "applied", "auto"],
      ["refusal-recovery", "applied", "auto"],
      ["fold-identity-stable", "applied", "auto"],
      ["fold-provenance-heal", "applied", "auto"],
    ])
    expect((await run("status")).out).toContain("execute-threshold-min on 0.49.99 (loaded): applied (auto-checked by follow)")
    expect((await run("undo")).code).toBe(0)
    for (const file of composedBeforeFiles) expect(sha(readFileSync(path.join(installed("0.49.99"), file.path)))).toBe(file.before)
    expect((await run("apply")).code).toBe(0)
    expect((await run("check")).code).toBe(0)

    // A newer adoption keeps the copy the previous entry names, and removes the ones nothing names.
    expect((await follow("--version", "0.49.35")).report.outcome).toBe("adopted")
    expect(installs()).toEqual(["0.49.35", "0.49.99"])
    // npm latest older than what is loaded: nothing to do; asked for explicitly: adopted.
    registry.latest = "0.49.19"
    expect((await follow()).report.outcome).toBe("up-to-date")
    expect((await follow("--version", "0.49.36")).report.outcome).toBe("adopted")
    expect(installs()).toEqual(["0.49.35", "0.49.36"])
  })

  it("stops on a release that lacks the sites of one patch, even when asked for it explicitly", async () => {
    const before = readFileSync(configFile(), "utf8")
    const { code, report } = await follow("--version", "0.49.19")
    expect([code, report.outcome, failure(report), readFileSync(configFile(), "utf8")]).toEqual([
      1,
      "stopped",
      'refusal-recovery: expected site "historian wait" in 2 files, found it in 0 (none)',
      before,
    ])
    expect(installs()).toEqual([])
  })

  it("replaces a published copy nothing loads, and leaves alone one the running server still loads", async () => {
    await follow()
    await follow("--rollback")
    const redo = await follow()
    expect([redo.report.outcome, installs()]).toEqual(["adopted", ["0.49.35"]])
    await follow("--rollback")
    liveAnswer = (_, pathname) =>
      pathname === "/api/plugin" ? Response.json({ location: { directory: "/w" }, data: [{ source: { type: "local", path: `${installed("0.49.35")}/index.js` }, state: { status: "active" } }] }) : null
    const held = await follow()
    expect([held.code, failure(held.report)]).toEqual([1, `the running server still loads ${path.dirname(path.dirname(path.dirname(installed("0.49.35"))))}, which opencode.jsonc no longer names; it is left alone`])
  })
})

describe("follow stops, and OpenCode keeps what it loaded", () => {
  const stopped = async (...argv: string[]) => {
    const before = readFileSync(configFile(), "utf8")
    const { code, report } = await follow(...argv)
    expect([code, report.outcome, readFileSync(configFile(), "utf8")]).toEqual([1, "stopped", before])
    return report
  }

  for (const [version, what, , reason] of CRAFTED) {
    it(`on ${what} (${version}), removing the staged copy`, async () => {
      expect(failure(await stopped("--version", version))).toStartWith(reason)
      expect(installs()).toEqual([])
    })
  }

  it("notifying the same stop once, and printing the failed step", async () => {
    await stopped("--version", "0.49.98")
    await stopped("--version", "0.49.98")
    expect(readFileSync(notifications, "utf8").trim().split("\n").length).toBe(1)
    const text = await run("follow", "--version", "0.49.98")
    expect(text.out).toContain("  FAILED locate ")
  })

  it("when the install folder cannot be published into place", async () => {
    write(path.join(box.data, "opencode-session-manager", "patches", "installs", "0.49.36"), "")
    const report = await stopped("--version", "0.49.36")
    expect(failure(report)).toMatch(/^moving .* into place failed: /)
    expect(report.steps.find((s: { step: string; ok: boolean }) => s.step === "publish")!.ok).toBe(false)
  })

  it("when opencode.jsonc does not read back as written", async () => {
    const config = configFile()
    const before = readFileSync(config, "utf8")
    let replaced = false
    const tampering: Seams = {
      files: (real: FilesPort) => ({
        read: async (file: string) => {
          const bytes = await real.read(file)
          if (replaced && file === config && bytes !== null) {
            replaced = false
            return new TextEncoder().encode(`${new TextDecoder().decode(bytes)}\n`)
          }
          return bytes
        },
        replace: async (file: string, bytes: Uint8Array) => {
          if (file === config) replaced = true
          return real.replace(file, bytes)
        },
        list: (directory: string, extension: string) => real.list(directory, extension),
      }),
    }
    const report = await (await commands(PATCHES, tampering)).follow.follow(null)
    expect(report.outcome).toBe("stopped")
    expect(report.steps.find((s) => s.step === "publish")!.detail).toContain("did not read back as written; the original is back")
    expect(readFileSync(config, "utf8")).toBe(before)
  })

  it("when the registry fails, names a version never published, or the tarball cannot be downloaded", async () => {
    registry.failures = true
    expect(failure(await stopped())).toMatch(/^the npm registry did not answer: GET .*: HTTP 503$/)
    registry.failures = false
    expect(failure(await stopped("--version", "9.9.9"))).toBe("Magic Context 9.9.9 was never published")
    registry.tarballFailures = true
    expect(failure(await stopped())).toMatch(/^installing 0\.49\.35 failed: .*404/)
    expect(installs()).toEqual([])
  })

  it("when the isolated server rejects the configuration, never lists the plugin, prints nothing, or cannot run", async () => {
    env = { ...env, OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN: box.opencodeStandIn("reject") }
    expect(failure(await stopped())).toMatch(/^Magic Context rejected its configuration: .*config reload failed/)
    env = { ...env, OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN: box.opencodeStandIn("missing"), OPENCODE_SESSION_MANAGER_PATCHES_TIMEOUT_MS: "300" }
    expect(failure(await stopped())).toBe("the isolated OpenCode server reports the plugin missing")
    env = { ...env, OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN: box.opencodeStandIn("silent") }
    expect(failure(await stopped())).toBe("the isolated OpenCode server could not run: opencode serve printed no address and password within 300 ms")
    env = { ...env, OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN: path.join(box.home, "no-opencode") }
    expect(failure(await stopped())).toMatch(/^the isolated OpenCode server could not run: /)
    expect(installs()).toEqual([])
    env = { ...env, OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN: box.opencodeStandIn("nolog") }
    expect((await follow()).report.outcome).toBe("adopted")
  })

  it("when a patched bundle no longer parses, reads back wrong, or differs from the reviewed release (crafted definitions, files seam)", async () => {
    const breaking = { ...executeThresholdMin, releases: [], matcher: { ...executeThresholdMin.matcher, sites: [{ ...executeThresholdMin.matcher.sites[0]!, shapes: [{ find: "min(20).max(90", replace: "min(1).max(90 ((", count: 3 }] }] } }
    expect(failure(await (await commands([breaking])).follow.follow(null))).toMatch(/^execute-threshold-min: dist\/index-nxrsns5x\.js no longer parses after patching: /)
    const wrongReview = { ...executeThresholdMin, releases: [{ version: "0.49.35", files: [{ ...reviewed[0]!, after: "0".repeat(64) }, reviewed[1]!] }] }
    expect(failure(await (await commands([wrongReview])).follow.follow(null))).toBe("execute-threshold-min: dist/v2/server-24g8r2d0.js does not give the reviewed 0.49.35 checksums")
    const corrupting: Seams = {
      files: (real) => ({
        read: async (file) => (file.includes(".staging-") && file.endsWith("index-nxrsns5x.js") && (await real.read(file)) !== null && readFileSync(file, "utf8").includes("min(1).max(90") ? new TextEncoder().encode("x") : real.read(file)),
        replace: (file, bytes) => real.replace(file, bytes),
        list: (directory, extension) => real.list(directory, extension),
      }),
    }
    expect(failure(await (await commands(ON_035, corrupting)).follow.follow(null))).toMatch(/^execute-threshold-min: dist\/index-nxrsns5x\.js did not read back with sha256 /)
    expect(installs()).toEqual([])
  })

  it("composes two patches that change the same file, the second onto the first one's result", async () => {
    const composed: PatchDefinition = {
      ...executeThresholdMin,
      id: "second",
      releases: [],
      matcher: {
        ...executeThresholdMin.matcher,
        sites: [{ name: "after the threshold", files: 2, shapes: [{ find: "min(1).max(90", replace: "min(2).max(90", count: 3 }], anchor: "execute_threshold_percentage", window: 300 }],
      },
    }
    const report = await (await commands([executeThresholdMin, composed])).follow.follow(null)
    expect(steps(report)).toEqual(["detect:ok", "stage:ok", "locate:ok", "patch:ok", "prove:ok", "publish:ok", "confirm:ok", "record:ok"])
    const patch = report.steps.find((s) => s.step === "patch")!.detail
    expect(patch).toContain("second dist/index-nxrsns5x.js")
    expect(readFileSync(path.join(installed("0.49.35"), "dist/index-nxrsns5x.js"), "utf8")).toContain("min(2).max(90")
    expect(installs()).toEqual(["0.49.35"])
  })

  it("adopts when no OpenCode server runs, and reads the live log since the switch", async () => {
    live!.stop(true)
    live = null
    const { report } = await follow()
    expect([report.outcome, report.steps.find((s: { step: string }) => s.step === "confirm").detail]).toEqual(["adopted", `no OpenCode server answers; it loads ${installed("0.49.35")} when it starts`])
    await follow("--rollback")
    live = box.liveServer(1)
    box.log(["[2099-01-01T00:00:00.000Z] transform threshold: threshold=13% proactiveFloor=11%"])
    const respected = await follow()
    expect(respected.report.steps.find((s: { step: string }) => s.step === "confirm").detail).toContain("execute threshold verdict respected")
  })

  it("waits while the running server is not ready, and stops when it never is", async () => {
    env = { ...env, OPENCODE_SESSION_MANAGER_PATCHES_TIMEOUT_MS: "300" }
    liveAnswer = (_, pathname) => (pathname === "/api/debug/location" ? new Response("", { status: 503 }) : null)
    expect(failure(await stopped())).toMatch(/^after 0.3 s the running server reports http:\/\/127\.0\.0\.1:\d+: \(not listed\) HTTP 503$/)
    liveAnswer = (_, pathname) => (pathname === "/api/plugin" ? new Response("", { status: 500 }) : null)
    expect(failure(await stopped())).toBe("after 0.3 s the running server reports /work/0: (not listed) HTTP 500; /work/1: (not listed) HTTP 500")
  })

  it("puts the previous entry back when the running server does not reload the new one", async () => {
    liveAnswer = (current, pathname) => (current === PINNED || pathname !== "/api/plugin" ? null : Response.json({ location: { directory: "/w" }, data: [{ source: { type: "package", target: PINNED }, state: { status: "active" } }] }))
    env = { ...env, OPENCODE_SESSION_MANAGER_PATCHES_TIMEOUT_MS: "300" }
    const report = await stopped()
    expect(steps(report).slice(-3)).toEqual(["confirm:failed", "rollback:ok", "confirm:ok"])
    expect(installs()).toEqual([])
  })

  it("when the installer reports another version or integrity (declared seam), or the entry is ambiguous", async () => {
    const lying = (override: object): Seams => ({ installer: (real) => ({ install: async (spec, folder) => ({ ...(await real.install(spec, folder)), ...override }) }) })
    expect(failure(await (await commands(ON_035, lying({ version: "0.0.1" }))).follow.follow(null))).toBe("the installer resolved 0.0.1, not 0.49.35")
    expect(failure(await (await commands(ON_035, lying({ integrity: "sha512-x" }))).follow.follow(null))).toMatch(/^tarball integrity sha512-x differs from the registry's sha512-/)
    write(configFile(), `{ "plugins": ["${PINNED}", "${MAGIC_CONTEXT_PACKAGE}"] }`)
    expect(failure(await (await commands(ON_035)).follow.follow(null))).toBe(`${configFile()} does not have exactly one Magic Context entry`)
  })

  it.skipIf(onlyOn("linux"))("while another run holds the lock, and without an entry (linux only)", async () => {
    const proc = box.proc(1_000, 10)
    env = { ...env, OPENCODE_SESSION_MANAGER_PATCHES_PROC: proc }
    write(path.join(box.state, "opencode-session-manager", "patches", "follow.lock"), "42")
    expect([(await follow()).report.outcome, (await follow("--rollback")).report.outcome]).toEqual(["busy", "busy"])
    write(path.join(box.state, "opencode-session-manager", "patches", "follow.lock"), "43")
    expect((await follow()).report.outcome).toBe("adopted")
    expect(existsSync(path.join(box.state, "opencode-session-manager", "patches", "follow.lock"))).toBe(false)
    write(configFile(), "{}")
    expect(failure(await stopped())).toBe("opencode.jsonc has no Magic Context entry")
    const none = await follow("--rollback")
    expect([none.code, failure(none.report)]).toEqual([1, `${configFile()} does not have exactly one Magic Context entry`])
  })

  it("lists only real installs: a folder without a package is skipped", async () => {
    write(path.join(box.data, "opencode-session-manager", "patches", "installs", "0.0.1", "README"), "")
    expect(JSON.parse((await run("status", "--json")).out).installations.map((i: { version: string }) => i.version)).toEqual(["0.49.15"])
  })

  it("when nothing was adopted, rollback has nothing to restore", async () => {
    const { code, report } = await follow("--rollback")
    expect([code, failure(report)]).toEqual([1, "no previous entry is recorded: follow has not adopted anything"])
  })

  it("refuses a previous entry whose folder no longer exists, changing nothing", async () => {
    expect((await follow()).report.outcome).toBe("adopted")
    expect((await follow("--rollback")).report.outcome).toBe("rolled-back")
    const missing = installed("0.49.35")
    // Step 11.6 deletes the old store: the whole version folder is gone, not just the plugin root.
    rmSync(path.dirname(path.dirname(path.dirname(missing))), { recursive: true, force: true })
    const before = readFileSync(configFile(), "utf8")
    const back = await follow("--rollback")
    expect([back.code, back.report.outcome, failure(back.report), entry()]).toEqual([1, "stopped", `previous entry ${missing} no longer exists`, PINNED])
    expect(readFileSync(configFile(), "utf8")).toBe(before)
    expect(installs()).toEqual([])
    // The refusal records nothing to roll back to, so a second attempt reports the same stop.
    expect(failure((await follow("--rollback")).report)).toBe(`previous entry ${missing} no longer exists`)
  })
})
