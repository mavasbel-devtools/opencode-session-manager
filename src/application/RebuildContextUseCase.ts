import { ServerNotFoundError } from "@session-manager/domain/errors/ServerNotFoundError"
import { phaseOf, rebuildOk, type RebuildSnapshot, type RebuildStatus, type SessionRebuild } from "@session-manager/domain/model/Rebuild"
import type { RebuildContextPort, RebuildInput } from "@session-manager/domain/ports/inbound/RebuildContextPort"
import type { MagicContextProgressPort } from "@session-manager/domain/ports/outbound/MagicContextProgressPort"
import type { OpencodeServerPort } from "@session-manager/domain/ports/outbound/OpencodeServerPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"
import type { TimerPort } from "@session-manager/domain/ports/outbound/TimerPort"

export interface RebuildContextDependencies {
  readonly server: OpencodeServerPort
  readonly progress: MagicContextProgressPort
  readonly runtime: Pick<RuntimePort, "now">
  readonly timer: TimerPort
}

/**
 * Runs `/ctx-wrapup` or `/ctx-recomp` in each session through the OpenCode server, one session at
 * a time, and follows it in the Magic Context store: a session Magic Context is already working on
 * is refused, never interrupted; the server's refusal (no such folder, wrong password) is reported
 * per session. Only reads the store; the writing is Magic Context's own, inside OpenCode.
 */
export class RebuildContextUseCase implements RebuildContextPort {
  private readonly deps: RebuildContextDependencies

  constructor(deps: RebuildContextDependencies) {
    this.deps = deps
  }

  async rebuild(input: RebuildInput) {
    const { server, runtime } = this.deps
    const recorded = server.recorded()
    const connection = input.server === null ? recorded : { url: input.server, password: recorded?.password ?? null }
    if (connection === null) throw new ServerNotFoundError(server.searched())
    const sessions: SessionRebuild[] = []
    for (const id of [...new Set(input.sessions)]) {
      const started = runtime.now()
      const before = this.deps.progress.snapshot(input.contextDb, id, started, started)
      const done = (status: RebuildStatus, detail: string | null, after: RebuildSnapshot): SessionRebuild => ({
        session_id: id,
        command: input.command,
        status,
        detail,
        summaries_before: before.summaries,
        summaries_after: after.summaries,
        reach_before: before.reach,
        reach_after: after.reach,
        runs: after.runs.length,
        failed_runs: after.runs.filter((run) => run.status === "failed").length,
        elapsed_ms: runtime.now() - started,
      })
      if (phaseOf(before) === "running") {
        sessions.push(done("refused", "Magic Context is already working on it", { ...before, runs: [] }))
        continue
      }
      const text = input.command === "wrapup" && input.keep !== null ? String(input.keep) : ""
      const answer = await server.command(connection, id, `ctx-${input.command}`, text)
      if (!answer.ok) {
        sessions.push(done("refused", `the server answered ${answer.status ?? "nothing"}: ${answer.detail}`, { ...before, runs: [] }))
        continue
      }
      sessions.push(input.wait ? await this.follow(input, id, started, done) : done("started", null, this.deps.progress.snapshot(input.contextDb, id, started, runtime.now())))
    }
    return { server: connection.url, context_db: input.contextDb, command: input.command, sessions, ok: rebuildOk(sessions) }
  }

  /** Polls the store until the command ends, shows no sign of work past the grace time, or the wait runs out. */
  private async follow(
    input: RebuildInput,
    id: string,
    started: number,
    done: (status: RebuildStatus, detail: string | null, after: RebuildSnapshot) => SessionRebuild,
  ): Promise<SessionRebuild> {
    const { progress, runtime, timer } = this.deps
    let worked = false
    for (;;) {
      await timer.sleep(input.pollMs)
      const now = runtime.now()
      const snapshot = progress.snapshot(input.contextDb, id, started, now)
      input.onProgress?.({ session_id: id, snapshot, elapsed_ms: now - started })
      const phase = phaseOf(snapshot)
      if (phase === "running") worked = true
      else if (phase === "finished") return done("finished", null, snapshot)
      else if (phase === "failed") return done("failed", snapshot.runs.at(-1)!.failure, snapshot)
      else if (phase === "stopped") return done("stopped", "the wrapup was cut off (OpenCode restarted?); run it again to continue", snapshot)
      else if (worked) return done("finished", null, snapshot)
      else if (now - started >= input.graceMs) return done("nothing-to-do", "Magic Context did not start: nothing to wrap up or rebuild", snapshot)
      if (now - started >= input.timeoutMs) return done("timed-out", "still running in OpenCode", snapshot)
    }
  }
}
