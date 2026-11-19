import { describe, expect, it } from "bun:test"
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { onlyOn } from "@test/support/platform"
import { LABEL, NAME, runWatch } from "../../../scripts/watch.mjs"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"

const root = path.resolve(import.meta.dir, "../../..")

/** A stand-in executable: a node script with `body`, recorded through `STANDIN_ARGV_LOG`/`STANDIN_STATE_DIR`. */
function stub(directory: string, name: string, body: string): void {
  const file = path.join(directory, name)
  writeFileSync(file, `#!${process.execPath}\n${body}\n`)
  chmodSync(file, 0o755)
}

function binWith(workspace: string): string {
  const bin = path.join(workspace, "bin")
  mkdirSync(bin, { recursive: true })
  const record = `require("node:fs").appendFileSync(process.env.STANDIN_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + "\\n")\n`
  stub(
    bin,
    "systemctl",
    `${record}const args = process.argv.slice(2)\n` +
      `if (args.includes("is-enabled")) process.stdout.write("enabled")\n` +
      `else if (args.includes("is-active")) process.stdout.write("active")\n`,
  )
  stub(bin, "systemd-analyze", record)
  stub(bin, "plutil", record)
  stub(
    bin,
    "launchctl",
    `${record}const fs = require("node:fs")\n` +
      `const marker = require("node:path").join(process.env.STANDIN_STATE_DIR, "launchd-loaded")\n` +
      `const args = process.argv.slice(2)\n` +
      `if (args[0] === "bootstrap") fs.writeFileSync(marker, "loaded")\n` +
      `else if (args[0] === "bootout") {\n` +
      `  if (!fs.existsSync(marker)) { process.stderr.write("Boot-out failed: 3: No such process\\n"); process.exit(3) }\n` +
      `  fs.rmSync(marker)\n` +
      `} else if (args[0] === "print") {\n` +
      `  if (!fs.existsSync(marker)) process.exit(1)\n` +
      `  process.stdout.write("service loaded\\n")\n` +
      `}\n`,
  )
  return bin
}

function testEnv(workspace: string, home: string): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    PATH: `${path.join(workspace, "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    OPENCODE_SESSION_MANAGER_PATCHES_SYSTEMD_DIR: path.join(workspace, "units", "systemd"),
    OPENCODE_SESSION_MANAGER_PATCHES_LAUNCHD_DIR: path.join(workspace, "units", "launchd"),
    STANDIN_ARGV_LOG: path.join(workspace, "argv.log"),
    STANDIN_STATE_DIR: workspace,
  }
}

function argvOf(workspace: string): string[][] {
  const log = path.join(workspace, "argv.log")
  if (!existsSync(log)) return []
  return readFileSync(log, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as string[])
}

function setup(): { workspace: string; home: string; env: Record<string, string> } {
  const workspace = temporaryWorkspace("osm-watch-")
  const home = path.join(workspace, "home")
  mkdirSync(home, { recursive: true })
  binWith(workspace)
  return { workspace, home, env: testEnv(workspace, home) }
}

describe("scripts/watch.mjs on linux", () => {
  it("installs the three units, reloads, enables path and timer, and validates healthy", () => {
    const { workspace, env } = setup()
    try {
      const units = ["service", "path", "timer"].map((kind) => `${NAME}.${kind}`)
      const installed = runWatch({ command: "install", platform: "linux", env })
      expect(installed.exitCode).toBe(0)
      for (const unit of units) {
        const target = path.join(env.OPENCODE_SESSION_MANAGER_PATCHES_SYSTEMD_DIR!, unit)
        expect(readFileSync(target, "utf8")).toBe(readFileSync(path.join(root, "systemd", unit), "utf8"))
      }
      const calls = argvOf(workspace)
      expect(calls).toContainEqual(["--user", "daemon-reload"])
      expect(calls).toContainEqual(["--user", "enable", "--now", `${NAME}.path`, `${NAME}.timer`])
      expect(installed.report).toMatchObject({
        kind: "systemd",
        installed: true,
        verify: "ok",
        enabled: { [`${NAME}.path`]: "enabled", [`${NAME}.timer`]: "enabled" },
        active: { [`${NAME}.path`]: "active", [`${NAME}.timer`]: "active" },
      })

      const valid = runWatch({ command: "validate", platform: "linux", env })
      expect([valid.exitCode, valid.report?.installed, valid.report?.verify]).toEqual([0, true, "ok"])

      const removed = runWatch({ command: "uninstall", platform: "linux", env })
      expect(removed.exitCode).toBe(0)
      for (const unit of units) expect(existsSync(path.join(env.OPENCODE_SESSION_MANAGER_PATCHES_SYSTEMD_DIR!, unit))).toBe(false)

      const gone = runWatch({ command: "validate", platform: "linux", env })
      expect([gone.exitCode, gone.report?.installed]).toEqual([1, false])
    } finally {
      removeTemporary(workspace)
    }
  })
})

describe("scripts/watch.mjs on darwin", () => {
  it("renders the plist with the home, lints, bootouts the old agent, bootstraps, and validates loaded", () => {
    const { workspace, home, env } = setup()
    try {
      const plist = path.join(env.OPENCODE_SESSION_MANAGER_PATCHES_LAUNCHD_DIR!, `${LABEL}.plist`)
      const uid = typeof process.getuid === "function" ? String(process.getuid()) : "unknown"

      const installed = runWatch({ command: "install", platform: "darwin", env })
      expect(installed.exitCode).toBe(0)
      const rendered = readFileSync(plist, "utf8")
      expect(rendered).not.toContain("@HOME@")
      expect(rendered).toContain(path.join(home, ".local", "bin"))
      expect(rendered).toContain(`<string>${LABEL}</string>`)
      expect(rendered).toContain("<key>EnvironmentVariables</key>")
      expect(rendered).toContain("<string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>")
      expect(rendered).toContain("<key>OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN</key>")
      expect(rendered).toContain("<string>/opt/homebrew/bin/opencode</string>")
      const calls = argvOf(workspace)
      expect(calls).toContainEqual(["-lint", plist])
      expect(calls).toContainEqual(["bootout", `gui/${uid}/${LABEL}`])
      expect(calls).toContainEqual(["bootstrap", `gui/${uid}`, plist])
      expect(installed.report).toMatchObject({ kind: "launchd", installed: true, verify: "ok", loaded: true })

      // Reinstalling over a loaded agent takes the bootout success path and stays healthy.
      const again = runWatch({ command: "install", platform: "darwin", env })
      expect([again.exitCode, again.report?.loaded]).toEqual([0, true])

      const valid = runWatch({ command: "validate", platform: "darwin", env })
      expect([valid.exitCode, valid.report?.loaded]).toEqual([0, true])

      const removed = runWatch({ command: "uninstall", platform: "darwin", env })
      expect(removed.exitCode).toBe(0)
      expect(existsSync(plist)).toBe(false)

      const gone = runWatch({ command: "validate", platform: "darwin", env })
      expect([gone.exitCode, gone.report?.installed, gone.report?.loaded]).toEqual([1, false, false])
    } finally {
      removeTemporary(workspace)
    }
  })

  it.skipIf(onlyOn("darwin"))("runs to completion through the real entry point with the directory override", () => {
    const { workspace, env } = setup()
    try {
      const child = Bun.spawnSync([process.execPath, "scripts/watch.mjs", "validate"], {
        cwd: root,
        env: env as Record<string, string>,
        stdout: "pipe",
        stderr: "pipe",
      })
      expect(child.exitCode).toBe(1)
      const report = JSON.parse(child.stdout.toString()) as { kind: string; installed: boolean }
      expect([report.kind, report.installed]).toEqual(["launchd", false])
    } finally {
      removeTemporary(workspace)
    }
  })
})

describe("scripts/watch.mjs refusals", () => {
  it("refuses every command on win32 without touching the disk", () => {
    const { workspace, env } = setup()
    try {
      for (const command of ["install", "validate", "uninstall"]) {
        const refused = runWatch({ command, platform: "win32", env })
        expect(refused.exitCode).toBe(1)
        expect(refused.stderr).toContain("the watch is not supported on win32")
        expect(refused.report).toBeNull()
      }
      expect(existsSync(path.join(workspace, "units"))).toBe(false)
    } finally {
      removeTemporary(workspace)
    }
  })

  it("rejects an unknown command with the usage", () => {
    const { workspace, env } = setup()
    try {
      const unknown = runWatch({ command: "deploy", platform: "linux", env })
      expect(unknown.exitCode).toBe(2)
      expect(unknown.stderr).toContain("usage: bun scripts/watch.mjs <install|uninstall|validate>")
    } finally {
      removeTemporary(workspace)
    }
  })
})
