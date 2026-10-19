import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { RepairSessionLocationsUseCase } from "@session-manager/application/RepairSessionLocationsUseCase"
import { InvalidMapRuleError } from "@session-manager/domain/errors/InvalidMapRuleError"
import type { LocationRepairMappingsPort } from "@session-manager/domain/ports/outbound/LocationRepairMappingsPort"
import { NodeLocationRepairMappingsAdapter } from "@session-manager/infrastructure/adapters/outbound/fs/NodeLocationRepairMappingsAdapter"
import { FakeFileSystemAdapter, FakeSessionHostAdapter } from "@test/support/fakes/transfer-ports"

class FakeMappingsAdapter implements LocationRepairMappingsPort {
  constructor(public rules: Array<{ from: string; to: string }> = []) {}

  mappings(): readonly { from: string; to: string }[] {
    return this.rules
  }
}

describe("RepairSessionLocationsUseCase", () => {
  let host: FakeSessionHostAdapter
  let files: FakeFileSystemAdapter
  let mappings: FakeMappingsAdapter

  beforeEach(() => {
    host = new FakeSessionHostAdapter()
    files = new FakeFileSystemAdapter()
    mappings = new FakeMappingsAdapter([{ from: "/old/workspace", to: "/new/workspace" }])
  })

  it("moves only a missing mapped session to an existing replacement", async () => {
    host.sessions.push({ id: "ses_move", title: "Move", directory: "/old/workspace/a", projectId: "p", path: "a", timeUpdated: 1 })
    host.sessions.push({ id: "ses_present", title: "Present", directory: "/old/workspace/b", projectId: "p", path: "b", timeUpdated: 1 })
    host.sessions.push({ id: "ses_unmapped", title: "Unmapped", directory: "/gone/c", projectId: "p", path: "c", timeUpdated: 1 })
    host.sessions.push({ id: "ses_missing_target", title: "Target", directory: "/old/workspace/d", projectId: "p", path: "d", timeUpdated: 1 })
    files.directories.add("/new/workspace/a")
    files.directories.add("/old/workspace/b")

    const report = await new RepairSessionLocationsUseCase(host, files, mappings).execute()

    expect(host.moves).toEqual([{ sessionId: "ses_move", directory: "/new/workspace/a" }])
    expect(report).toEqual({
      rules: [{ from: "/old/workspace", to: "/new/workspace" }],
      repaired: [{ session_id: "ses_move", from_directory: "/old/workspace/a", to_directory: "/new/workspace/a" }],
      skipped: [
        { session_id: "ses_present", directory: "/old/workspace/b", reason: "directory-present", to_directory: null },
        { session_id: "ses_unmapped", directory: "/gone/c", reason: "not-mapped", to_directory: null },
        { session_id: "ses_missing_target", directory: "/old/workspace/d", reason: "target-missing", to_directory: "/new/workspace/d" },
      ],
    })
    expect(files.ensured).toEqual([])
  })

  it("propagates a rejected host move rather than pretending it repaired anything", async () => {
    host.sessions.push({ id: "ses_move", title: "Move", directory: "/old/workspace/a", projectId: "p", path: "a", timeUpdated: 1 })
    files.directories.add("/new/workspace/a")
    host.moveError = new Error("host refused")

    await expect(new RepairSessionLocationsUseCase(host, files, mappings).execute()).rejects.toThrow("host refused")
  })

  it("repairs only the named session when an intentional transfer asks for a preflight repair", async () => {
    host.sessions.push({ id: "ses_selected", title: "Selected", directory: "/old/workspace/a", projectId: "p", path: "a", timeUpdated: 1 })
    host.sessions.push({ id: "ses_other", title: "Other", directory: "/old/workspace/b", projectId: "p", path: "b", timeUpdated: 1 })
    files.directories.add("/new/workspace/a")
    files.directories.add("/new/workspace/b")

    const report = await new RepairSessionLocationsUseCase(host, files, mappings).execute(["ses_selected"])

    expect([host.moves, report]).toEqual([
      [{ sessionId: "ses_selected", directory: "/new/workspace/a" }],
      { rules: [{ from: "/old/workspace", to: "/new/workspace" }], repaired: [{ session_id: "ses_selected", from_directory: "/old/workspace/a", to_directory: "/new/workspace/a" }], skipped: [] },
    ])
  })

  it("does not even query the host when no explicit mapping opted in", async () => {
    mappings.rules = []
    host.listSessions = async () => {
      throw new Error("must not query sessions")
    }

    await expect(new RepairSessionLocationsUseCase(host, files, mappings).execute()).resolves.toEqual({ rules: [], repaired: [], skipped: [] })
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
