import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { join } from "node:path"
import { BunMagicContextStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunMagicContextStoreAdapter"
import { BunSessionStoreAdapter } from "@session-manager/infrastructure/adapters/outbound/sqlite/BunSessionStoreAdapter"
import { removeTemporary, temporaryWorkspace } from "@test/support/maintenance/temporary"
import { makeContextStore, makeOpenCodeStore } from "@test/support/sessions/stores"

let directory = ""
beforeEach(() => {
  directory = temporaryWorkspace("oc-sessions-stores-")
})
afterEach(() => {
  removeTemporary(directory)
})

describe("BunSessionStoreAdapter", () => {
  it("reads v1 and v2 sessions with their entry counts", () => {
    const file = join(directory, "opencode.db")
    makeOpenCodeStore(file, {
      v1: [{ id: "ses_old", title: "old", directory: "/a", updated: 3, entries: 2, archived: 7, parent: "ses_p" }],
      v2: [{ id: "ses_new", project: "p1", fork: "ses_old", directory: "/b", created: 4, updated: 5, entries: 3 }],
    })
    expect(new BunSessionStoreAdapter().sessions(file)).toEqual([
      {
        id: "ses_old",
        generation: "v1",
        projectId: "global",
        parentId: "ses_p",
        forkOf: null,
        title: "old",
        directory: "/a",
        timeCreated: 1,
        timeUpdated: 3,
        timeArchived: 7,
        entries: 2,
      },
      {
        id: "ses_new",
        generation: "v2",
        projectId: "p1",
        parentId: null,
        forkOf: "ses_old",
        title: null,
        directory: "/b",
        timeCreated: 4,
        timeUpdated: 5,
        timeArchived: null,
        entries: 3,
      },
    ])
  })

  it("reads an older store: missing v2 columns are null and missing entry tables count zero", () => {
    const file = join(directory, "opencode.db")
    makeOpenCodeStore(file, { v2: [{ id: "ses_x", title: "ignored", directory: "/c", updated: 2, entries: 4 }] }, { legacyV2: true, withoutEntries: true })
    expect(new BunSessionStoreAdapter().sessions(file)).toEqual([
      {
        id: "ses_x",
        generation: "v2",
        projectId: "global",
        parentId: null,
        forkOf: null,
        title: null,
        directory: "/c",
        timeCreated: 1,
        timeUpdated: 2,
        timeArchived: null,
        entries: 0,
      },
    ])
  })
})

describe("BunMagicContextStoreAdapter", () => {
  it("counts each session's summaries, tags, notes and memories, and reads the format version", () => {
    const file = join(directory, "context.db")
    makeContextStore(file, {
      version: 94,
      compartments: { ses_a: 2 },
      tags: { ses_a: 3, ses_b: 1 },
      notes: { ses_b: 1 },
      memories: { ses_a: 4 },
      projects: { ses_c: "git:abc" },
    })
    expect(new BunMagicContextStoreAdapter().summary(file)).toEqual({
      available: true,
      schemaVersion: 94,
      sessions: {
        ses_a: { compartments: 2, tags: 3, lastTag: 3, notes: 0, memoriesOriginated: 4, project: null },
        ses_b: { compartments: 0, tags: 1, lastTag: 1, notes: 1, memoriesOriginated: 0, project: null },
        ses_c: { compartments: 0, tags: 0, lastTag: null, notes: 0, memoriesOriginated: 0, project: "git:abc" },
      },
    })
  })

  it("reads a store whose format lacks tables, or has no recorded version", () => {
    const file = join(directory, "context.db")
    makeContextStore(file, { compartments: { ses_a: 1 }, omit: ["schema_migrations", "tags", "notes", "memories", "session_projects"] })
    expect(new BunMagicContextStoreAdapter().summary(file)).toEqual({
      available: true,
      schemaVersion: null,
      sessions: { ses_a: { compartments: 1, tags: 0, lastTag: null, notes: 0, memoriesOriginated: 0, project: null } },
    })
    const empty = join(directory, "empty.db")
    makeContextStore(empty, {})
    expect(new BunMagicContextStoreAdapter().summary(empty).schemaVersion).toBeNull()
  })
})
