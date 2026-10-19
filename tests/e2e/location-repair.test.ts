// E2E tier: the live-repair composition uses a real config file and real
// directories, while the host boundary is recorded exactly as OpenCode exposes it.
import { afterEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { RepairSessionLocationsUseCase } from "@session-manager/application/RepairSessionLocationsUseCase"
import type { LocationRepairReport } from "@session-manager/domain/model/LocationRepair"
import type { RepairSessionLocationsPort } from "@session-manager/domain/ports/inbound/RepairSessionLocationsPort"
import { SessionLocationRepairV2TuiAdapter } from "@session-manager/infrastructure/adapters/inbound/tui/SessionLocationRepairV2TuiAdapter"
import { NodeFileSystemAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeFileSystemAdapter"
import { NodeLocationRepairMappingsAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeLocationRepairMappingsAdapter"
import type { V2KeymapLayer, V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { fakeV2Client } from "@test/support/fakes/hosts"
import { FakeSessionHostAdapter } from "@test/support/fakes/transfer-ports"

let root = ""
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe("configured online location repair", () => {
  it("repairs one real moved workspace without creating folders, then exposes the command", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "session-manager-repair-e2e-"))
    const oldRoot = path.join(root, "old")
    const newRoot = path.join(root, "new")
    fs.mkdirSync(path.join(newRoot, "worktree"), { recursive: true })
    fs.mkdirSync(path.join(root, "config", "opencode"), { recursive: true })
    fs.writeFileSync(path.join(root, "config", "opencode", "session-manager.jsonc"), JSON.stringify({ location_repair: { maps: [{ from: oldRoot, to: newRoot }] } }))
    const host = new FakeSessionHostAdapter()
    host.sessions.push({ id: "ses_moved", title: "Moved", directory: path.join(oldRoot, "worktree"), projectId: "project", path: "", timeUpdated: 1 })
    const files = new NodeFileSystemAdapter()
    const mappings = new NodeLocationRepairMappingsAdapter({ XDG_CONFIG_HOME: path.join(root, "config") }, () => root)
    const report = await new RepairSessionLocationsUseCase(host, files, mappings).execute()
    expect(report.repaired).toEqual([{ session_id: "ses_moved", from_directory: path.join(oldRoot, "worktree"), to_directory: path.join(newRoot, "worktree") }])
    expect(host.moves).toEqual([{ sessionId: "ses_moved", directory: path.join(newRoot, "worktree") }])
    expect([files.isDirectory(newRoot), files.isDirectory(path.join(root, "missing"))]).toEqual([true, false])

    const claims: any[] = []
    const layers: Array<() => V2KeymapLayer> = []
    const toasts: any[] = []
    const repair: RepairSessionLocationsPort = { execute: async (): Promise<LocationRepairReport> => ({ rules: [], repaired: [], skipped: [] }) }
    const context: V2TuiContext = {
      theme: { text: { muted: "#808080" } }, client: fakeV2Client(), data: { session: { get: () => undefined } }, keymap: { layer: (layer) => void layers.push(layer) },
      ui: { slot: (claim) => { claims.push(claim); return () => undefined }, dialog: { show: () => undefined, set: () => undefined, clear: () => undefined, select: async () => undefined }, toast: { show: (toast) => void toasts.push(toast) }, router: { current: () => ({ type: "home" }) } },
    }
    new SessionLocationRepairV2TuiAdapter(repair).register(context)
    await Bun.sleep(0)
    claims[0].render()
    layers[0]!().commands[0]!.run()
    await Bun.sleep(0)
    expect(toasts).toEqual([{ variant: "info", title: "Repair session locations", message: "No location-repair mappings are configured.", duration: 5000 }])
  })
})
