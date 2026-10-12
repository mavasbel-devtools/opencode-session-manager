import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { join } from "node:path"
import { ForkSessionUseCase } from "@session-manager/application/ForkSessionUseCase"
import { ServerNotFoundError } from "@session-manager/domain/errors/ServerNotFoundError"
import { ServerRefusedError } from "@session-manager/domain/errors/ServerRefusedError"
import { forkLines, forkTitle, isSettled, opencodeId, SLUG_ADJECTIVES, SLUG_NOUNS } from "@session-manager/domain/model/Fork"
import type { ForkAnswer, ServerConnection } from "@session-manager/domain/model/Rebuild"
import type { ForkInput } from "@session-manager/domain/ports/inbound/ForkSessionPort"
import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"
import { FORK_USAGE, ForkCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/ForkCliAdapter"
import { HttpOpencodeServerAdapter } from "@session-manager/infrastructure/adapters/outbound/opencode2/HttpOpencodeServerAdapter"
import { BunSessionSyncStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunSessionSyncStoreAdapter"
import { OpencodeIdentifiersAdapter } from "@session-manager/infrastructure/adapters/outbound/system/OpencodeIdentifiersAdapter"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { query } from "@test/support/maintenance/repositories"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { BLOB_HASH, makeOpenCode2Store } from "@test/support/sessions/opencode-stores"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-fork-")
})
afterEach(() => {
  removeTemporary(directory)
})

describe("OpenCode's fork rules", () => {
  it("titles a fork as OpenCode does", () => {
    expect([forkTitle("Plan"), forkTitle("Plan (fork #1)"), forkTitle("Plan (fork #9)"), forkTitle("(fork #2)"), forkTitle(null)]).toEqual([
      "Plan (fork #1)",
      "Plan (fork #2)",
      "Plan (fork #10)",
      "(fork #2) (fork #1)",
      null,
    ])
  })

  it("copies only settled messages: not a streaming reply, nor a running shell command or compaction", () => {
    expect([
      isSettled("user", "{}"),
      isSettled("assistant", '{"time":{"created":1,"completed":2}}'),
      isSettled("assistant", '{"time":{"created":1}}'),
      isSettled("assistant", '{"time":{"created":1,"completed":null}}'),
      isSettled("assistant", "{}"),
      isSettled("shell", '{"status":"running"}'),
      isSettled("shell", '{"status":"exited"}'),
      isSettled("compaction", '{"status":"running"}'),
      isSettled("compaction", '{"status":"completed"}'),
      isSettled("assistant", "not json"),
    ]).toEqual([true, true, false, false, false, false, true, false, true, true])
  })

  it("makes ids in OpenCode's format: a real fork message id, and a descending session id", () => {
    // OpenCode's own fork made at 1791834715427 named its messages msg_131abf523001…_<seq>.
    expect(opencodeId("msg", 1791834715427, 1, false, new Uint8Array(14))).toBe("msg_131abf52300100000000000000")
    const descending = opencodeId("ses", 1791834715427, 1, true, new Uint8Array(14).fill(61))
    expect(descending).toBe("ses_ece540adcffezzzzzzzzzzzzzz")
    expect(opencodeId("ses", 1791834715428, 1, true, new Uint8Array(14)) < opencodeId("ses", 1791834715427, 1, true, new Uint8Array(14))).toBe(true)
  })

  it("writes what a fork through the server made", () => {
    expect(forkLines({ server: "http://s", parent_id: "ses_p", fork_id: "ses_f", title: "T (fork #1)", boundary: { type: "through", messageID: "msg_9" }, directory: "/w" })).toEqual([
      "Forked ses_p → ses_f (through msg_9) through http://s",
      '"T (fork #1)" in /w',
      "Magic Context gives the fork its parent's state when the first prompt is sent in it.",
    ])
    expect(forkLines({ server: "http://s", parent_id: "ses_p", fork_id: "ses_f", title: null, boundary: null, directory: null }).slice(0, 2)).toEqual([
      "Forked ses_p → ses_f through http://s",
      '"(untitled)"',
    ])
  })
})

describe("OpencodeIdentifiersAdapter", () => {
  it("counts within a millisecond, starts again at the next, and makes slugs from OpenCode's words", () => {
    let now = 1791834715427
    let calls = 0
    const ids = new OpencodeIdentifiersAdapter({ now: () => now }, (length) => new Uint8Array(length).fill(calls++))
    expect(ids.messageBase()).toBe(opencodeId("msg", now, 1, false, new Uint8Array(14).fill(0)))
    expect(ids.sessionId()).toBe(opencodeId("ses", now, 2, true, new Uint8Array(14).fill(1)))
    now++
    expect(ids.messageBase()).toBe(opencodeId("msg", now, 1, false, new Uint8Array(14).fill(2)))
    expect(ids.slug()).toBe(`${SLUG_ADJECTIVES[3 % SLUG_ADJECTIVES.length]}-${SLUG_NOUNS[3 % SLUG_NOUNS.length]}`)
    const real = new OpencodeIdentifiersAdapter({ now: () => 1 })
    expect(real.sessionId()).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(real.slug()).toMatch(/^[a-z]+-[a-z]+$/)
  })
})

describe("ForkSessionUseCase", () => {
  const setup = (answer: ForkAnswer, recorded: ServerConnection | null = { url: "http://local", password: "pw" }) => {
    const calls: string[] = []
    const useCase = new ForkSessionUseCase({
      recorded: () => recorded,
      searched: () => "/state/service.json",
      command: async () => ({ ok: true }),
      fork: async (server, id, before) => {
        calls.push(`${server.url} ${server.password} ${id} ${before}`)
        return answer
      },
    })
    return { useCase, calls }
  }
  const input = (extra: Partial<ForkInput> = {}): ForkInput => ({ sessionId: "ses_p", before: null, server: null, ...extra })
  const made: ForkAnswer = { ok: true, session: { id: "ses_f", title: "T (fork #1)", boundary: { type: "before", messageID: "msg_3" }, directory: "/w" } }

  it("forks on the recorded server, or a named one with the recorded password", async () => {
    const local = setup(made)
    expect(await local.useCase.fork(input({ before: "msg_3" }))).toEqual({
      server: "http://local",
      parent_id: "ses_p",
      fork_id: "ses_f",
      title: "T (fork #1)",
      boundary: { type: "before", messageID: "msg_3" },
      directory: "/w",
    })
    expect(local.calls).toEqual(["http://local pw ses_p msg_3"])
    const named = setup(made, null)
    expect((await named.useCase.fork(input({ server: "http://other" }))).server).toBe("http://other")
    expect(named.calls).toEqual(["http://other null ses_p null"])
  })

  it("refuses without a server, and reports the server's refusal", async () => {
    await expect(setup(made, null).useCase.fork(input())).rejects.toThrow(new ServerNotFoundError("/state/service.json"))
    const refused = setup({ ok: false, status: 404, detail: "Session not found: ses_p" })
    await expect(refused.useCase.fork(input())).rejects.toThrow(new ServerRefusedError("fork ses_p", 404, "Session not found: ses_p"))
    expect(new ServerRefusedError("fork x", null, "down").message).toBe("the OpenCode server refused to fork x: no answer: down")
  })
})

describe("HttpOpencodeServerAdapter.fork", () => {
  it("posts the fork, reads the new session, and reports a refusal or an answer without a session", async () => {
    const seen: string[] = []
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const url = new URL(request.url)
        seen.push(`${url.pathname} ${await request.text()}`)
        if (url.pathname.includes("ses_gone")) return Response.json({ message: "Session not found: ses_gone" }, { status: 404 })
        if (url.pathname.includes("ses_odd")) return Response.json({ data: { title: 3 } })
        if (url.pathname.includes("ses_bare"))
          return Response.json({ data: { id: "ses_f2", title: 3, fork: { boundary: { type: "sideways", messageID: "msg_1" } }, location: {} } })
        return Response.json({ data: { id: "ses_f", title: "T (fork #1)", fork: { sessionID: "ses_p", boundary: { type: "through", messageID: "msg_9" } }, location: { directory: "/w" } } })
      },
    })
    try {
      const adapter = new HttpOpencodeServerAdapter(join(directory, "none.json"), 2000)
      const at = { url: server.url.origin, password: "pw" }
      expect(await adapter.fork(at, "ses_p", null)).toEqual({ ok: true, session: { id: "ses_f", title: "T (fork #1)", boundary: { type: "through", messageID: "msg_9" }, directory: "/w" } })
      expect(await adapter.fork(at, "ses_p", "msg_3")).toMatchObject({ ok: true })
      expect(seen.slice(0, 2)).toEqual(["/api/session/ses_p/fork {}", '/api/session/ses_p/fork {"before":"msg_3"}'])
      expect(await adapter.fork(at, "ses_gone", null)).toEqual({ ok: false, status: 404, detail: "Session not found: ses_gone" })
      expect(await adapter.fork(at, "ses_odd", null)).toEqual({ ok: false, status: 200, detail: "the answer names no session" })
      expect(await adapter.fork(at, "ses_bare", null)).toEqual({ ok: true, session: { id: "ses_f2", title: null, boundary: null, directory: null } })
    } finally {
      server.stop(true)
    }
  })
})

describe("ForkCliAdapter", () => {
  const cli = () => {
    const output = new FakeOutput()
    const inputs: ForkInput[] = []
    const adapter = new ForkCliAdapter({
      fork: {
        fork: async (input) => {
          inputs.push(input)
          return { server: "http://s", parent_id: input.sessionId, fork_id: "ses_f", title: "T (fork #1)", boundary: null, directory: "/w" }
        },
      },
      output,
    })
    return { adapter, output, inputs }
  }

  it("forks one session, as text or JSON", async () => {
    const text = cli()
    expect(await text.adapter.run(["--session", "ses_p", "--before", "msg_3", "--server", "http://other"])).toBe(0)
    expect(text.inputs).toEqual([{ sessionId: "ses_p", before: "msg_3", server: "http://other" }])
    expect(text.output.lines[0]).toBe("Forked ses_p → ses_f through http://s")
    const json = cli()
    expect(await json.adapter.run(["--session", "ses_p", "--json"])).toBe(0)
    expect(JSON.parse(json.output.text())).toMatchObject({ fork_id: "ses_f" })
  })

  it("prints the usage for no session, two sessions or an unknown option", async () => {
    for (const argv of [[], ["--session", "a", "--session", "b"], ["--session", "a", "--all"]]) {
      const { adapter, output, inputs } = cli()
      expect(await adapter.run(argv)).toBe(2)
      expect([output.text(), inputs.length]).toEqual([FORK_USAGE, 0])
    }
  })
})

describe("BunSessionSyncStoreAdapter.forkSessions", () => {
  const store = new BunSessionSyncStoreAdapter()
  const rewriter: TextRewriter = { rewrite: (text) => text.replaceAll("C:/Users/Me", "/home/me"), residual: (text) => text.includes("D:\\\\") }
  const plan = (extra: object = {}) => ({
    sourceId: "ses_a",
    parentId: "ses_a",
    forkId: "ses_fork",
    messageBase: "msg_base",
    slug: "calm-otter",
    boundaryMessageId: "m1",
    rewriter,
    now: 5000,
    ...extra,
  })

  it("writes the target's settled messages through the boundary and the source's after it, as OpenCode writes a fork", () => {
    const target = join(directory, "target.db")
    const source = join(directory, "source.db")
    makeOpenCode2Store(target, {
      projects: [{ id: "p_t", worktree: "/home/me/repo" }],
      sessions: [{ id: "ses_a", directory: "/home/me/repo", projectId: "p_t", title: "Plan (fork #1)", entries: ["m0", "run", "m1", "t3"] }],
      extraSql: "update session_message set type = 'shell', data = '{\"status\":\"running\"}' where id = 'run'",
    })
    makeOpenCode2Store(source, {
      sessions: [{ id: "ses_a", directory: "C:/Users/Me/repo", entries: ["m0", "run", "m1", "s3", "s4"], extras: true }],
      extraSql: [
        "update session_message set data = '{\"cwd\":\"C:/Users/Me/repo\",\"text\":\"D:\\\\left\"}' where id = 's3'",
        "update session_message set type = 'assistant', data = '{\"time\":{\"created\":1}}' where id = 's4'",
        "insert into instruction_entry values ('ses_a', 'old', null, 1, 1, 1)",
      ].join(";\n"),
    })
    expect(store.forkSessions(source, target, [plan()])).toEqual([{ fork_id: "ses_fork", parent_id: "ses_a", inherited_messages: 2, appended_messages: 1, residual_windows_paths: 1 }])
    expect(query(target, "select id, parent_id, fork_session_id, fork_boundary, project_id, directory, title, slug, version, cost, tokens_input, time_created, time_updated from session_v2 where id = 'ses_fork'")).toEqual([
      {
        id: "ses_fork",
        parent_id: null,
        fork_session_id: "ses_a",
        fork_boundary: '{"type":"through","messageID":"m1"}',
        project_id: "p_t",
        directory: "/home/me/repo",
        title: "Plan (fork #2)",
        slug: "calm-otter",
        version: "2.0.24",
        cost: 0,
        tokens_input: 0,
        time_created: 5000,
        time_updated: 5000,
      },
    ])
    const rows = query(target, "select id, seq, type, data from session_message where session_id = 'ses_fork' order by seq") as { id: string; seq: number; data: string }[]
    expect(rows.map((row) => [row.id, row.seq])).toEqual([
      ["msg_base_0", 0],
      ["msg_base_2", 2],
      ["msg_base_3", 3],
    ])
    expect(rows[2]!.data).toBe('{"cwd":"/home/me/repo","text":"D:\\\\left"}')
    expect(query(target, "select seq, owner_id from event_sequence where aggregate_id = 'ses_fork'")).toEqual([{ seq: 3, owner_id: null }])
    expect(query(target, "select epoch_start, through_seq, initial_values = current_values as same from instruction_state where session_id = 'ses_fork'")).toEqual([{ epoch_start: 0, through_seq: 0, same: 1 }])
    expect(query(target, "select key, removed, time_created from instruction_entry where session_id = 'ses_fork'")).toEqual([{ key: "core/environment", removed: 0, time_created: 5000 }])
    expect(query(target, `select count(*) as n from instruction_blob where hash = '${BLOB_HASH}'`)).toEqual([{ n: 1 }])
    expect(query(target, "pragma foreign_key_check")).toEqual([])
    // The parent is untouched.
    expect(query(target, "select count(*) as n from session_message where session_id = 'ses_a'")).toEqual([{ n: 4 }])
  })

  it("forks without instruction state, writes nothing for no plans, and refuses a missing parent or boundary", () => {
    const target = join(directory, "target.db")
    makeOpenCode2Store(target, { sessions: [{ id: "ses_a", directory: "/w", entries: ["m0", "m1"] }] })
    expect(store.forkSessions(join(directory, "never.db"), target, [])).toEqual([])
    expect(store.forkSessions(target, target, [plan({ rewriter: null })])).toEqual([{ fork_id: "ses_fork", parent_id: "ses_a", inherited_messages: 2, appended_messages: 0, residual_windows_paths: 0 }])
    expect(query(target, "select title from session_v2 where id = 'ses_fork'")).toEqual([{ title: "ses_a (fork #1)" }])
    expect(query(target, "select count(*) as n from instruction_state where session_id = 'ses_fork'")).toEqual([{ n: 0 }])
    expect(() => store.forkSessions(target, target, [plan({ forkId: "ses_x", parentId: "ses_none" })])).toThrow("fork parent session not found: ses_none")
    expect(() => store.forkSessions(target, target, [plan({ forkId: "ses_x", boundaryMessageId: "m9" })])).toThrow("fork boundary message not found: m9")
    expect(query(target, "select count(*) as n from session_v2 where id = 'ses_x'")).toEqual([{ n: 0 }])
  })

  it("keeps a parent's null title, and forks a parent with no settled message through the boundary", () => {
    const target = join(directory, "target.db")
    makeOpenCode2Store(target, {
      sessions: [{ id: "ses_a", directory: "/w", entries: ["m0", "m1"] }],
      extraSql: "update session_v2 set title = null where id = 'ses_a'; update session_message set type = 'assistant', data = '{}' where session_id = 'ses_a'",
    })
    expect(store.forkSessions(target, target, [plan({ rewriter: null })])[0]).toMatchObject({ inherited_messages: 0, appended_messages: 0 })
    expect(query(target, "select title from session_v2 where id = 'ses_fork'")).toEqual([{ title: null }])
    expect(query(target, "select count(*) as n from event_sequence where aggregate_id = 'ses_fork'")).toEqual([{ n: 0 }])
  })
})
