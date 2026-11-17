#!/usr/bin/env bun
/**
 * Installs, removes or validates the watch that runs `opencode-session-manager patches
 * follow` when OpenCode installs another Magic Context, when opencode.jsonc changes, 2 minutes after
 * login and every 6 hours. follow may install a patched copy and change the one Magic Context entry
 * of opencode.jsonc; it never changes a copy OpenCode has loaded and never restarts OpenCode.
 *   bun scripts/watch.mjs <install|uninstall|validate>
 * Linux: systemd user units in OPENCODE_SESSION_MANAGER_PATCHES_SYSTEMD_DIR
 *   (default `<XDG_CONFIG_HOME>/systemd/user`). macOS: a launchd agent in
 *   OPENCODE_SESSION_MANAGER_PATCHES_LAUNCHD_DIR (default `~/Library/LaunchAgents`).
 * Windows: exits 1, `the watch is not supported on win32`.
 */
import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const NAME = "opencode-session-manager-patches"
export const LABEL = "com.github.mavasbel-devtools.opencode-session-manager-patches"
export const UNITS = [`${NAME}.service`, `${NAME}.path`, `${NAME}.timer`]
export const ENABLED = [`${NAME}.path`, `${NAME}.timer`]
export const USAGE = "usage: bun scripts/watch.mjs <install|uninstall|validate>"
export const WIN32_REFUSAL = "the watch is not supported on win32"

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export function homeOf(env = process.env) {
  return env.HOME || os.homedir()
}

export function systemdDir(env = process.env) {
  return (
    env.OPENCODE_SESSION_MANAGER_PATCHES_SYSTEMD_DIR ||
    path.join(env.XDG_CONFIG_HOME || path.join(homeOf(env), ".config"), "systemd", "user")
  )
}

export function launchdDir(env = process.env) {
  return env.OPENCODE_SESSION_MANAGER_PATCHES_LAUNCHD_DIR || path.join(homeOf(env), "Library", "LaunchAgents")
}

export function uidOf(env = process.env) {
  if (typeof process.getuid === "function") return String(process.getuid())
  return run("id", ["-u"], env).out
}

function run(file, args, env = process.env) {
  const result = spawnSync(file, args, { encoding: "utf8", env })
  return { code: result.status, out: `${result.stdout}${result.stderr}`.trim() }
}

function must(result, what) {
  if (result.code !== 0) throw new Error(`${what} failed: ${result.out}`)
}

function linuxReport(env) {
  const directory = systemdDir(env)
  const installed = UNITS.map((unit) => path.join(directory, unit))
  const verify = run("systemd-analyze", ["--user", "verify", ...installed.filter((file) => existsSync(file))], env)
  return {
    kind: "systemd",
    directory,
    installed: installed.every((file) => existsSync(file)),
    verify: verify.code === 0 ? "ok" : verify.out,
    enabled: Object.fromEntries(ENABLED.map((unit) => [unit, run("systemctl", ["--user", "is-enabled", unit], env).out])),
    active: Object.fromEntries(ENABLED.map((unit) => [unit, run("systemctl", ["--user", "is-active", unit], env).out])),
  }
}

function linuxHealthy(command, report) {
  if (command === "uninstall") return !report.installed
  return (
    report.installed &&
    report.verify === "ok" &&
    ENABLED.every((unit) => report.enabled[unit] === "enabled" && report.active[unit] === "active")
  )
}

function darwinReport(env) {
  const directory = launchdDir(env)
  const plist = path.join(directory, `${LABEL}.plist`)
  const installed = existsSync(plist)
  const lint = installed ? run("plutil", ["-lint", plist], env) : null
  const print = run("launchctl", ["print", `gui/${uidOf(env)}/${LABEL}`], env)
  return {
    kind: "launchd",
    directory,
    plist,
    installed,
    verify: lint === null ? "missing" : lint.code === 0 ? "ok" : lint.out,
    loaded: print.code === 0,
  }
}

function darwinHealthy(command, report) {
  if (command === "uninstall") return !report.installed
  return report.installed && report.verify === "ok" && report.loaded
}

function installLinux(env) {
  const directory = systemdDir(env)
  mkdirSync(directory, { recursive: true })
  for (const unit of UNITS) copyFileSync(path.join(project, "systemd", unit), path.join(directory, unit))
  must(run("systemctl", ["--user", "daemon-reload"], env), "daemon-reload")
  must(run("systemctl", ["--user", "enable", "--now", ...ENABLED], env), "enable")
}

function uninstallLinux(env) {
  run("systemctl", ["--user", "disable", "--now", ...ENABLED], env)
  const directory = systemdDir(env)
  for (const unit of UNITS) rmSync(path.join(directory, unit), { force: true })
  must(run("systemctl", ["--user", "daemon-reload"], env), "daemon-reload")
}

function installDarwin(env) {
  const home = homeOf(env)
  const directory = launchdDir(env)
  const plist = path.join(directory, `${LABEL}.plist`)
  mkdirSync(directory, { recursive: true })
  const rendered = readFileSync(path.join(project, "launchd", `${NAME}.plist`), "utf8").replaceAll("@HOME@", home)
  writeFileSync(plist, rendered)
  must(run("plutil", ["-lint", plist], env), "plutil -lint")
  const domain = `gui/${uidOf(env)}`
  const bootout = run("launchctl", ["bootout", `${domain}/${LABEL}`], env)
  // A fresh install has nothing loaded yet; a real macOS prints
  // `Boot-out failed: 3: No such process` (exit 3) for that case. Anything else fails the install.
  if (bootout.code !== 0 && !/not loaded|No such process/i.test(bootout.out)) throw new Error(`bootout failed: ${bootout.out}`)
  must(run("launchctl", ["bootstrap", domain, plist], env), "bootstrap")
}

function uninstallDarwin(env) {
  run("launchctl", ["bootout", `gui/${uidOf(env)}/${LABEL}`], env)
  rmSync(path.join(launchdDir(env), `${LABEL}.plist`), { force: true })
}

/**
 * Runs one watch command for `platform` (defaults to the running one) with `env`.
 * Returns the exit code, the text for each stream, and the install report (null when
 * the platform refuses or the command is unknown). Never touches the real home: pass
 * the directory overrides through `env`.
 */
export function runWatch({ command, platform = process.platform, env = process.env }) {
  if (platform === "win32") return { exitCode: 1, stdout: "", stderr: `${WIN32_REFUSAL}\n`, report: null }
  if (command === "install") {
    if (platform === "darwin") installDarwin(env)
    else installLinux(env)
  } else if (command === "uninstall") {
    if (platform === "darwin") uninstallDarwin(env)
    else uninstallLinux(env)
  } else if (command !== "validate") {
    return { exitCode: 2, stdout: "", stderr: `${USAGE}\n`, report: null }
  }
  const report = platform === "darwin" ? darwinReport(env) : linuxReport(env)
  const healthy = platform === "darwin" ? darwinHealthy(command, report) : linuxHealthy(command, report)
  return { exitCode: healthy ? 0 : 1, stdout: `${JSON.stringify(report, null, 2)}\n`, stderr: "", report }
}

if (import.meta.main) {
  let result
  try {
    result = runWatch({ command: process.argv[2] })
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
    process.exit(1)
  }
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  process.exit(result.exitCode)
}
