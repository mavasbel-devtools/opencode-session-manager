import { existsSync } from "node:fs"
import path from "node:path"
import type { CliEnvironment } from "@session-manager/infrastructure/adapters/inbound/cli/CompactCliAdapter"

export interface Paths {
  /** Where OpenCode installs Magic Context: `<XDG_CACHE_HOME>/opencode/npm/@cortexkit`. */
  readonly installations: string
  readonly opencodeConfig: string
  /** The TUI's configuration: `tui.jsonc`, else `tui.json`, in the same folder as `opencodeConfig`. */
  readonly tuiConfig: string
  readonly magicContextConfig: string
  readonly magicContextLog: string
  readonly backups: string
  readonly auditLog: string
  readonly state: string
  /** The notifier executable override; each platform falls back to its own default when unset. */
  readonly notifyCommand: string | undefined
  readonly proc: string
  /** Where `follow` installs patched copies: `<XDG_DATA_HOME>/opencode-session-manager/patches/installs/<version>/`. */
  readonly installs: string
  readonly derivedReleases: string
  readonly evidence: string
  readonly lock: string
  readonly registry: string
  /** npm's own cache (`~/.npm/_cacache`), shared with npm. */
  readonly npmCache: string
  readonly opencode: string
  /** The running OpenCode service's address and password: `<XDG_STATE_HOME>/opencode/service.json`. */
  readonly service: string
  /** Where sandbox homes for the proof are created and removed. */
  readonly sandboxes: string
  readonly timing: FollowTiming
}

export interface FollowTiming {
  /** Each wait of `follow` (the sandbox server, the running server reloading): OPENCODE_SESSION_MANAGER_PATCHES_TIMEOUT_MS, default 120000. */
  readonly timeoutMs: number
  readonly pollMs: number
  /** After a plugin is reported loaded, before its log is read: OPENCODE_SESSION_MANAGER_PATCHES_SETTLE_MS, default 5000. */
  readonly settleMs: number
}

const NAME = path.join("opencode-session-manager", "patches")

/**
 * Every location the patches group uses, from the environment (XDG base directories, with the
 * usual defaults under HOME). The configuration file is the one session-manager resolves:
 * opencode.jsonc, else opencode.json. Magic Context's log follows its own rule
 * (src/shared/data-path.ts, 0.47.0): MAGIC_CONTEXT_LOG_PATH, else
 * `<TMPDIR or /tmp>/opencode2/magic-context/magic-context.log` for OpenCode 2. The OpenCode
 * binary defaults to `~/.opencode/bin/opencode` when it exists, else the first `opencode` on PATH.
 */
export function resolvePatchPaths(env: CliEnvironment, home: string): Paths {
  const base = (variable: keyof CliEnvironment, fallback: string) => env[variable] || path.join(home, fallback)
  const cache = base("XDG_CACHE_HOME", ".cache")
  const config = base("XDG_CONFIG_HOME", ".config")
  const data = base("XDG_DATA_HOME", ".local/share")
  const stateHome = base("XDG_STATE_HOME", ".local/state")
  const state = path.join(stateHome, NAME)
  const number = (variable: keyof CliEnvironment, fallback: number) => {
    const value = Number(env[variable])
    return Number.isFinite(value) && value > 0 ? value : fallback
  }
  const timeoutMs = number("OPENCODE_SESSION_MANAGER_PATCHES_TIMEOUT_MS", 120_000)
  const dotOpencode = path.join(home, ".opencode", "bin", "opencode")
  return {
    installations: path.join(cache, "opencode", "npm", "@cortexkit"),
    opencodeConfig: ["opencode.jsonc", "opencode.json"]
      .map((name) => path.join(config, "opencode", name))
      .find((file) => existsSync(file)) ?? path.join(config, "opencode", "opencode.jsonc"),
    tuiConfig: ["tui.jsonc", "tui.json"]
      .map((name) => path.join(config, "opencode", name))
      .find((file) => existsSync(file)) ?? path.join(config, "opencode", "tui.jsonc"),
    magicContextConfig: path.join(config, "cortexkit", "magic-context.jsonc"),
    magicContextLog:
      env.MAGIC_CONTEXT_LOG_PATH?.trim() || path.join(env.TMPDIR || "/tmp", "opencode2", "magic-context", "magic-context.log"),
    backups: path.join(data, NAME, "backups"),
    auditLog: path.join(state, "audit.log"),
    state,
    notifyCommand: env.OPENCODE_SESSION_MANAGER_PATCHES_NOTIFY_BIN,
    proc: env.OPENCODE_SESSION_MANAGER_PATCHES_PROC || "/proc",
    installs: path.join(data, NAME, "installs"),
    derivedReleases: path.join(data, NAME, "derived-releases.json"),
    evidence: path.join(state, "evidence"),
    lock: path.join(state, "follow.lock"),
    registry: env.OPENCODE_SESSION_MANAGER_PATCHES_REGISTRY || "https://registry.npmjs.org",
    npmCache: path.join(home, ".npm", "_cacache"),
    opencode: env.OPENCODE_SESSION_MANAGER_PATCHES_OPENCODE_BIN || (existsSync(dotOpencode) ? dotOpencode : "opencode"),
    service: path.join(stateHome, "opencode", "service.json"),
    sandboxes: env.TMPDIR || "/tmp",
    timing: { timeoutMs, pollMs: Math.min(2_000, timeoutMs), settleMs: number("OPENCODE_SESSION_MANAGER_PATCHES_SETTLE_MS", 5_000) },
  }
}
