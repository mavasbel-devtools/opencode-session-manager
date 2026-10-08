import { describe, expect, it } from "bun:test"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { fileURLToPath } from "node:url"
import { defaultDataHome, profileAt } from "@session-manager/domain/model/Profile"

const profile = profileAt("live", defaultDataHome({ XDG_DATA_HOME: process.env["XDG_DATA_HOME"] }, process.env["HOME"] ?? homedir()))
const cli = fileURLToPath(new URL("../../../src/main/cli/cli.ts", import.meta.url))

describe("sessions on this machine's real profile (read-only, safe while OpenCode runs)", () => {
  it.skipIf(!existsSync(profile.opencodeDb))("lists the real sessions with their Magic Context state", () => {
    const result = Bun.spawnSync([process.execPath, cli, "sessions", "--json"], { env: process.env })
    expect(result.exitCode).toBe(0)
    const catalog = JSON.parse(result.stdout.toString()) as {
      sessions: { id: string; magicContext: unknown }[]
      magicContext: { available: boolean; schemaVersion: number | null }
    }
    expect(catalog.sessions.length).toBeGreaterThan(0)
    expect(catalog.sessions.every((session) => session.id.startsWith("ses_"))).toBe(true)
    expect(catalog.magicContext.available).toBe(existsSync(profile.contextDb))
    if (catalog.magicContext.available) {
      expect(catalog.magicContext.schemaVersion).toBeGreaterThan(0)
      expect(catalog.sessions.some((session) => session.magicContext !== null)).toBe(true)
    }
  })
})
