// One OpenCode window's repair pass, in its own process: the real use case, lock, filesystem and
// Git adapters, over a host whose sessions live in a shared JSON file (as OpenCode's store would).
// argv: <workspace> <configHome> <store> <moveDelayMs>; prints the report as JSON.
import fs from "node:fs"
import path from "node:path"
import { RepairSessionLocationsUseCase } from "@session-manager/application/RepairSessionLocationsUseCase"
import { RepairWorktreeLinksUseCase } from "@session-manager/application/RepairWorktreeLinksUseCase"
import type { SessionSummary } from "@session-manager/domain/model/Session"
import type { SessionHostPort } from "@session-manager/domain/ports/outbound/SessionHostPort"
import { FsStoreLockAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsStoreLockAdapter"
import { NodeFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeFileSystemAdapter"
import { NodeLocationRepairMappingsAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeLocationRepairMappingsAdapter"
import { GitWorktreeAdapter } from "@session-manager/infrastructure/adapters/outbound/project/GitWorktreeAdapter"
import { SystemClockAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemClockAdapter"

const [workspace, configHome, store, delay] = process.argv.slice(2) as [string, string, string, string]
const sessionsFile = path.join(workspace, "sessions.json")

class FileSessionHost implements SessionHostPort {
  constructor() {}

  async listSessions(): Promise<SessionSummary[]> {
    return JSON.parse(fs.readFileSync(sessionsFile, "utf8")) as SessionSummary[]
  }

  async listRecentDirectories(): Promise<string[]> {
    return []
  }

  async moveSession(sessionId: string, directory: string): Promise<void> {
    fs.writeFileSync(path.join(workspace, `moving-${process.pid}`), "")
    await Bun.sleep(Number(delay))
    const sessions = await this.listSessions()
    fs.writeFileSync(sessionsFile, JSON.stringify(sessions.map((session) => (session.id === sessionId ? { ...session, directory } : session))))
    fs.appendFileSync(path.join(workspace, "moves.log"), `${process.pid} ${sessionId} ${directory}\n`)
  }
}

const files = new NodeFileSystemAdapter()
const repair = new RepairSessionLocationsUseCase(
  new FileSessionHost(),
  files,
  new NodeLocationRepairMappingsAdapter({ XDG_CONFIG_HOME: configHome }, () => workspace),
  new RepairWorktreeLinksUseCase(new GitWorktreeAdapter(), files),
  { locks: new FsStoreLockAdapter(), runtime: new SystemClockAdapter(), store },
)
process.stdout.write(`${JSON.stringify(await repair.execute())}\n`)
