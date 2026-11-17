#!/usr/bin/env bun
/**
 * Installs, removes or validates the systemd user units that run `opencode-session-manager patches
 * follow` when OpenCode installs another Magic Context, when opencode.jsonc changes, 2 minutes after
 * login and every 6 hours. follow may install a patched copy and change the one Magic Context entry
 * of opencode.jsonc; it never changes a copy OpenCode has loaded and never restarts OpenCode.
 *   bun scripts/watch.mjs <install|uninstall|validate>
 * OPENCODE_SESSION_MANAGER_PATCHES_SYSTEMD_DIR overrides the unit folder (default `<XDG_CONFIG_HOME>/systemd/user`).
 */
import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const home = process.env.HOME || os.homedir()
const directory =
  process.env.OPENCODE_SESSION_MANAGER_PATCHES_SYSTEMD_DIR || path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "systemd", "user")
const NAME = "opencode-session-manager-patches"
const UNITS = [`${NAME}.service`, `${NAME}.path`, `${NAME}.timer`]
const ENABLED = [`${NAME}.path`, `${NAME}.timer`]

function systemctl(...args) {
  const run = spawnSync("systemctl", ["--user", ...args], { encoding: "utf8" })
  return { code: run.status, out: `${run.stdout}${run.stderr}`.trim() }
}

function must(result, what) {
  if (result.code !== 0) throw new Error(`${what} failed: ${result.out}`)
}

const command = process.argv[2]
if (command === "install") {
  mkdirSync(directory, { recursive: true })
  for (const unit of UNITS) copyFileSync(path.join(project, "systemd", unit), path.join(directory, unit))
  must(systemctl("daemon-reload"), "daemon-reload")
  must(systemctl("enable", "--now", ...ENABLED), "enable")
} else if (command === "uninstall") {
  systemctl("disable", "--now", ...ENABLED)
  for (const unit of UNITS) rmSync(path.join(directory, unit), { force: true })
  must(systemctl("daemon-reload"), "daemon-reload")
} else if (command !== "validate") {
  console.error("usage: bun scripts/watch.mjs <install|uninstall|validate>")
  process.exit(2)
}

const installed = UNITS.map((unit) => path.join(directory, unit))
const verify = spawnSync("systemd-analyze", ["--user", "verify", ...installed.filter((file) => existsSync(file))], { encoding: "utf8" })
const report = {
  directory,
  installed: installed.every((file) => existsSync(file)),
  verify: verify.status === 0 ? "ok" : `${verify.stdout}${verify.stderr}`.trim(),
  enabled: Object.fromEntries(ENABLED.map((unit) => [unit, systemctl("is-enabled", unit).out])),
  active: Object.fromEntries(ENABLED.map((unit) => [unit, systemctl("is-active", unit).out])),
}
console.log(JSON.stringify(report, null, 2))
const healthy =
  command === "uninstall"
    ? !report.installed
    : report.installed && report.verify === "ok" && ENABLED.every((u) => report.enabled[u] === "enabled" && report.active[u] === "active")
if (!healthy) process.exitCode = 1
