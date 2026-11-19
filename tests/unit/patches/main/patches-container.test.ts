import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import path from "node:path"
import type { FilesPort } from "@session-manager/domain/ports/outbound/FilesPort"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"
import { buildContainer } from "@session-manager/main/cli-container"
import { patchesPlatformAdapters } from "@session-manager/main/cli/platform"
import { createPatchCommands } from "@session-manager/main/patches-container"
import { resolvePatchPaths } from "@session-manager/main/cli/patches-paths"
import { PATCHES } from "@session-manager/domain/patch-definitions/index"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { currentPlatform } from "@test/support/platform"
import { Sandbox } from "@test/support/patches/sandbox"

let box: Sandbox
beforeEach(() => {
  box = new Sandbox()
})
afterEach(() => box.dispose())

describe("resolvePatchPaths", () => {
  it("uses the XDG defaults under HOME, Magic Context's log rule, and the system tools", () => {
    expect(resolvePatchPaths({}, "/home/u")).toEqual({
      installations: "/home/u/.cache/opencode/npm/@cortexkit",
      opencodeConfig: "/home/u/.config/opencode/opencode.jsonc",
      tuiConfig: "/home/u/.config/opencode/tui.jsonc",
      magicContextConfig: "/home/u/.config/cortexkit/magic-context.jsonc",
      magicContextLog: "/tmp/opencode2/magic-context/magic-context.log",
      backups: "/home/u/.local/share/opencode-session-manager/patches/backups",
      auditLog: "/home/u/.local/state/opencode-session-manager/patches/audit.log",
      state: "/home/u/.local/state/opencode-session-manager/patches",
      notifyCommand: undefined,
      proc: "/proc",
      installs: "/home/u/.local/share/opencode-session-manager/patches/installs",
      derivedReleases: "/home/u/.local/share/opencode-session-manager/patches/derived-releases.json",
      evidence: "/home/u/.local/state/opencode-session-manager/patches/evidence",
      lock: "/home/u/.local/state/opencode-session-manager/patches/follow.lock",
      registry: "https://registry.npmjs.org",
      npmCache: "/home/u/.npm/_cacache",
      opencode: "opencode",
      service: "/home/u/.local/state/opencode/service.json",
      sandboxes: "/tmp",
      timing: { timeoutMs: 120_000, pollMs: 2_000, settleMs: 5_000 },
    })
  })

  it("follows the environment", () => {
    const paths = resolvePatchPaths(
      { XDG_CACHE_HOME: "/c", XDG_CONFIG_HOME: "/f", XDG_DATA_HOME: "/d", XDG_STATE_HOME: "/s", TMPDIR: "/t", OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN: "/n", OPENCODE_SESSION_MANAGER_PATCHES_PROC: "/p" },
      "/home/u",
    )
    expect([paths.installations, paths.opencodeConfig, paths.backups, paths.auditLog, paths.magicContextLog, paths.notifyCommand, paths.proc]).toEqual([
      "/c/opencode/npm/@cortexkit",
      "/f/opencode/opencode.jsonc",
      "/d/opencode-session-manager/patches/backups",
      "/s/opencode-session-manager/patches/audit.log",
      "/t/opencode2/magic-context/magic-context.log",
      "/n",
      "/p",
    ])
    expect(resolvePatchPaths({ MAGIC_CONTEXT_LOG_PATH: "  /x/mc.log ", TMPDIR: "/t" }, "/h").magicContextLog).toBe("/x/mc.log")
    const follow = resolvePatchPaths(
      { XDG_STATE_HOME: "/s", TMPDIR: "/t", OPENCODE_SESSION_MANAGER_PATCHES_REGISTRY: "http://r", OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN: "/oc", OPENCODE_SESSION_MANAGER_PATCHES_TIMEOUT_MS: "1500", OPENCODE_SESSION_MANAGER_PATCHES_SETTLE_MS: "20" },
      "/h",
    )
    expect([follow.registry, follow.opencode, follow.service, follow.sandboxes, follow.timing]).toEqual(["http://r", "/oc", "/s/opencode/service.json", "/t", { timeoutMs: 1500, pollMs: 1500, settleMs: 20 }])
    expect(resolvePatchPaths({ OPENCODE_SESSION_MANAGER_PATCHES_TIMEOUT_MS: "soon", OPENCODE_SESSION_MANAGER_PATCHES_SETTLE_MS: "-1" }, "/h").timing).toEqual({ timeoutMs: 120_000, pollMs: 2_000, settleMs: 5_000 })
    expect(resolvePatchPaths({ MAGIC_CONTEXT_LOG_PATH: "   " }, "/h").magicContextLog).toBe("/tmp/opencode2/magic-context/magic-context.log")
  })
})

describe("composition", () => {
  it("wires every command", async () => {
    box.install("0.47.0")
    box.pin("0.47.0")
    const commands = createPatchCommands(
      resolvePatchPaths(box.env() as CliEnvironment, box.home),
      PATCHES,
      await patchesPlatformAdapters(currentPlatform(), { proc: "/proc", notifyCommand: undefined }),
    )
    expect(Object.keys(commands).sort()).toEqual(["apply", "check", "effect", "follow", "inspect", "notify", "rollback", "status", "undo"])
    expect((await commands.check.check()).problems.map((p) => p.state)).toEqual(["not-applied", "unchecked-version", "unchecked-version", "unchecked-version", "unchecked-version"])
  })

  it("lets a declared seam wrap the files adapter", async () => {
    box.install("0.47.0")
    box.pin("0.47.0")
    const reads: string[] = []
    const output = new FakeOutput()
    const cli = await buildContainer(box.env() as CliEnvironment, {
      output,
      patches: {
        files: (real: FilesPort) => ({
          read: async (file: string) => (reads.push(file), real.read(file)),
          replace: (file: string, bytes: Uint8Array) => real.replace(file, bytes),
          list: (directory: string, extension: string) => real.list(directory, extension),
        }),
      },
    })
    await cli.run(["patches", "status"])
    expect(reads.map((file) => path.basename(file))).toEqual(["server-50hvkg3v.js", "index-m5fe6jch.js"])
  })
})
