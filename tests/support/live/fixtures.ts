import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

/**
 * The real stores the live tier syncs and upgrades: the environment variable when set, else the
 * folder `bun run fixtures:live` fills (OPENCODE_SM_LIVE_FIXTURES, else
 * `$XDG_CACHE_HOME/opencode-session-manager/live`), else none (the tests that need them are skipped).
 */
const fixtures =
  process.env["OPENCODE_SM_LIVE_FIXTURES"] ||
  join(process.env["XDG_CACHE_HOME"] || join(process.env["HOME"] ?? homedir(), ".cache"), "opencode-session-manager", "live")

function kept(file: string, value: string): string | undefined {
  return existsSync(file) ? value : undefined
}

/** Another profile's data home, synced into a copy of this machine's. */
export const liveOtherProfile: string | undefined =
  process.env["OPENCODE_SM_LIVE_OTHER_PROFILE"] ||
  kept(join(fixtures, "other-profile", "opencode", "opencode.db"), join(fixtures, "other-profile"))

/** A Magic Context store in an older format, upgraded by the installed Magic Context. */
export const liveOldContext: string | undefined =
  process.env["OPENCODE_SM_LIVE_OLD_CONTEXT"] || kept(join(fixtures, "old-context", "context.db"), join(fixtures, "old-context", "context.db"))
