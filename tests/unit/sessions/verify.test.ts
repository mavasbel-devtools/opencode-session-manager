import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { join } from "node:path"
import { VerifyProfileUseCase } from "@session-manager/application/VerifyProfileUseCase"
import type { CatalogedSession, MagicContextSessionStats } from "@session-manager/domain/model/SessionCatalog"
import { countBySeverity, DEFAULT_BEHIND, finding, type SessionVitals, type VerifyInput, verifyLines, vitalsFindings } from "@session-manager/domain/model/Verify"
import type { StoreHealth } from "@session-manager/domain/ports/outbound/MagicContextSyncStorePort"
import { VERIFY_USAGE, VerifyCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/VerifyCliAdapter"
import { BunMagicContextSyncStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMagicContextSyncStoreAdapter"
import { FakeOutput } from "@test/support/maintenance/fakes/output"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { makeSyncContextStore } from "@test/support/sessions/sync-stores"

const NONE: SessionVitals = { lastSummarizedMessageId: null, wrapup: "none", lastContextPercentage: null, lastInputTokens: null }

describe("verify rules", () => {
  it("turns a session's vitals into findings", () => {
    expect(vitalsFindings("s", NONE, null, 10)).toEqual([])
    expect(vitalsFindings("s", { ...NONE, lastContextPercentage: 100, lastInputTokens: 1_000_000 }, 5, 10)).toEqual([
      finding("over-limit", "s", "last prompt at 100.0 % of the window (1000000 tokens); run /ctx-wrapup in it"),
    ])
    expect(vitalsFindings("s", { ...NONE, lastContextPercentage: 90, lastSummarizedMessageId: "m", wrapup: "running" }, 11, 10).map((entry) => entry.detail)).toEqual([
      "last prompt at 90.0 % of the window",
      "11 messages after the newest summary (threshold 10); /ctx-wrapup catches up",
      "a wrapup is in progress",
    ])
    expect(vitalsFindings("s", { ...NONE, lastContextPercentage: 89.9, wrapup: "left-behind" }, 11, 10).map((entry) => entry.kind)).toEqual([
      "summaries-behind",
      "wrapup-left-behind",
    ])
    expect(vitalsFindings("s", NONE, 11, 10)[0]!.detail).toBe("no summaries for its 11 messages (threshold 10); /ctx-wrapup catches up")
    expect(DEFAULT_BEHIND).toBe(300)
  })

  it("counts findings by severity and prints a report", () => {
    const findings = [finding("store-integrity", null, "a"), finding("near-limit", "s", "b"), finding("wrapup-running", "s", "c")]
    expect(countBySeverity(findings)).toEqual({ error: 1, warning: 1, info: 1 })
    const health: StoreHealth = { integrity_ok: false, foreign_keys_ok: true }
    expect(
      verifyLines({
        opencode_db: "/o.db",
        context_db: "/c.db",
        magic_context_format: null,
        checks: { opencode: health, context: { integrity_ok: true, foreign_keys_ok: false } },
        sessions_checked: 2,
        sessions: [],
        findings,
        counts: countBySeverity(findings),
        ok: false,
      }),
    ).toEqual([
      "opencode.db: /o.db — integrity FAILED, foreign keys ok",
      "context.db: /c.db — integrity ok, foreign keys FAILED",
      "2 sessions checked",
      "ERROR store-integrity: a",
      "WARN  near-limit s: b",
      "INFO  wrapup-running s: c",
      "PROBLEMS: 1 errors, 1 warnings, 1 notes",
    ])
  })
})

const stats = (extra: Partial<MagicContextSessionStats> = {}): MagicContextSessionStats => ({
  compartments: 1,
  tags: 1,
  lastTag: 1,
  notes: 0,
  memoriesOriginated: 0,
  project: "dir:p",
  ...extra,
})
const session = (id: string, extra: Partial<CatalogedSession> = {}): CatalogedSession => ({
  id,
  generation: "v2",
  projectId: "p",
  parentId: null,
  forkOf: null,
  title: id,
  directory: "/w",
  timeCreated: 1,
  timeUpdated: 2,
  timeArchived: null,
  entries: 3,
  magicContext: stats(),
  ...extra,
})

interface World {
  readonly existing?: readonly string[]
  readonly vitals?: Readonly<Record<string, SessionVitals>>
  readonly anchors?: Readonly<Record<string, readonly string[]>>
  readonly orphans?: Readonly<Record<string, MagicContextSessionStats>>
  readonly health?: StoreHealth
  readonly derived?: string | null
  readonly contextDerived?: string | null
}

function useCase(world: World = {}) {
  const resolved: string[] = []
  const exists = new Set(world.existing ?? ["/o.db", "/c.db", "/w"])
  const verify = new VerifyProfileUseCase({
    sessions: { sessions: () => [], messageIds: (_db, id) => [`${id}-m0`, `${id}-m1`, `${id}-m2`] },
    opencodeStore: { health: () => world.health ?? { integrity_ok: true, foreign_keys_ok: true } },
    contexts: { formatVersion: () => 95, summary: () => ({ available: true, schemaVersion: 95, sessions: world.orphans ?? {} }) },
    contextStore: {
      health: () => ({ integrity_ok: true, foreign_keys_ok: true }),
      sourceState: (_db, id) => ({ harness: "opencode2", anchors: world.anchors?.[id] ?? [`${id}-m1`], project: "dir:p", reach: 1 }),
      vitals: (_db, id) => world.vitals?.[id] ?? { ...NONE, lastSummarizedMessageId: `${id}-m1` },
    },
    identity: {
      resolve: (directory) => {
        resolved.push(directory)
        return world.derived === null ? null : { id: world.derived ?? "p", worktree: directory, vcs: null, real: directory }
      },
    },
    contextIdentity: { identityOf: () => (world.contextDerived === undefined ? "dir:p" : world.contextDerived) },
    fileSystem: { exists: (path) => exists.has(path) },
    runtime: { now: () => 0 },
  })
  return { verify, resolved }
}

const input = (extra: Partial<VerifyInput> = {}): VerifyInput => ({
  opencodeDb: "/o.db",
  contextDb: "/c.db",
  readableOpencodeDb: null,
  readableContextDb: null,
  sessions: "all",
  behind: 300,
  ...extra,
})

describe("VerifyProfileUseCase", () => {
  it("passes a sound profile, the OpenCode 2 row of a session winning, folders asked once", () => {
    const { verify, resolved } = useCase()
    const report = verify.verify(input(), { sessions: [session("ses_a", { generation: "v1" }), session("ses_a"), session("ses_b")] })
    expect(report).toMatchObject({ ok: true, sessions_checked: 2, findings: [], magic_context_format: 95, context_db: "/c.db" })
    expect(report.sessions[0]).toEqual({ id: "ses_a", title: "ses_a", directory: "/w", messages: 3, summaries: 1, unsummarized: 1, last_context_percentage: null, wrapup: "none" })
    expect(resolved).toEqual(["/w"])
  })

  it("finds broken stores, mismatched projects, stale and lagging summaries, orphans and unknown sessions", () => {
    const { verify } = useCase({
      health: { integrity_ok: false, foreign_keys_ok: false },
      derived: "q",
      contextDerived: "dir:other",
      anchors: { ses_a: ["gone"] },
      vitals: { ses_a: { ...NONE, lastSummarizedMessageId: "not-in-history" } },
      orphans: { ses_a: stats(), ses_x: stats({ compartments: 0, tags: 0, notes: 1 }), ses_m: stats({ compartments: 0, tags: 0, memoriesOriginated: 3 }) },
    })
    const report = verify.verify(input({ behind: 0 }), { sessions: [session("ses_a"), session("ses_n", { magicContext: null })] })
    expect(report.findings.map((entry) => `${entry.kind} ${entry.session_id}`)).toEqual([
      "store-integrity null",
      "store-foreign-keys null",
      "orphan-context-state ses_x",
      "project-mismatch ses_a",
      "stale-summaries ses_a",
      "context-project-mismatch ses_a",
      "project-mismatch ses_n",
    ])
    expect(report.sessions.map((entry) => entry.unsummarized)).toEqual([null, null])
    expect(verify.verify(input({ sessions: ["ses_a", "ses_z", "ses_a"] }), { sessions: [session("ses_a")] }).findings.map((entry) => entry.kind)).toContain("session-not-found")
  })

  it("leaves out what cannot be derived: a missing folder, no project, no Magic Context store", () => {
    const missing = useCase({ existing: ["/o.db", "/c.db"] }).verify.verify(input(), { sessions: [session("ses_a")] })
    expect(missing.findings).toEqual([])
    expect(useCase({ derived: null, contextDerived: null }).verify.verify(input(), { sessions: [session("ses_a", { magicContext: stats({ project: null }) })] }).findings).toEqual([])
    const bare = useCase({ existing: ["/o.db", "/w"] }).verify.verify(input({ readableOpencodeDb: "/o.db" }), { sessions: [session("ses_a")] })
    expect(bare).toMatchObject({ context_db: null, magic_context_format: null, checks: { context: null } })
    expect(bare.sessions[0]).toMatchObject({ summaries: 0, unsummarized: null, wrapup: null })
  })
})

describe("VerifyCliAdapter", () => {
  function cli(ok = true) {
    const output = new FakeOutput()
    const seen: { input: VerifyInput; sessions: number }[] = []
    const events: string[] = []
    const adapter = new VerifyCliAdapter({
      verify: {
        verify: (verifyInput, catalog) => {
          seen.push({ input: verifyInput, sessions: catalog.sessions.length })
          return {
            opencode_db: verifyInput.opencodeDb,
            context_db: null,
            magic_context_format: null,
            checks: { opencode: { integrity_ok: true, foreign_keys_ok: true }, context: null },
            sessions_checked: 0,
            sessions: [],
            findings: [],
            counts: { error: ok ? 0 : 1, warning: 0, info: 0 },
            ok,
          }
        },
      },
      profiles: {
        open: (profile) => {
          events.push(`open ${profile.dataHome}`)
          return { catalog: { profile, sessions: [], magicContext: { available: false, schemaVersion: null } }, snapshot: null }
        },
        close: () => {
          events.push("close")
        },
      },
      output,
      runtime: Object.assign(new FakeRuntime(), { home: "/home/me" }),
      environment: {},
    })
    return { adapter, output, seen, events }
  }

  it("verifies the default profile or --data, all sessions or the named ones, as text or JSON", () => {
    const all = cli()
    expect(all.adapter.run([])).toBe(0)
    expect(all.seen[0]!.input).toMatchObject({ opencodeDb: "/home/me/.local/share/opencode/opencode.db", sessions: "all", behind: 300 })
    expect([all.events, all.output.lines.at(-1)]).toEqual([["open /home/me/.local/share", "close"], "OK: 0 errors, 0 warnings, 0 notes"])
    const named = cli(false)
    expect(named.adapter.run(["--data", "/d", "--session", "ses_a", "--behind", "5", "--json"])).toBe(1)
    expect(named.seen[0]!.input).toMatchObject({ opencodeDb: "/d/opencode/opencode.db", sessions: ["ses_a"], behind: 5 })
    expect(JSON.parse(named.output.text()).ok).toBe(false)
  })

  it("prints the usage for bad arguments", () => {
    for (const argv of [["--bogus"], ["--behind", "x"], ["--behind", "-2"], ["--behind", "1.5"]]) {
      const { adapter, output, events } = cli()
      expect([adapter.run(argv), output.lines, events]).toEqual([2, [VERIFY_USAGE], []])
    }
  })
})

describe("BunMagicContextSyncStoreAdapter.vitals", () => {
  let directory = ""
  beforeEach(() => {
    directory = temporaryWorkspace("oc-vitals-")
  })
  afterEach(() => {
    removeTemporary(directory)
  })
  const store = new BunMagicContextSyncStoreAdapter()

  it("reads the newest summary's end (OpenCode 2 label first), the wrapup marker and the last prompt", () => {
    const file = join(directory, "c.db")
    makeSyncContextStore(file, {
      format: 95,
      sessions: {
        ses_a: { compartments: [{ start: "a0", end: "a1" }, { start: "a2", end: "a3" }], meta: true },
        ses_b: { harness: "opencode", compartments: [{ start: "old", end: "old" }], meta: true },
        ses_c: { meta: true },
        ses_d: {},
      },
      extraSql: `insert into compartments (session_id, sequence, start_message, end_message, start_message_id, end_message_id, title, content, created_at, harness)
                 values ('ses_b', 1, 0, 0, 'new', 'new2', 't', 'c', 1, 'opencode2');
                 update session_meta set last_context_percentage = 55.5, last_input_tokens = 555 where session_id = 'ses_a';
                 update session_meta set wrapup_in_progress_state = '{"expiresAt":100}' where session_id = 'ses_b';
                 update session_meta set wrapup_in_progress_state = '{"expiresAt":100}', last_input_tokens = null, last_context_percentage = 3 where session_id = 'ses_c';`,
    })
    expect(store.vitals(file, "ses_a", 50)).toEqual({ lastSummarizedMessageId: "a3", wrapup: "none", lastContextPercentage: 55.5, lastInputTokens: 555 })
    expect(store.vitals(file, "ses_b", 50)).toEqual({ lastSummarizedMessageId: "new2", wrapup: "running", lastContextPercentage: null, lastInputTokens: null })
    expect(store.vitals(file, "ses_b", 500).wrapup).toBe("left-behind")
    expect(store.vitals(file, "ses_c", 500)).toEqual({ lastSummarizedMessageId: null, wrapup: "left-behind", lastContextPercentage: 3, lastInputTokens: null })
    expect(store.vitals(file, "ses_d", 0)).toEqual(NONE)
  })

  it("reads a store without those tables as nothing recorded", () => {
    const file = join(directory, "bare.db")
    makeSyncContextStore(file, { without: ["compartments", "session_meta"] })
    expect(store.vitals(file, "ses_a", 0)).toEqual(NONE)
  })
})
