import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { RepairSessionLocationsUseCase } from "@session-manager/application/RepairSessionLocationsUseCase"
import { InvalidMapRuleError } from "@session-manager/domain/errors/InvalidMapRuleError"
import type { WorktreeLinkOutcome } from "@session-manager/domain/model/GitWorktree"
import type { Relocation } from "@session-manager/domain/model/PathMapping"
import type { RepairWorktreeLinksPort } from "@session-manager/domain/ports/inbound/RepairWorktreeLinksPort"
import type { LocationRepairMappingsPort } from "@session-manager/domain/ports/outbound/LocationRepairMappingsPort"
import type { StoreLockHandle, StoreLockPort } from "@session-manager/domain/ports/outbound/StoreLockPort"
import { NodeLocationRepairMappingsAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeLocationRepairMappingsAdapter"
import { FakeStoreLock } from "@test/support/maintenance/fakes/locks"
import { FakeRuntime } from "@test/support/maintenance/fakes/runtime"
import { FakeFileSystemAdapter, FakeSessionHostAdapter } from "@test/support/fakes/transfer-ports"

class FakeMappingsAdapter implements LocationRepairMappingsPort {
  constructor(public rules: Array<{ from: string; to: string }> = []) {}

  mappings(): readonly { from: string; to: string }[] {
    return this.rules
  }
}

/** Work tree outcomes by folder; every other folder is outside Git. */
class FakeWorktreeLinks implements RepairWorktreeLinksPort {
  public readonly outcomes = new Map<string, WorktreeLinkOutcome["status"]>()
  public readonly calls: Array<{ directory: string; rules: readonly Relocation[]; dryRun: boolean | undefined }> = []

  constructor() {}

  ensure(directory: string, rules: readonly Relocation[], dryRun?: boolean): WorktreeLinkOutcome {
    this.calls.push({ directory, rules, dryRun })
    const status = this.outcomes.get(directory) ?? "none"
    return { directory, root: status === "none" ? null : directory, status, command: status === "repaired" ? { cwd: directory, paths: [] } : null }
  }
}

const STORE = "/data/opencode/opencode.db"

describe("RepairSessionLocationsUseCase", () => {
  let host: FakeSessionHostAdapter
  let files: FakeFileSystemAdapter
  let mappings: FakeMappingsAdapter
  let worktrees: FakeWorktreeLinks
  let locks: FakeStoreLock
  let runtime: FakeRuntime

  beforeEach(() => {
    host = new FakeSessionHostAdapter()
    files = new FakeFileSystemAdapter()
    mappings = new FakeMappingsAdapter([{ from: "/old/workspace", to: "/new/workspace" }])
    worktrees = new FakeWorktreeLinks()
    locks = new FakeStoreLock()
    runtime = new FakeRuntime()
  })

  function useCase(lockPort: StoreLockPort = locks): RepairSessionLocationsUseCase {
    return new RepairSessionLocationsUseCase(host, files, mappings, worktrees, { locks: lockPort, runtime, store: STORE })
  }

  it("moves only a missing mapped session to an existing replacement", async () => {
    host.sessions.push({ id: "ses_move", title: "Move", directory: "/old/workspace/a", projectId: "p", path: "a", timeUpdated: 1 })
    host.sessions.push({ id: "ses_present", title: "Present", directory: "/old/workspace/b", projectId: "p", path: "b", timeUpdated: 1 })
    host.sessions.push({ id: "ses_unmapped", title: "Unmapped", directory: "/gone/c", projectId: "p", path: "c", timeUpdated: 1 })
    host.sessions.push({ id: "ses_missing_target", title: "Target", directory: "/old/workspace/d", projectId: "p", path: "d", timeUpdated: 1 })
    files.directories.add("/new/workspace/a")
    files.directories.add("/old/workspace/b")

    const report = await useCase().execute()

    expect(host.moves).toEqual([{ sessionId: "ses_move", directory: "/new/workspace/a" }])
    expect(report).toEqual({
      rules: [{ from: "/old/workspace", to: "/new/workspace" }],
      repaired: [{ session_id: "ses_move", from_directory: "/old/workspace/a", to_directory: "/new/workspace/a" }],
      skipped: [
        { session_id: "ses_present", directory: "/old/workspace/b", reason: "directory-present", to_directory: null },
        { session_id: "ses_unmapped", directory: "/gone/c", reason: "not-mapped", to_directory: null },
        { session_id: "ses_missing_target", directory: "/old/workspace/d", reason: "target-missing", to_directory: "/new/workspace/d" },
      ],
      worktrees: [],
      busy: false,
    })
    expect(files.ensured).toEqual([])
    expect([locks.taken, locks.releases, locks.held.size]).toEqual([[[STORE]], 1, 0])
  })

  it("repairs a mapped work tree once, moves its sessions, and leaves those of a work tree Git cannot resolve", async () => {
    host.sessions.push({ id: "ses_a1", title: "A1", directory: "/old/workspace/a", projectId: "p", path: "", timeUpdated: 1 })
    host.sessions.push({ id: "ses_a2", title: "A2", directory: "/old/workspace/a", projectId: "p", path: "", timeUpdated: 1 })
    host.sessions.push({ id: "ses_b", title: "B", directory: "/old/workspace/b", projectId: "p", path: "", timeUpdated: 1 })
    files.directories.add("/new/workspace/a")
    files.directories.add("/new/workspace/b")
    worktrees.outcomes.set("/new/workspace/a", "repaired")
    worktrees.outcomes.set("/new/workspace/b", "unresolved")

    const report = await useCase().execute()

    expect(worktrees.calls.map((call) => call.directory)).toEqual(["/new/workspace/a", "/new/workspace/b"])
    expect(worktrees.calls[0]!.rules).toEqual([{ from: "/old/workspace", to: "/new/workspace" }])
    expect(host.moves).toEqual([
      { sessionId: "ses_a1", directory: "/new/workspace/a" },
      { sessionId: "ses_a2", directory: "/new/workspace/a" },
    ])
    expect(report.skipped).toEqual([{ session_id: "ses_b", directory: "/old/workspace/b", reason: "worktree-unresolved", to_directory: "/new/workspace/b" }])
    expect(report.worktrees.map((tree) => [tree.directory, tree.status])).toEqual([
      ["/new/workspace/a", "repaired"],
      ["/new/workspace/b", "unresolved"],
    ])
  })

  it("propagates a rejected host move rather than pretending it repaired anything, and still releases the lock", async () => {
    host.sessions.push({ id: "ses_move", title: "Move", directory: "/old/workspace/a", projectId: "p", path: "a", timeUpdated: 1 })
    files.directories.add("/new/workspace/a")
    host.moveError = new Error("host refused")

    await expect(useCase().execute()).rejects.toThrow("host refused")
    expect([locks.releases, locks.held.size]).toEqual([1, 0])
  })

  it("repairs only the named session when an intentional transfer asks for a preflight repair", async () => {
    host.sessions.push({ id: "ses_selected", title: "Selected", directory: "/old/workspace/a", projectId: "p", path: "a", timeUpdated: 1 })
    host.sessions.push({ id: "ses_other", title: "Other", directory: "/old/workspace/b", projectId: "p", path: "b", timeUpdated: 1 })
    files.directories.add("/new/workspace/a")
    files.directories.add("/new/workspace/b")

    const report = await useCase().execute(["ses_selected"])

    expect([host.moves, report]).toEqual([
      [{ sessionId: "ses_selected", directory: "/new/workspace/a" }],
      {
        rules: [{ from: "/old/workspace", to: "/new/workspace" }],
        repaired: [{ session_id: "ses_selected", from_directory: "/old/workspace/a", to_directory: "/new/workspace/a" }],
        skipped: [],
        worktrees: [],
        busy: false,
      },
    ])
  })

  it("does not take the lock or even query the host when no explicit mapping opted in", async () => {
    mappings.rules = []
    host.listSessions = async () => {
      throw new Error("must not query sessions")
    }

    await expect(useCase().execute()).resolves.toEqual({ rules: [], repaired: [], skipped: [], worktrees: [], busy: false })
    expect(locks.taken).toEqual([])
  })

  it("reports busy without reading or moving anything while another process holds the store's lock", async () => {
    locks.held.set(STORE, { pid: 7, command: "repair-sessions", since: "2026-10-19T00:00:00.000Z" })
    host.listSessions = async () => {
      throw new Error("must not query sessions while busy")
    }

    await expect(useCase().execute()).resolves.toEqual({ rules: [{ from: "/old/workspace", to: "/new/workspace" }], repaired: [], skipped: [], worktrees: [], busy: true })
    expect(host.moves).toEqual([])
  })

  it("propagates a lock failure that is not another holder", async () => {
    const broken: StoreLockPort = {
      acquire: (): StoreLockHandle => {
        throw new Error("EACCES: lock folder not writable")
      },
    }

    await expect(useCase(broken).execute()).rejects.toThrow("EACCES")
  })

  it("coalesces concurrent whole-profile repairs and runs selected repairs after them, one at a time", async () => {
    host.sessions.push({ id: "ses_move", title: "Move", directory: "/old/workspace/a", projectId: "p", path: "a", timeUpdated: 1 })
    files.directories.add("/new/workspace/a")
    let lists = 0
    let running = 0
    let overlapped = false
    const original = host.listSessions.bind(host)
    host.listSessions = async () => {
      lists++
      running++
      if (running > 1) overlapped = true
      await Bun.sleep(5)
      running--
      return original()
    }
    // The host reports the move by changing the session's directory, as OpenCode does.
    host.moveSession = async (sessionId, directory) => {
      host.moves.push({ sessionId, directory })
      host.sessions = host.sessions.map((session) => (session.id === sessionId ? { ...session, directory } : session))
      files.directories.add(directory)
    }
    const repair = useCase()

    const first = repair.execute()
    const second = repair.execute()
    const selected = repair.execute(["ses_move"])
    const [a, b, c] = await Promise.all([first, second, selected])

    expect(first).toBe(second)
    expect([lists, overlapped, host.moves]).toEqual([2, false, [{ sessionId: "ses_move", directory: "/new/workspace/a" }]])
    expect([a.repaired.length, b.repaired.length, c.repaired.length, c.skipped[0]!.reason]).toEqual([1, 1, 0, "directory-present"])
    // Once settled, a new whole-profile request runs again rather than reusing the old result.
    const later = repair.execute()
    expect(later).not.toBe(first)
    expect((await later).repaired).toEqual([])
  })

  it("keeps serving requests after a failed run", async () => {
    host.sessions.push({ id: "ses_move", title: "Move", directory: "/old/workspace/a", projectId: "p", path: "a", timeUpdated: 1 })
    files.directories.add("/new/workspace/a")
    host.moveError = new Error("host refused")
    const repair = useCase()
    const failed = repair.execute()
    const queued = repair.execute(["ses_move"])

    await expect(failed).rejects.toThrow("host refused")
    await expect(queued).rejects.toThrow("host refused")
    host.moveError = undefined
    expect((await repair.execute()).repaired.length).toBe(1)
  })
})

describe("NodeLocationRepairMappingsAdapter", () => {
  let root = ""

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "session-manager-repair-config-"))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  function adapter(): NodeLocationRepairMappingsAdapter {
    return new NodeLocationRepairMappingsAdapter({ XDG_CONFIG_HOME: root }, () => "/home/unused")
  }

  function write(contents: string): void {
    const directory = path.join(root, "opencode")
    fs.mkdirSync(directory, { recursive: true })
    fs.writeFileSync(path.join(directory, "session-manager.jsonc"), contents)
  }

  it("returns no rules without a config and reads comment-bearing explicit maps", () => {
    expect(adapter().mappings()).toEqual([])
    write('{ // maps are opt-in\n "location_repair": { "maps": [{ "from": "/old", "to": "/new" }] } }')
    expect(adapter().mappings()).toEqual([{ from: "/old", to: "/new" }])
  })

  it("falls back to ~/.config when XDG_CONFIG_HOME is unset or empty", () => {
    write('{ "location_repair": { "maps": [{ "from": "/old", "to": "/new" }] } }')
    for (const environment of [{}, { XDG_CONFIG_HOME: "" }])
      expect(new NodeLocationRepairMappingsAdapter(environment, () => path.dirname(root)).mappings()).toEqual([])
    fs.mkdirSync(path.join(root, ".config"), { recursive: true })
    fs.renameSync(path.join(root, "opencode"), path.join(root, ".config", "opencode"))
    expect(new NodeLocationRepairMappingsAdapter({ XDG_CONFIG_HOME: "" }, () => root).mappings()).toEqual([{ from: "/old", to: "/new" }])
  })

  it("refuses malformed config, non-array maps, malformed entries, and invalid relocation rules", () => {
    for (const contents of [
      "{",
      '{ "location_repair": { "maps": {} } }',
      '{ "location_repair": { "maps": [{ "from": "/old" }] } }',
      '{ "location_repair": { "maps": [{ "from": "relative", "to": "/new" }] } }',
      '{ "location_repair": { "maps": [{ "from": "/old", "to": "/new" }, { "from": "/old/nested", "to": "/new/nested" }] } }',
    ]) {
      write(contents)
      expect(() => adapter().mappings()).toThrow(InvalidMapRuleError)
    }
  })
})
