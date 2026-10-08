import { describe, expect, it } from "bun:test"
import { CatalogProfileUseCase } from "@session-manager/application/CatalogProfileUseCase"
import { DatabaseNotFoundError } from "@session-manager/domain/errors/DatabaseNotFoundError"
import { ProfileUnreadableError } from "@session-manager/domain/errors/ProfileUnreadableError"
import { profileAt } from "@session-manager/domain/model/Profile"
import type { MagicContextSummary, StoredSession } from "@session-manager/domain/model/SessionCatalog"
import { FakeFileSystem } from "@test/support/maintenance/fakes/file-system"

const profile = profileAt("p", "/data")
const session = (id: string, updated: number): StoredSession => ({
  id,
  generation: "v2",
  projectId: "global",
  parentId: null,
  forkOf: null,
  title: id,
  directory: "/home/me",
  timeCreated: 1,
  timeUpdated: updated,
  timeArchived: null,
  entries: 2,
})
const stats = { compartments: 1, tags: 2, lastTag: 2, notes: 0, memoriesOriginated: 0, project: "dir:abc" }

function useCase(files: FakeFileSystem, sessions: () => readonly StoredSession[], summary: () => MagicContextSummary) {
  return new CatalogProfileUseCase({ sessions }, { summary }, files)
}

describe("CatalogProfileUseCase", () => {
  it("joins each session with its Magic Context state, newest first, ties by id", () => {
    const files = new FakeFileSystem()
    files.add(profile.opencodeDb)
    files.add(profile.contextDb)
    const catalog = useCase(
      files,
      () => [session("ses_b", 5), session("ses_c", 9), session("ses_a", 5)],
      () => ({ available: true, schemaVersion: 94, sessions: { ses_c: stats } }),
    ).catalog(profile)
    expect(catalog.sessions.map((entry) => [entry.id, entry.magicContext])).toEqual([
      ["ses_c", stats],
      ["ses_a", null],
      ["ses_b", null],
    ])
    expect(catalog.magicContext).toEqual({ available: true, schemaVersion: 94 })
    expect(catalog.profile).toBe(profile)
  })

  it("lists sessions without Magic Context when the profile has no context store", () => {
    const files = new FakeFileSystem()
    files.add(profile.opencodeDb)
    const catalog = useCase(files, () => [session("ses_a", 1)], () => {
      throw new Error("must not be read")
    }).catalog(profile)
    expect(catalog.magicContext).toEqual({ available: false, schemaVersion: null })
    expect(catalog.sessions[0]?.magicContext).toBeNull()
  })

  it("refuses a missing session store, and names an unreadable one", () => {
    const files = new FakeFileSystem()
    expect(() => useCase(files, () => [], () => ({ available: true, schemaVersion: 1, sessions: {} })).catalog(profile)).toThrow(DatabaseNotFoundError)
    files.add(profile.opencodeDb)
    files.add(profile.contextDb)
    const broken = useCase(files, () => {
      throw new Error("disk I/O error")
    }, () => ({ available: true, schemaVersion: 1, sessions: {} }))
    expect(() => broken.catalog(profile)).toThrow(new ProfileUnreadableError(profile.opencodeDb, "disk I/O error"))
    const brokenContext = useCase(files, () => [], () => {
      throw "not an Error"
    })
    expect(() => brokenContext.catalog(profile)).toThrow(`cannot read ${profile.contextDb}: not an Error`)
  })
})
