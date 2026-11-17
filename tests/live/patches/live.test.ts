import { describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pinnedMagicContext } from "@session-manager/domain/services/Jsonc"
import manifest from "@package-json"
import { onlyOn } from "@test/support/platform"
import { removeTemporarySync } from "@test/support/live/process"

/**
 * Opt-in (`bun run test:live`): runs the INSTALLED program against this machine. Everything is
 * read-only except the watch test, which creates one empty folder in OpenCode's npm cache for a
 * moment (no package.json, so nothing treats it as an installation) and removes it, and the follow
 * test, which runs against the real npm registry, the real Arborist and the real OpenCode binary but
 * entirely inside a throwaway home (HOME, XDG folders, TMPDIR), with a copy of the real
 * magic-context.jsonc; the real opencode.jsonc and the running OpenCode are never touched.
 */
const HOME = os.homedir()
const BIN = path.join(process.env.OPENCODE_SESSION_MANAGER_BIN_DIR || path.join(HOME, ".local", "bin"), "opencode-session-manager")
const UNIT = "opencode-session-manager-patches"

function cli(...argv: string[]) {
  const run = spawnSync(BIN, ["patches", ...argv], { encoding: "utf8", cwd: os.tmpdir() })
  return { code: run.status, out: run.stdout, err: run.stderr }
}
const systemctl = (...args: string[]) => spawnSync("systemctl", ["--user", ...args], { encoding: "utf8" }).stdout.trim()

describe("the installed program on this machine", () => {
  it("is the version of this checkout", () => {
    expect(cli("--version")).toEqual({ code: 0, out: `opencode-session-manager ${manifest.version}\n`, err: "" })
  })

  it("finds the copy opencode.jsonc pins", () => {
    const status = JSON.parse(cli("status", "--json").out)
    const pinned = pinnedMagicContext(readFileSync(path.join(HOME, ".config", "opencode", "opencode.jsonc"), "utf8"))
    expect(status.loadedSpec).toBe(pinned)
    expect(status.installations.filter((i: { loaded: boolean }) => i.loaded).length).toBeGreaterThan(0)
  })

  it("checks consistently with status", () => {
    const status = JSON.parse(cli("status", "--json").out)
    const check = cli("check", "--json")
    const allApplied = status.patches.filter((p: { installation: { loaded: boolean } }) => p.installation.loaded).every((p: { state: string }) => p.state === "applied")
    expect([check.code === 0, JSON.parse(check.out).ok]).toEqual([allApplied, allApplied])
  })

  it("sees the configured threshold in use whenever the loaded copy is the patched one", () => {
    // OpenCode reloads a changed plugin folder without restarting, so "patched after the process
    // started" no longer means the running process is unpatched: the log is what proves it either way.
    const status = JSON.parse(cli("status", "--json").out)
    const loaded = status.patches.filter((p: { installation: { loaded: boolean } }) => p.installation.loaded)
    const effect = JSON.parse(cli("effect", "--json").out)
    if (loaded.every((p: { state: string }) => p.state === "applied")) {
      expect(effect.summary.effectiveThreshold).not.toBeNull()
      expect([effect.summary.rejections, effect.verdict]).toEqual([0, "respected"])
    } else {
      // The loaded copy is unpatched: the log must still show the rejection.
      expect(effect.verdict === "respected").toBe(false)
    }
  })
})

describe("follow against the real registry, Arborist and OpenCode, in a throwaway home", () => {
  it("adopts the published version already patched, proved by an isolated opencode serve, and rolls back", () => {
    const home = path.join("/tmp/opencode", `mc-patches-live-follow-${process.pid}`)
    removeTemporarySync(home)
    const config = path.join(home, ".config", "opencode", "opencode.jsonc")
    mkdirSync(path.dirname(config), { recursive: true })
    mkdirSync(path.join(home, ".config", "cortexkit"), { recursive: true })
    mkdirSync(path.join(home, "tmp"), { recursive: true })
    const pinned = pinnedMagicContext(readFileSync(path.join(HOME, ".config", "opencode", "opencode.jsonc"), "utf8"))!
    const version = pinned.startsWith("/") ? JSON.parse(readFileSync(path.join(pinned, "package.json"), "utf8")).version : pinned
    writeFileSync(config, `{\n  // live follow test\n  "plugins": ["@cortexkit/opencode-magic-context@0.0.1"],\n}\n`)
    copyFileSync(path.join(HOME, ".config", "cortexkit", "magic-context.jsonc"), path.join(home, ".config", "cortexkit", "magic-context.jsonc"))
    const env = {
      HOME: home,
      PATH: "/usr/bin:/bin",
      TMPDIR: path.join(home, "tmp"),
      XDG_CONFIG_HOME: path.join(home, ".config"),
      XDG_DATA_HOME: path.join(home, ".local", "share"),
      XDG_STATE_HOME: path.join(home, ".local", "state"),
      XDG_CACHE_HOME: path.join(home, ".cache"),
      // The binary the user actually runs: the installer's default, or the one the caller points at.
      OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN: process.env.OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN ?? path.join(HOME, ".opencode", "bin", "opencode"),
      OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN: "/bin/true",
    }
    const follow = (...argv: string[]) => {
      const run = spawnSync(BIN, ["patches", "follow", ...argv, "--json"], { encoding: "utf8", cwd: home, env, timeout: 600_000 })
      return { code: run.status, report: JSON.parse(run.stdout) }
    }
    try {
      const adopted = follow("--version", version)
      expect([adopted.code, adopted.report.outcome]).toEqual([0, "adopted"])
      expect(adopted.report.steps.map((s: { step: string; ok: boolean }) => `${s.step}:${s.ok}`)).toEqual(
        ["detect", "stage", "locate", "patch", "prove", "publish", "confirm", "record"].map((step) => `${step}:true`),
      )
      const root = path.join(home, ".local", "share", "opencode-session-manager", "patches", "installs", version, "node_modules", "@cortexkit", "opencode-magic-context")
      expect(pinnedMagicContext(readFileSync(config, "utf8"))).toBe(root)
      expect(adopted.report.steps.find((s: { step: string }) => s.step === "prove").detail).toContain('0 "config reload failed"')
      const back = follow("--rollback")
      expect([back.code, back.report.outcome, pinnedMagicContext(readFileSync(config, "utf8"))]).toEqual([0, "rolled-back", "0.0.1"])
      expect(readdirSync(path.join(home, "tmp")).filter((name) => name.startsWith("mc-patches-sandbox-"))).toEqual([])
    } finally {
      removeTemporarySync(home)
    }
  }, 600_000)
})

describe("the systemd watch", () => {
  it.skipIf(onlyOn("linux"))("is installed, valid, enabled and active (linux only)", () => {
    const units = ["service", "path", "timer"].map((kind) => path.join(HOME, ".config", "systemd", "user", `${UNIT}.${kind}`))
    expect(spawnSync("systemd-analyze", ["--user", "verify", ...units], { encoding: "utf8" }).status).toBe(0)
    expect([systemctl("is-enabled", `${UNIT}.path`), systemctl("is-active", `${UNIT}.path`)]).toEqual(["enabled", "active"])
    expect([systemctl("is-enabled", `${UNIT}.timer`), systemctl("is-active", `${UNIT}.timer`)]).toEqual(["enabled", "active"])
  })

  it.skipIf(onlyOn("linux"))("runs the check when a new folder appears in OpenCode's Magic Context cache (linux only)", async () => {
    // A run already in progress (its 30 s wait) would absorb the trigger: start from an idle service.
    const idle = async () => {
      for (let i = 0; i < 60 && systemctl("is-active", `${UNIT}.service`) !== "inactive"; i += 1) await Bun.sleep(1000)
    }
    await idle()
    const before = systemctl("show", "-p", "InactiveExitTimestampMonotonic", "--value", `${UNIT}.service`)
    const probe = path.join(HOME, ".cache", "opencode", "npm", "@cortexkit", "opencode-magic-context@0.0.0-watch-probe")
    mkdirSync(probe)
    try {
      let after = before
      for (let i = 0; i < 20 && after === before; i += 1) {
        await Bun.sleep(1000)
        after = systemctl("show", "-p", "InactiveExitTimestampMonotonic", "--value", `${UNIT}.service`)
      }
      expect(after).not.toBe(before)
    } finally {
      removeTemporarySync(probe)
    }
    // Wait for that run (30 s settle + check) to finish; with every patch applied it notifies nothing.
    await idle()
    expect(systemctl("show", "-p", "Result", "--value", `${UNIT}.service`)).toBe("success")
  })
})
