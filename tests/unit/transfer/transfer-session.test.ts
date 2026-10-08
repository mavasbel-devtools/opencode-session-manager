import { describe, it, expect, beforeEach } from "bun:test"
import { TransferSessionUseCase } from "@session-manager/application/TransferSessionUseCase"
import { FakeSessionDbAdapter, FakeProjectResolverAdapter, FakeFileSystemAdapter } from "@test/support/fakes/transfer-ports"
import { InvalidDirectoryError } from "@session-manager/domain/errors/InvalidDirectoryError"
import { SessionNotFoundError } from "@session-manager/domain/errors/SessionNotFoundError"

describe("TransferSessionUseCase", () => {
  let db: FakeSessionDbAdapter
  let resolver: FakeProjectResolverAdapter
  let fs: FakeFileSystemAdapter
  let useCase: TransferSessionUseCase

  beforeEach(() => {
    db = new FakeSessionDbAdapter()
    resolver = new FakeProjectResolverAdapter()
    fs = new FakeFileSystemAdapter()
    useCase = new TransferSessionUseCase(db, resolver, fs)

    db.sessions.set("ses_1", {
      id: "ses_1",
      title: "Test Session 1",
      directory: "C:\\projects\\old-dir",
      projectId: "proj_old",
      path: "",
      timeUpdated: 1000,
    })
  })

  it("throws SessionNotFoundError if session ID is empty", async () => {
    expect(useCase.execute("", "C:\\projects\\new-dir")).rejects.toThrow(SessionNotFoundError)
  })

  it("throws InvalidDirectoryError if target directory is empty", async () => {
    expect(useCase.execute("ses_1", "   ")).rejects.toThrow(InvalidDirectoryError)
  })

  it("throws SessionNotFoundError if session does not exist in DB", async () => {
    expect(useCase.execute("ses_nonexistent", "C:\\projects\\new-dir")).rejects.toThrow(
      SessionNotFoundError,
    )
  })

  it("successfully updates session directory, project ID and relative path", async () => {
    resolver.defaultProjectId = "proj_new"
    resolver.defaultWorktree = "C:\\projects\\new-dir"
    resolver.defaultRelativePath = "sub/pkg"

    const result = await useCase.execute("ses_1", "C:\\projects\\new-dir\\sub\\pkg")

    expect(result.sessionId).toBe("ses_1")
    expect(result.previousDirectory).toBe("C:\\projects\\old-dir")
    expect(result.newDirectory).toBe("C:\\projects\\new-dir\\sub\\pkg")
    expect(result.newProjectId).toBe("proj_new")
    expect(result.newRelativePath).toBe("sub/pkg")

    const updated = await db.getSession("ses_1")
    expect(updated).not.toBeNull()
    expect(updated?.directory).toBe("C:\\projects\\new-dir\\sub\\pkg")
    expect(updated?.projectId).toBe("proj_new")
    expect(updated?.path).toBe("sub/pkg")
    expect(db.projects.get("proj_new")).toBe("C:\\projects\\new-dir")
    expect(fs.ensured).toContain("C:\\projects\\new-dir\\sub\\pkg")
  })
})
