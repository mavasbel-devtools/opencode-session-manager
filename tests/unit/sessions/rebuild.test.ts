import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { RebuildContextUseCase } from "@session-manager/application/RebuildContextUseCase"
import { ServerNotFoundError } from "@session-manager/domain/errors/ServerNotFoundError"
import {
  isRebuildCommand,
  phaseOf,
  progressText,
  rebuildLines,
  rebuildOk,
  type CommandAnswer,
  type RebuildSnapshot,
  type ServerConnection,
  type SessionRebuild,
} from "@session-manager/domain/model/Rebuild"
import type { RebuildInput } from "@session-manager/domain/ports/inbound/RebuildContextPort"
import { HttpOpencodeServerAdapter } from "@session-manager/infrastructure/adapters/outbound/opencode2/HttpOpencodeServerAdapter"
import { BunMagicContextProgressAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMagicContextProgressAdapter"
import { BunMagicContextSyncStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMagicContextSyncStoreAdapter"
import { SystemTimerAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemTimerAdapter"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { makeSyncContextStore } from "@test/support/sessions/sync-stores"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-rebuild-")
})
afterEach(() => {
  removeTemporary(directory)
})

const idle: RebuildSnapshot = { summaries: 2, reach: 40, wrapup: "none", leased: false, staged: 0, runs: [] }
const run = (status: string, failure: string | null = null) => ({ kind: "recomp", status, failure, chunk_start: 41, chunk_end: 90, compartments: 1, at: 5 })

describe("rebuild rules", () => {
  it("tells running, stopped, failed, finished and quiet apart", () => {
    expect([
      phaseOf(idle),
      phaseOf({ ...idle, wrapup: "running" }),
      phaseOf({ ...idle, leased: true }),
      phaseOf({ ...idle, staged: 3 }),
      phaseOf({ ...idle, wrapup: "left-behind" }),
      phaseOf({ ...idle, runs: [run("success"), run("failed", "timeout")] }),
      phaseOf({ ...idle, runs: [run("failed"), run("noop")] }),
    ]).toEqual(["quiet", "running", "running", "running", "stopped", "failed", "finished"])
    expect([isRebuildCommand("wrapup"), isRebuildCommand("recomp"), isRebuildCommand("dream")]).toEqual([true, true, false])
  })

  it("writes progress and the outcome for a person", () => {
    expect(progressText({ session_id: "ses_a", snapshot: { ...idle, wrapup: "running", runs: [run("success")] }, elapsed_ms: 12_400 })).toBe(
      "ses_a: running · 2 summaries to message 40 · last run success (41–90) · 12 s",
    )
    expect(progressText({ session_id: "ses_a", snapshot: { ...idle, summaries: 0, reach: null, runs: [{ ...run("noop"), chunk_start: null }] }, elapsed_ms: 0 })).toBe(
      "ses_a: finished · no summaries · last run noop · 0 s",
    )
    const session = (status: SessionRebuild["status"], detail: string | null = null): SessionRebuild => ({
      session_id: "ses_a",
      command: "recomp",
      status,
      detail,
      summaries_before: 0,
      summaries_after: 3,
      reach_before: null,
      reach_after: 43,
      runs: 2,
      failed_runs: 1,
      elapsed_ms: 80_000,
    })
    const ok = [session("finished"), session("started"), session("nothing-to-do")]
    expect([rebuildOk(ok), rebuildOk([...ok, session("timed-out")])]).toEqual([true, false])
    expect(rebuildLines({ server: "http://s", context_db: "/c", command: "wrapup", sessions: [session("finished"), session("refused"), session("finished")], ok: false })[0]).toBe(
      "/ctx-wrapup through http://s: 2 finished, 1 refused",
    )
    expect(rebuildLines({ server: "http://s", context_db: "/c", command: "wrapup", sessions: [], ok: true })[0]).toBe("/ctx-wrapup through http://s: no sessions")
    expect(rebuildLines({ server: "http://s", context_db: "/c", command: "recomp", sessions: [session("failed", "timeout")], ok: false })).toEqual([
      "/ctx-recomp through http://s: 1 failed",
      "ses_a: failed (timeout) · summaries 0 → 3, none → to message 43 · 2 runs (1 failed) · 80 s",
      "NOT ALL DONE: see each session above",
    ])
  })
})

describe("RebuildContextUseCase", () => {
  /** A server stand-in and a store whose snapshots follow a script per session. */
  function setup(script: Record<string, RebuildSnapshot[]>, answers: Record<string, CommandAnswer> = {}, recorded: ServerConnection | null = { url: "http://local", password: "pw" }) {
    const sent: string[] = []
    let clock = 1_000
    const reads: Record<string, number> = {}
    const useCase = new RebuildContextUseCase({
      server: {
        recorded: () => recorded,
        searched: () => "/state/service.json",
        command: async (server, id, name, text) => {
          sent.push(`${server.url} ${server.password} ${id} ${name} "${text}"`)
          return answers[id] ?? { ok: true }
        },
        fork: async () => ({ ok: false, status: null, detail: "not used" }),
      },
      progress: {
        snapshot: (contextDb, id, since) => {
          const list = script[id] ?? [idle]
          const index = Math.min(reads[id] ?? 0, list.length - 1)
          reads[id] = (reads[id] ?? 0) + 1
          return { ...list[index]!, runs: list[index]!.runs.filter((entry) => entry.at >= since - 1_000) }
        },
      },
      runtime: { now: () => clock },
      timer: {
        sleep: async (ms) => {
          clock += ms
        },
      },
    })
    const input = (extra: Partial<RebuildInput> = {}): RebuildInput => ({
      contextDb: "/c.db",
      sessions: Object.keys(script),
      command: "wrapup",
      keep: 20,
      server: null,
      wait: true,
      timeoutMs: 100,
      pollMs: 10,
      graceMs: 30,
      ...extra,
    })
    return { useCase, sent, input }
  }

  it("runs each session in turn on the recorded server and follows it to its end", async () => {
    const working = { ...idle, wrapup: "running" as const }
    const done = { ...idle, summaries: 5, reach: 140, runs: [{ ...run("success"), at: 2_000 }] }
    const { useCase, sent, input } = setup({ ses_a: [idle, working, working, done], ses_b: [idle, { ...idle, runs: [{ ...run("failed", "model timeout"), at: 2_000 }] }] })
    const events: string[] = []
    const report = await useCase.rebuild(input({ onProgress: (progress) => events.push(`${progress.session_id} ${phaseOf(progress.snapshot)}`) }))
    expect(sent).toEqual(['http://local pw ses_a ctx-wrapup "20"', 'http://local pw ses_b ctx-wrapup "20"'])
    expect(events).toEqual(["ses_a running", "ses_a running", "ses_a finished", "ses_b failed"])
    expect(report).toMatchObject({ server: "http://local", context_db: "/c.db", command: "wrapup", ok: false })
    expect(report.sessions.map((session) => [session.session_id, session.status, session.detail, session.summaries_before, session.summaries_after, session.reach_after, session.runs, session.failed_runs, session.elapsed_ms])).toEqual([
      ["ses_a", "finished", null, 2, 5, 140, 1, 0, 30],
      ["ses_b", "failed", "model timeout", 2, 2, 40, 1, 1, 10],
    ])
  })

  it("refuses a session already being worked on, reports the server's refusal, and handles silence, a cut-off and a long run", async () => {
    const working = { ...idle, leased: true }
    const { useCase, sent, input } = setup(
      {
        ses_busy: [working],
        ses_gone: [idle],
        ses_quiet: [idle],
        ses_cut: [idle, { ...idle, wrapup: "running" }, { ...idle, wrapup: "left-behind" }],
        ses_long: [idle, working],
        ses_worked: [idle, { ...idle, staged: 2 }, idle],
      },
      { ses_gone: { ok: false, status: 404, detail: "Location not found: /gone" } },
    )
    const report = await useCase.rebuild(input({ command: "recomp", sessions: ["ses_busy", "ses_gone", "ses_quiet", "ses_cut", "ses_long", "ses_worked", "ses_quiet"] }))
    expect(sent.map((line) => line.split(" ").slice(2).join(" "))).toEqual([
      'ses_gone ctx-recomp ""',
      'ses_quiet ctx-recomp ""',
      'ses_cut ctx-recomp ""',
      'ses_long ctx-recomp ""',
      'ses_worked ctx-recomp ""',
    ])
    expect(report.sessions.map((session) => [session.session_id, session.status, session.detail])).toEqual([
      ["ses_busy", "refused", "Magic Context is already working on it"],
      ["ses_gone", "refused", "the server answered 404: Location not found: /gone"],
      ["ses_quiet", "nothing-to-do", "Magic Context did not start: nothing to wrap up or rebuild"],
      ["ses_cut", "stopped", "the wrapup was cut off (OpenCode restarted?); run it again to continue"],
      ["ses_long", "timed-out", "still running in OpenCode"],
      ["ses_worked", "finished", null],
    ])
  })

  it("starts without waiting, names another server with the recorded password, and keeps Magic Context's own default", async () => {
    const { useCase, sent, input } = setup({ ses_a: [idle] }, { ses_x: { ok: false, status: null, detail: "connection refused" } })
    const report = await useCase.rebuild(input({ server: "http://other", wait: false, keep: null, sessions: ["ses_a", "ses_x"] }))
    expect(sent).toEqual(['http://other pw ses_a ctx-wrapup ""', 'http://other pw ses_x ctx-wrapup ""'])
    expect(report.sessions.map((session) => [session.status, session.detail])).toEqual([
      ["started", null],
      ["refused", "the server answered nothing: connection refused"],
    ])
    const unrecorded = setup({ ses_a: [idle] }, {}, null)
    expect((await unrecorded.useCase.rebuild(unrecorded.input({ server: "http://named" }))).server).toBe("http://named")
    expect(unrecorded.sent).toEqual(['http://named null ses_a ctx-wrapup "20"'])
    await expect(unrecorded.useCase.rebuild(unrecorded.input())).rejects.toThrow(new ServerNotFoundError("/state/service.json"))
  })
})

describe("HttpOpencodeServerAdapter", () => {
  it("reads the server the service recorded", () => {
    const file = join(directory, "state", "service.json")
    const adapter = new HttpOpencodeServerAdapter(file, 2000)
    expect([adapter.recorded(), adapter.searched()]).toEqual([null, file])
    mkdirSync(join(directory, "state"), { recursive: true })
    for (const [content, expected] of [
      ['{ "url": "http://127.0.0.1:1", "password": "pw" }', { url: "http://127.0.0.1:1", password: "pw" }],
      ['{ "url": "http://127.0.0.1:1", "password": "" }', { url: "http://127.0.0.1:1", password: null }],
      ['{ "url": "http://127.0.0.1:1" }', { url: "http://127.0.0.1:1", password: null }],
      ['{ "url": "" }', null],
      ['{ "pid": 1 }', null],
      ["not json", null],
    ] as const) {
      writeFileSync(file, content)
      expect(adapter.recorded()).toEqual(expected)
    }
  })

  it("posts the command with the password, and reports what a refusing or missing server says", async () => {
    const seen: string[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        seen.push(`${request.method} ${url.pathname} ${request.headers.get("authorization")} ${await request.text()}`)
        if (url.pathname.includes("ses_gone")) return Response.json({ _tag: "LocationNotFoundError", message: "Location not found: /gone" }, { status: 404 })
        if (url.pathname.includes("ses_plain")) return new Response("bad request", { status: 400 })
        if (url.pathname.includes("ses_empty")) return new Response("", { status: 401, statusText: "Unauthorized" })
        if (url.pathname.includes("ses_odd")) return Response.json({ message: 7 }, { status: 500 })
        return new Response(null, { status: 204 })
      },
    })
    try {
      const adapter = new HttpOpencodeServerAdapter(join(directory, "none.json"), 2000)
      const at = { url: `${server.url.origin}/`, password: "pw" }
      expect(await adapter.command(at, "ses_a/b", "ctx-wrapup", "20")).toEqual({ ok: true })
      expect(seen[0]).toBe(`POST /api/session/ses_a%2Fb/command Basic ${Buffer.from("opencode:pw").toString("base64")} {"name":"ctx-wrapup","text":"20"}`)
      expect(await adapter.command({ ...at, password: null }, "ses_gone", "ctx-recomp", "")).toEqual({ ok: false, status: 404, detail: "Location not found: /gone" })
      expect(seen[1]).toStartWith("POST /api/session/ses_gone/command null ")
      expect(await adapter.command(at, "ses_plain", "ctx-recomp", "")).toEqual({ ok: false, status: 400, detail: "bad request" })
      expect(await adapter.command(at, "ses_empty", "ctx-recomp", "")).toEqual({ ok: false, status: 401, detail: "Unauthorized" })
      expect(await adapter.command(at, "ses_odd", "ctx-recomp", "")).toEqual({ ok: false, status: 500, detail: '{"message":7}' })
    } finally {
      server.stop(true)
    }
    const nowhere = await new HttpOpencodeServerAdapter(join(directory, "none.json"), 2000).command({ url: "http://127.0.0.1:9", password: null }, "s", "ctx-recomp", "")
    expect([nowhere.ok, (nowhere as { status: number | null }).status]).toEqual([false, null])
  })
})

describe("BunMagicContextProgressAdapter", () => {
  it("reads summaries, reach, the wrapup marker, an unexpired lease, staged summaries and the runs since a moment", async () => {
    const store = join(directory, "context.db")
    makeSyncContextStore(store, {
      format: 95,
      sessions: {
        ses_a: { compartments: [{ start: "m1", end: "m2" }, { start: "m3", end: "m4" }] },
        ses_old: { harness: "opencode", compartments: [{ start: "m1", end: "m2" }] },
      },
      extraSql: [
        "update compartments set end_message = 140 where session_id = 'ses_a' and sequence = 1",
        "insert into compartments (session_id, sequence, start_message, end_message, title, content, created_at, harness) values ('ses_a', 5, 1, 900, 't', 'c', 1, 'opencode')",
        "insert into session_meta (session_id, harness, wrapup_in_progress_state) values ('ses_a', 'opencode2', '{\"expiresAt\": 5000}')",
        "insert into compartment_state_lease (session_id, holder_id, acquired_at, expires_at, owner_pid) values ('ses_a', 'h', 1, 3000, 1)",
        "insert into recomp_compartments (session_id, sequence, start_message, end_message, title, content, pass_number, created_at) values ('ses_a', 0, 1, 2, 't', 'c', 1, 1)",
        "insert into historian_runs (session_id, run_kind, status, failure_reason, chunk_start_ordinal, chunk_end_ordinal, compartments_produced, created_at) values ('ses_a', 'incremental', 'success', null, 1, 50, 1, 100)",
        "insert into historian_runs (session_id, run_kind, status, failure_reason, chunk_start_ordinal, chunk_end_ordinal, compartments_produced, created_at) values ('ses_a', 'wrapup', 'failed', 'timeout', 51, null, 0, 2000)",
      ].join(";\n"),
    })
    const adapter = new BunMagicContextProgressAdapter(new BunMagicContextSyncStoreAdapter())
    expect(adapter.snapshot(store, "ses_a", 1000, 2500)).toEqual({
      summaries: 2,
      reach: 140,
      wrapup: "running",
      leased: true,
      staged: 1,
      runs: [{ kind: "wrapup", status: "failed", failure: "timeout", chunk_start: 51, chunk_end: null, compartments: 0, at: 2000 }],
    })
    expect(adapter.snapshot(store, "ses_a", 0, 9000)).toMatchObject({ wrapup: "left-behind", leased: false, runs: [{ status: "success" }, { status: "failed" }] })
    expect(adapter.snapshot(store, "ses_old", 0, 0)).toEqual({ summaries: 1, reach: 0, wrapup: "none", leased: false, staged: 0, runs: [] })
    expect(adapter.snapshot(store, "ses_none", 0, 0)).toEqual({ summaries: 0, reach: null, wrapup: "none", leased: false, staged: 0, runs: [] })
    const bare = join(directory, "bare.db")
    makeSyncContextStore(bare, { format: 95, without: ["compartments", "compartment_state_lease", "recomp_compartments", "historian_runs"] })
    expect(adapter.snapshot(bare, "ses_a", 0, 0)).toEqual({ summaries: 0, reach: null, wrapup: "none", leased: false, staged: 0, runs: [] })
    const start = Date.now()
    await new SystemTimerAdapter().sleep(20)
    expect(Date.now() - start).toBeGreaterThanOrEqual(15)
  })
})
