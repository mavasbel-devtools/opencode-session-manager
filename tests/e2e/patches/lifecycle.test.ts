import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { buildContainer } from "@session-manager/main/cli-container"
import { executeThresholdMin } from "@session-manager/domain/patch-definitions/execute-threshold-min"
import { PATCHES } from "@session-manager/domain/patch-definitions/index"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { Sandbox, write } from "@test/support/patches/sandbox"
import { sha } from "@test/support/patches/fakes"

const V2 = "dist/v2/server-50hvkg3v.js"
const V1 = "dist/index-m5fe6jch.js"
const [fileV2, fileV1] = executeThresholdMin.releases[0]!.files

let box: Sandbox
beforeEach(() => {
  box = new Sandbox()
})
afterEach(() => box.dispose())

async function run(...argv: string[]) {
  const output = new FakeOutput()
  const errors: string[] = []
  const write = spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    errors.push(String(chunk).replace(/\n$/, ""))
    return true
  })
  try {
    const code = await (await buildContainer(box.env() as CliEnvironment, { output })).run(["patches", ...argv])
    return { code, out: output.text(), err: errors.join("\n") }
  } finally {
    write.mockRestore()
  }
}
const ETM = ["--patch", "execute-threshold-min"]
const json = async (...argv: string[]) => JSON.parse((await run(...argv, "--json")).out)
const shaOf = (root: string, file: string) => sha(readFileSync(path.join(root, file)))

const count = (text: string, part: string) => text.split(part).length - 1

for (const version of ["0.48.0", "0.49.0", "0.49.2", "0.49.7", "0.49.12", "0.49.13", "0.49.15", "0.49.19", "0.49.35", "0.49.41", "0.49.42", "0.49.43", "0.49.50", "0.49.55", "0.49.56"]) {
  describe(`the program on a copy of the real Magic Context ${version}`, () => {
    it(`applies and undoes every patch checked against ${version} on its own files, checked against their published checksums`, async () => {
      // A patch is checked only against some versions; on the others check reports it as an unchecked version.
      const checked = PATCHES.filter((patch) => patch.releases.some((release) => release.version === version))
      const unchecked = PATCHES.filter((patch) => !checked.includes(patch)).map((patch) => [patch.id, "unchecked-version"])
      const root = box.install(version)
      box.pin(version)
      // A file two patches change goes through them in order: each release reads what the last one left.
      const current = new Map<string, string>()
      const steps: { patch: string; files: readonly { path: string; before: string; after: string; replacements: readonly { replace: string; count: number }[] }[]; before: Map<string, string> }[] = []
      for (const patch of checked) {
        const files = patch.releases.find((release) => release.version === version)!.files
        expect(files.map((file) => shaOf(root, file.path))).toEqual(files.map((file) => current.get(file.path) ?? file.before))
        expect((await run("apply", "--patch", patch.id)).code).toBe(0)
        expect(files.map((file) => shaOf(root, file.path))).toEqual(files.map((file) => file.after))
        for (const file of files) {
          const text = readFileSync(path.join(root, file.path), "utf8")
          for (const replacement of file.replacements) expect(count(text, replacement.replace)).toBe(replacement.count)
        }
        steps.push({ patch: patch.id, files, before: new Map(current) })
        for (const file of files) current.set(file.path, file.after)
      }
      if (unchecked.length === 0) {
        expect((await run("check")).out).toBe(`OK: every patch is applied on the loaded Magic Context (${version})`)
      } else {
        expect((await json("check")).problems.map((p: { patch: string; state: string }) => [p.patch, p.state])).toEqual(unchecked)
      }
      for (const step of [...steps].reverse()) {
        expect((await run("undo", "--patch", step.patch)).code).toBe(0)
        expect(step.files.map((file) => shaOf(root, file.path))).toEqual(step.files.map((file) => step.before.get(file.path) ?? file.before))
      }
    })
  })
}

describe("the program on a copy of the real Magic Context 0.47.0", () => {
  it("applies, checks, re-applies, undoes and re-applies, with backups and an audit trail", async () => {
    const root = box.install("0.47.0")
    box.install("0.47.0", "latest", "1700000000000")
    box.pin("0.47.0")

    const before = await json("status")
    expect(before.loadedSpec).toBe("0.47.0")
    expect(before.patches.map((p: { state: string; installation: { loaded: boolean } }) => [p.state, p.installation.loaded])).toEqual([
      ["not-applied", true],
      ["unchecked-version", true],
      ["unchecked-version", true],
      ["unchecked-version", true],
      ["unchecked-version", true],
      ["not-applied", false],
      ["unchecked-version", false],
      ["unchecked-version", false],
      ["unchecked-version", false],
      ["unchecked-version", false],
    ])
    expect((await run("check")).code).toBe(1)

    const applied = await run("apply", ...ETM)
    expect([applied.code, shaOf(root, V2), shaOf(root, V1)]).toEqual([0, fileV2!.after, fileV1!.after])
    expect(readFileSync(path.join(root, V2), "utf8")).toContain("number2().min(1).max(90, EXECUTE_THRESHOLD_CAP_MESSAGE)")
    // The four other patches were never checked against 0.47.0, so check reports only them.
    expect((await json("check")).problems.map((p: { patch: string; state: string }) => [p.patch, p.state])).toEqual([
      ["no-session-model-fallback", "unchecked-version"],
      ["refusal-recovery", "unchecked-version"],
      ["fold-identity-stable", "unchecked-version"],
      ["fold-provenance-heal", "unchecked-version"],
    ])
    expect((await json("apply", ...ETM)).results[0].outcome).toBe("already-applied")

    const backups = path.join(box.data, "opencode-session-manager", "patches", "backups", "0.47.0", "execute-threshold-min")
    expect(sha(readFileSync(path.join(backups, `${V2}@${fileV2!.before}`)))).toBe(fileV2!.before)

    const undone = await run("undo", ...ETM)
    expect([undone.code, shaOf(root, V2), shaOf(root, V1)]).toEqual([0, fileV2!.before, fileV1!.before])
    expect((await json("undo", ...ETM)).results[0].outcome).toBe("already-original")
    expect((await run("apply", ...ETM)).code).toBe(0)
    expect(readdirSync(path.join(backups, "dist")).sort()).toEqual(["index-m5fe6jch.js@6abe7e8c60c97bf35e9cf992ad9fe9936dc0557303a445a8c27859b47c94c3ba", "v2"])

    const audit = readFileSync(path.join(box.state, "opencode-session-manager", "patches", "audit.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l))
    expect(audit.map((r) => `${r.action}:${r.outcome}:${path.basename(r.path)}`)).toEqual([
      "apply:applied:server-50hvkg3v.js",
      "apply:applied:index-m5fe6jch.js",
      "apply:already-applied:server-50hvkg3v.js",
      "apply:already-applied:index-m5fe6jch.js",
      "undo:reverted:server-50hvkg3v.js",
      "undo:reverted:index-m5fe6jch.js",
      "undo:already-original:server-50hvkg3v.js",
      "undo:already-original:index-m5fe6jch.js",
      "apply:applied:server-50hvkg3v.js",
      "apply:applied:index-m5fe6jch.js",
    ])

    // The other copy is only touched when asked for by version, and both copies of 0.47.0 are then patched.
    expect((await json("apply", "--version", "0.47.0", "--patch", "execute-threshold-min")).results.map((r: { outcome: string }) => r.outcome)).toEqual([
      "already-applied",
      "applied",
    ])
  })

  it("reports partial when only some files of a patch are applied", async () => {
    const root = box.install("0.47.0")
    box.pin("0.47.0")
    const file = path.join(root, V1)
    const original = readFileSync(file, "utf8")
    expect((await run("apply", ...ETM)).code).toBe(0)
    writeFileSync(file, original)
    const status = await json("status")
    const patch = status.patches.find((p: { patch: string }) => p.patch === "execute-threshold-min")
    expect(patch.state).toBe("partial")
    expect(patch.files.map((f: { path: string; state: string }) => [path.basename(f.path), f.state]).sort()).toEqual([
      ["index-m5fe6jch.js", "original"],
      ["server-50hvkg3v.js", "patched"],
    ])
  })

  it("undoes by reversing the replacements when the backup was damaged", async () => {    const root = box.install("0.47.0")
    box.pin("0.47.0")
    await run("apply", ...ETM)
    const backup = path.join(box.data, "opencode-session-manager", "patches", "backups", "0.47.0", "execute-threshold-min", `${V2}@${fileV2!.before}`)
    chmodSync(backup, 0o644)
    writeFileSync(backup, "damaged")
    expect((await run("undo", ...ETM)).code).toBe(0)
    expect(shaOf(root, V2)).toBe(fileV2!.before)
  })

  it("refuses a file changed by something else, and a version the patch was not checked against", async () => {
    const root = box.install("0.47.0")
    box.pin("0.47.0")
    writeFileSync(path.join(root, V1), `${readFileSync(path.join(root, V1), "utf8")}\n// edited`)
    const refused = await run("apply", ...ETM)
    expect([refused.code, refused.out.split("\n")[0]]).toEqual([
      1,
      `execute-threshold-min on 0.47.0 (${root}): refused — ${V1} matches neither recorded checksum (sha256 ${shaOf(root, V1)})`,
    ])
    expect(shaOf(root, V2)).toBe(fileV2!.before)

    // A version nobody checked yet, made from the newest checked one's files: inspect compares with that one.
    const newer = box.install("0.49.43", "0.50.0")
    write(path.join(newer, "package.json"), JSON.stringify({ name: "@cortexkit/opencode-magic-context", version: "0.50.0" }))
    box.pin("0.50.0")
    expect((await json("check")).problems.map((p: { state: string }) => p.state)).toEqual(["unchecked-version", "unchecked-version", "unchecked-version", "unchecked-version", "unchecked-version"])
    expect((await run("apply", ...ETM)).out).toContain("has not been checked against Magic Context 0.50.0; review it with `inspect --version 0.50.0`")
    const inspected = await run("inspect", "--version", "0.50.0")
    expect(inspected.out.split("\n").slice(0, 3)).toEqual([
      `Magic Context 0.50.0: ${newer}`,
      'execute-threshold-min (checked against 0.49.56): "min(20).max(90"',
      "    dist/index-c5dzns43.js: 3 to replace (a path the checked version does not change), 0 already replaced, sha256 e08252cb38e1786f (differs from the checked version)",
    ])
  })

  it("explains what is missing: no configuration, an uninstalled version, an unknown patch", async () => {
    expect(await run("status")).toEqual({
      code: 0,
      out: "OpenCode loads Magic Context: (not configured in opencode.jsonc)\ninstalled copies:\n  (none)\npatches:",
      err: "",
    })
    expect((await run("check")).out).toBe("NOT OK: Magic Context is not configured in opencode.jsonc")
    expect(await run("apply", ...ETM)).toEqual({ code: 1, out: "", err: "error: no installed Magic Context for the configured spec (none: not in opencode.jsonc)" })
    box.pin("0.47.0")
    expect((await run("check")).out).toBe("NOT OK: Magic Context 0.47.0 is configured but not installed yet (start OpenCode once)")
    expect((await run("undo", "--version", "0.47.0")).err).toBe("error: Magic Context 0.47.0 is not installed")
    expect((await run("inspect", "--version", "0.47.0")).err).toBe("error: Magic Context 0.47.0 is not installed")
    box.install("0.47.0")
    expect(await run("apply", "--patch", "nope")).toEqual({
      code: 2,
      out: "",
      err: "usage error: unknown patch nope; known: execute-threshold-min, no-session-model-fallback, refusal-recovery, fold-identity-stable, fold-provenance-heal\nrun with --help for usage",
    })
    expect((await run("--help")).code).toBe(0)
    expect((await run("frobnicate")).code).toBe(2)
  })
})

describe("notify", () => {
  it("notifies once while a patch is missing, and stays quiet once it is applied", async () => {
    box.install("0.49.50")
    box.pin("0.49.50")
    const notifier = box.notifier()
    const env = { OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN: notifier.command }
    const notify = async () => {
      const output = new FakeOutput()
      const code = await (await buildContainer({ ...box.env(), ...env } as CliEnvironment, { output })).run(["patches", "notify"])
      return [code, output.text()]
    }
    const missing = "execute-threshold-min on 0.49.50: not-applied; no-session-model-fallback on 0.49.50: not-applied; refusal-recovery on 0.49.50: not-applied; fold-identity-stable on 0.49.50: not-applied; fold-provenance-heal on 0.49.50: not-applied"
    expect(await notify()).toEqual([1, `notified: ${missing}. Run \`opencode-session-manager patches status\`.`])
    expect(await notify()).toEqual([1, `already notified: ${missing}. Run \`opencode-session-manager patches status\`.`])
    await run("apply")
    expect(await notify()).toEqual([0, "OK: nothing to notify"])
    expect(readFileSync(notifier.calls, "utf8").trim().split("\n")).toHaveLength(1)
    expect(existsSync(path.join(box.state, "opencode-session-manager", "patches", "last-notification"))).toBe(false)
  })
})
