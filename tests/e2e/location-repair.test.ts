// E2E tier: the live-repair composition uses a real config file, real directories,
// real Git work trees and the real store lock, while the host boundary is recorded
// exactly as OpenCode exposes it.
import { afterEach, describe, expect, it } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { RepairSessionLocationsUseCase } from "@session-manager/application/RepairSessionLocationsUseCase"
import { RepairWorktreeLinksUseCase } from "@session-manager/application/RepairWorktreeLinksUseCase"
import type { LocationRepairReport } from "@session-manager/domain/model/LocationRepair"
import type { RepairSessionLocationsPort } from "@session-manager/domain/ports/inbound/RepairSessionLocationsPort"
import { SessionLocationRepairV2TuiAdapter } from "@session-manager/infrastructure/adapters/inbound/tui/SessionLocationRepairV2TuiAdapter"
import { FsStoreLockAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/FsStoreLockAdapter"
import { NodeFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeFileSystemAdapter"
import { NodeLocationRepairMappingsAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeLocationRepairMappingsAdapter"
import { GitWorktreeAdapter } from "@session-manager/infrastructure/adapters/outbound/project/GitWorktreeAdapter"
import { SystemClockAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemClockAdapter"
import type { V2KeymapLayer, V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { fakeV2Client } from "@test/support/fakes/hosts"
import { FakeSessionHostAdapter } from "@test/support/fakes/transfer-ports"

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_NOSYSTEM: "1" }

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: GIT_ENV })
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`)
  return result.stdout.trim()
}

let root = ""
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

function setup(maps: Array<{ from: string; to: string }>) {
  fs.mkdirSync(path.join(root, "config", "opencode"), { recursive: true })
  fs.mkdirSync(path.join(root, "data", "opencode"), { recursive: true })
  fs.writeFileSync(path.join(root, "config", "opencode", "session-manager.jsonc"), JSON.stringify({ location_repair: { maps } }))
  const host = new FakeSessionHostAdapter()
  const files = new NodeFileSystemAdapter()
  const store = path.join(root, "data", "opencode", "opencode.db")
  const repair = new RepairSessionLocationsUseCase(
    host,
    files,
    new NodeLocationRepairMappingsAdapter({ XDG_CONFIG_HOME: path.join(root, "config") }, () => root),
    new RepairWorktreeLinksUseCase(new GitWorktreeAdapter(), files),
    { locks: new FsStoreLockAdapter(), runtime: new SystemClockAdapter(), store },
  )
  return { host, files, repair, store }
}

describe("configured online location repair", () => {
  it("repairs one real moved workspace without creating folders, then exposes the command", async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "session-manager-repair-e2e-")))
    const oldRoot = path.join(root, "old")
    const newRoot = path.join(root, "new")
    fs.mkdirSync(path.join(newRoot, "worktree"), { recursive: true })
    const { host, files, repair, store } = setup([{ from: oldRoot, to: newRoot }])
    host.sessions.push({ id: "ses_moved", title: "Moved", directory: path.join(oldRoot, "worktree"), projectId: "project", path: "", timeUpdated: 1 })
    const report = await repair.execute()
    expect(report.repaired).toEqual([{ session_id: "ses_moved", from_directory: path.join(oldRoot, "worktree"), to_directory: path.join(newRoot, "worktree") }])
    expect(host.moves).toEqual([{ sessionId: "ses_moved", directory: path.join(newRoot, "worktree") }])
    expect([files.isDirectory(newRoot), files.isDirectory(path.join(root, "missing")), fs.existsSync(`${store}.session-manager.lock`)]).toEqual([true, false, false])

    const claims: any[] = []
    const layers: Array<() => V2KeymapLayer> = []
    const toasts: any[] = []
    const empty: RepairSessionLocationsPort = { execute: async (): Promise<LocationRepairReport> => ({ rules: [], repaired: [], skipped: [], worktrees: [], busy: false }) }
    const context: V2TuiContext = {
      theme: { text: { muted: "#808080" } }, client: fakeV2Client(), data: { session: { get: () => undefined } }, keymap: { layer: (layer) => void layers.push(layer) },
      ui: { slot: (claim) => { claims.push(claim); return () => undefined }, dialog: { show: () => undefined, set: () => undefined, clear: () => undefined, select: async () => undefined }, toast: { show: (toast) => void toasts.push(toast) }, router: { current: () => ({ type: "home" }) } },
    }
    new SessionLocationRepairV2TuiAdapter(empty).register(context)
    await Bun.sleep(0)
    claims[0].render()
    layers[0]!().commands[0]!.run()
    await Bun.sleep(0)
    expect(toasts).toEqual([{ variant: "info", title: "Repair session locations", message: "No location-repair mappings are configured.", duration: 5000 }])
  })

  it("repairs a whole moved workspace holding a repository and its linked work tree, and both Git link directions", async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "session-manager-repair-e2e-")))
    const oldRoot = path.join(root, "old")
    const newRoot = path.join(root, "new")
    fs.mkdirSync(path.join(oldRoot, "repo", "src"), { recursive: true })
    git(path.join(oldRoot, "repo"), "init", "-q", "-b", "main")
    fs.writeFileSync(path.join(oldRoot, "repo", "src", "a.txt"), "a")
    git(path.join(oldRoot, "repo"), "add", ".")
    git(path.join(oldRoot, "repo"), "commit", "-q", "-m", "init")
    git(path.join(oldRoot, "repo"), "worktree", "add", "-q", "-b", "feature", path.join(oldRoot, "wt"))
    fs.renameSync(oldRoot, newRoot)

    const { host, repair, store } = setup([{ from: oldRoot, to: newRoot }])
    host.sessions.push({ id: "ses_wt", title: "Work tree", directory: path.join(oldRoot, "wt"), projectId: "p", path: "", timeUpdated: 1 })
    host.sessions.push({ id: "ses_repo", title: "Repo", directory: path.join(oldRoot, "repo", "src"), projectId: "p", path: "src", timeUpdated: 1 })

    const report = await repair.execute()

    expect(host.moves).toEqual([
      { sessionId: "ses_wt", directory: path.join(newRoot, "wt") },
      { sessionId: "ses_repo", directory: path.join(newRoot, "repo", "src") },
    ])
    expect(report.worktrees.map((tree) => [tree.root, tree.status, tree.command])).toEqual([
      [path.join(newRoot, "wt"), "repaired", { cwd: path.join(newRoot, "repo"), paths: [path.join(newRoot, "wt")] }],
    ])
    // Git itself agrees in both directions: the work tree list and the work tree's own view.
    expect(git(path.join(newRoot, "repo"), "worktree", "list", "--porcelain")).toContain(`worktree ${path.join(newRoot, "wt")}\n`)
    expect(git(path.join(newRoot, "repo"), "worktree", "list", "--porcelain")).not.toContain("prunable")
    expect(git(path.join(newRoot, "wt"), "rev-parse", "--show-toplevel")).toBe(path.join(newRoot, "wt"))
    expect(fs.existsSync(`${store}.session-manager.lock`)).toBe(false)

    // Idempotent: a second pass finds every session present and changes nothing.
    host.sessions = host.sessions.map((session) => ({ ...session, directory: session.directory.replace(oldRoot, newRoot) }))
    const again = await repair.execute()
    expect([again.repaired, again.worktrees, again.skipped.map((skip) => skip.reason)]).toEqual([[], [], ["directory-present", "directory-present"]])
  })

  it("never runs Git or moves anything for a session whose recorded folder still exists, or while another process holds the lock", async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "session-manager-repair-e2e-")))
    const oldRoot = path.join(root, "old")
    const newRoot = path.join(root, "new")
    fs.mkdirSync(path.join(oldRoot, "a"), { recursive: true })
    fs.mkdirSync(path.join(newRoot, "a"), { recursive: true })
    const { host, repair, store } = setup([{ from: oldRoot, to: newRoot }])
    host.sessions.push({ id: "ses_valid", title: "Valid", directory: path.join(oldRoot, "a"), projectId: "p", path: "", timeUpdated: 1 })
    expect((await repair.execute()).skipped.map((skip) => skip.reason)).toEqual(["directory-present"])

    // A live holder (this test process) owns the session store's lock.
    fs.writeFileSync(`${store}.session-manager.lock`, JSON.stringify({ pid: process.pid, command: "relocate", since: new Date().toISOString() }))
    fs.rmSync(path.join(oldRoot, "a"), { recursive: true })
    const busy = await repair.execute()
    expect([busy.busy, host.moves]).toEqual([true, []])
    // A lock left by a process that no longer exists is cleared, and the repair proceeds.
    fs.writeFileSync(`${store}.session-manager.lock`, JSON.stringify({ pid: 2 ** 22 + 7, command: "relocate", since: new Date().toISOString() }))
    const recovered = await repair.execute()
    expect([recovered.busy, host.moves, fs.existsSync(`${store}.session-manager.lock`)]).toEqual([false, [{ sessionId: "ses_valid", directory: path.join(newRoot, "a") }], false])
  })
})
