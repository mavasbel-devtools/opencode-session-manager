import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import type { PatchDefinition, PatchedFile } from "@session-manager/domain/model/patches/Patch"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { buildContainer } from "@session-manager/main/cli-container"
import { bootstrap } from "@session-manager/main/cli/cli"
import { patchesPlatformAdapters, type PatchesPlatformSettings } from "@session-manager/main/cli/platform"
import { createPatchCommands, type Seams } from "@session-manager/main/patches-container"
import { resolvePatchPaths } from "@session-manager/main/cli/patches-paths"
import manifest from "@package-json"
import { executeThresholdMin } from "@session-manager/domain/patch-definitions/execute-threshold-min"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { currentPlatform } from "@test/support/platform"
import { removeTemporarySync } from "@test/support/live/process"
import { sha } from "@test/support/patches/fakes"
import { Sandbox, write } from "@test/support/patches/sandbox"

const V2 = "dist/v2/server-50hvkg3v.js"
const [fileV2, fileV1] = executeThresholdMin.releases[0]!.files as [PatchedFile, PatchedFile]
const define = (files: PatchedFile[]): PatchDefinition => ({ ...executeThresholdMin, id: "crafted", releases: [{ version: "0.47.0", files }] })

let box: Sandbox
let root: string
beforeEach(() => {
  box = new Sandbox()
  root = box.install("0.47.0")
  box.pin("0.47.0")
})
afterEach(() => box.dispose())

const adapters = (settings: PatchesPlatformSettings = { proc: "/proc", notifyCommand: undefined }) =>
  patchesPlatformAdapters(currentPlatform(), settings)
const commands = async (patches: readonly PatchDefinition[], seams: Seams = {}) =>
  createPatchCommands(resolvePatchPaths(box.env() as CliEnvironment, box.home), patches, await adapters(), seams)

describe("refusals on the real files, through the wired program", () => {
  it("refuses a definition whose count or recorded result does not match the real file, writing nothing", async () => {
    const wrongCount = await commands([define([{ ...fileV2, replacements: [{ ...fileV2.replacements[0]!, count: 4 }] }])])
    expect((await wrongCount.apply.apply({})).results[0]!.reason).toBe(`${V2}: expected 4 × "min(20).max(90", found 3`)
    const wrongAfter = await commands([define([{ ...fileV2, after: "0".repeat(64) }])])
    expect((await wrongAfter.apply.apply({})).results[0]!.reason).toBe(
      `${V2}: the patched result has sha256 ${fileV2.after}, not the recorded ${"0".repeat(64)}`,
    )
    expect(sha(readFileSync(path.join(root, V2)))).toBe(fileV2.before)
  })

  it("refuses an undo it cannot rebuild exactly", async () => {
    // The installed file is the recorded "after", but neither a backup nor the reversal gives the recorded "before".
    const unreachable = await commands([define([{ ...fileV2, before: "1".repeat(64) }])])
    writeFileSync(path.join(root, V2), readFileSync(path.join(root, V2), "utf8").replaceAll("min(20).max(90", "min(1).max(90"))
    expect((await unreachable.undo.undo({})).results[0]!.reason).toBe(
      `${V2}: no intact backup and the replacements cannot be reversed to sha256 ${"1".repeat(64)}`,
    )
    const uncountable = await commands([define([{ ...fileV2, replacements: [{ ...fileV2.replacements[0]!, count: 7 }] }])])
    expect((await uncountable.undo.undo({})).results[0]!.outcome).toBe("refused")
  })

  it("shows where a find text is absent, and paths the checked release does not change", async () => {
    // "crafted" also lists an older release: inspect compares with the newest one.
    const crafted = define([fileV2])
    const withOlder = { ...crafted, releases: [{ version: "0.40.0", files: [] }, ...crafted.releases] }
    const absent = { ...define([{ ...fileV1, replacements: [{ find: "no such text", replace: "no such replacement", count: 1 }] }]), id: "absent" }
    const report = await (await commands([withOlder, absent])).inspect.inspect("0.47.0")
    expect(report.findings.map((f) => [f.patch, f.files.map((file) => [path.basename(file.path), file.expected])])).toEqual([
      ["crafted", [["index-m5fe6jch.js", null], ["server-50hvkg3v.js", 3]]],
      ["absent", []],
    ])
  })
})

describe("failures while writing, through the declared files seam", () => {
  it("puts the first file back when the second reads back wrong, and reports a failed restore", async () => {
    let corruptNext = true
    const seams: Seams = {
      files: (real: FilesPort) => ({
        read: async (file: string) => {
          const bytes = await real.read(file)
          if (file.endsWith("index-m5fe6jch.js") && corruptNext && bytes !== null && sha(bytes) === fileV1.after) return new TextEncoder().encode("x")
          return bytes
        },
        replace: (file: string, bytes: Uint8Array) => real.replace(file, bytes),
        list: (directory: string, extension: string) => real.list(directory, extension),
      }),
    }
    const result = (await (await commands([executeThresholdMin], seams)).apply.apply({})).results[0]!
    expect([result.outcome, result.reason]).toEqual(["failed", `dist/index-m5fe6jch.js: read back ${sha("x")}, expected ${fileV1.after}`])
    expect([sha(readFileSync(path.join(root, V2))), sha(readFileSync(path.join(root, "dist/index-m5fe6jch.js")))]).toEqual([fileV2.before, fileV1.before])

    corruptNext = false
    const failingRestore: Seams = {
      files: (real: FilesPort) => {
        let writes = 0
        return {
          read: async (file: string) => ((writes === 1 && file.endsWith("server-50hvkg3v.js")) ? new TextEncoder().encode("y") : real.read(file)),
          replace: async (file: string, bytes: Uint8Array) => {
            writes += 1
            if (writes > 1) throw new Error("disk full")
            await real.replace(file, bytes)
          },
          list: (directory: string, extension: string) => real.list(directory, extension),
        }
      },
    }
    const failed = (await (await commands([executeThresholdMin], failingRestore)).apply.apply({})).results[0]!
    expect(failed.reason).toBe(`${V2}: read back ${sha("y")}, expected ${fileV2.after}; restoring ${V2} failed: disk full`)
  })

  it("fails without touching anything when the package folder is read-only", async () => {
    chmodSync(path.join(root, "dist", "v2"), 0o555)
    const output = new FakeOutput()
    expect(await (await buildContainer(box.env() as CliEnvironment, { output })).run(["patches", "apply"])).toBe(1)
    expect(output.lines[0]).toContain(`): failed — EACCES`)
    expect(sha(readFileSync(path.join(root, V2)))).toBe(fileV2.before)
  })
})

describe("unreadable places stop the program with the system's error", () => {
  const run = async (argv: string[]) => {
    const output = new FakeOutput()
    const code = await (await buildContainer(box.env() as CliEnvironment, { output })).run(["patches", ...argv])
    return { code, out: output.lines }
  }

  it("an installed file that is a folder", async () => {
    removeTemporarySync(path.join(root, V2))
    mkdirSync(path.join(root, V2))
    await expect(run(["status"])).rejects.toThrow(/EISDIR/)
  })

  it("a backup folder that is a file: apply fails before writing anything", async () => {
    write(path.join(box.data, "opencode-session-manager", "patches", "backups"), "")
    expect((await run(["apply"])).out[0]).toContain("): failed — ENOTDIR")
    expect(sha(readFileSync(path.join(root, V2)))).toBe(fileV2.before)
  })

  it("an opencode.jsonc that is a folder", async () => {
    removeTemporarySync(path.join(box.config, "opencode", "opencode.jsonc"))
    mkdirSync(path.join(box.config, "opencode", "opencode.jsonc"))
    await expect(run(["status"])).rejects.toThrow(/EISDIR/)
  })

  it("a state folder that is a file", async () => {
    write(path.join(box.state, "opencode-session-manager", "patches"), "")
    await expect(
      (await buildContainer(box.env({ OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN: box.notifier().command }) as CliEnvironment)).run(["patches", "notify"]),
    ).rejects.toThrow(/ENOTDIR/)
  })

  it("an npm cache that is a file, and a package.json that is a folder", async () => {
    removeTemporarySync(box.installations)
    write(box.installations, "")
    await expect(run(["status"])).rejects.toThrow(/ENOTDIR/)
    removeTemporarySync(box.installations)
    const other = box.install("0.47.0", "0.46.0")
    mkdirSync(path.join(box.installations, "unrelated@1.0.0"))
    write(path.join(box.installations, "opencode-magic-context@0.1.0", "node_modules", "@cortexkit", "opencode-magic-context", "package.json"), '{"name":"x","version":"0.1.0"}')
    expect((await run(["status"])).code).toBe(0)
    removeTemporarySync(path.join(other, "package.json"))
    mkdirSync(path.join(other, "package.json"))
    await expect(run(["status"])).rejects.toThrow(/EISDIR/)
  })

  it("a derived-releases.json that is a folder", async () => {
    const derived = path.join(box.data, "opencode-session-manager", "patches", "derived-releases.json")
    removeTemporarySync(derived)
    mkdirSync(path.dirname(derived), { recursive: true })
    mkdirSync(derived)
    await expect(run(["status"])).rejects.toThrow(/EISDIR/)
  })
})

describe("the process entry", () => {
  it("writes to the process's real streams", async () => {
    const out = spyOn(process.stdout, "write").mockImplementation(() => true)
    const err = spyOn(process.stderr, "write").mockImplementation(() => true)
    try {
      const cli = await buildContainer(box.env() as CliEnvironment)
      expect([await cli.run(["patches", "--version"]), await cli.run(["patches", "bogus"])]).toEqual([0, 2])
      expect([out.mock.calls, err.mock.calls]).toEqual([[ [`opencode-session-manager ${manifest.version}\n`] ], [["usage error: unknown command bogus\n"], ["run with --help for usage\n"]]])
    } finally {
      out.mockRestore()
      err.mockRestore()
    }
  })

  it("reports usage errors on stderr with exit 2 through the entry", async () => {
    const err = spyOn(process.stderr, "write").mockImplementation(() => true)
    try {
      await expect(bootstrap(["patches", "bogus"], box.env() as CliEnvironment)).resolves.toBe(2)
      expect(err.mock.calls).toEqual([["usage error: unknown command bogus\n"], ["run with --help for usage\n"]])
    } finally {
      err.mockRestore()
    }
  })
})
