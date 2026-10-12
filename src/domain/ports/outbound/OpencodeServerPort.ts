import type { CommandAnswer, ForkAnswer, ServerConnection } from "@session-manager/domain/model/Rebuild"

/** Outbound port: the running OpenCode server. */
export interface OpencodeServerPort {
  /** The server this machine's OpenCode service recorded, or null. */
  recorded(): ServerConnection | null
  /** Where `recorded()` looked, for the error that names it. */
  searched(): string
  /** Runs a slash command in a session (`POST /api/session/:id/command`); the server answers before the command ends. */
  command(server: ServerConnection, sessionId: string, name: string, text: string): Promise<CommandAnswer>
  /** Forks a session (`POST /api/session/:id/fork`): its whole history, or the part before `before`. */
  fork(server: ServerConnection, sessionId: string, before: string | null): Promise<ForkAnswer>
}
