import { describe, it, expect, beforeEach } from "bun:test"
import { MoveSessionUseCase } from "@session-manager/application/MoveSessionUseCase"
import { FakeFileSystemAdapter, FakeSessionHostAdapter } from "@test/support/fakes/transfer-ports"
import { InvalidDirectoryError } from "@session-manager/domain/errors/InvalidDirectoryError"
import { SessionNotFoundError } from "@session-manager/domain/errors/SessionNotFoundError"

describe("MoveSessionUseCase", () => {
  let host: FakeSessionHostAdapter
  let fs: FakeFileSystemAdapter
  let useCase: MoveSessionUseCase

  beforeEach(() => {
    host = new FakeSessionHostAdapter()
    fs = new FakeFileSystemAdapter()
    useCase = new MoveSessionUseCase(host, fs)
  })

  it("rejects an empty session id without touching the host", async () => {
    await expect(useCase.execute("  ", "C:\\dest")).rejects.toThrow(SessionNotFoundError)
    expect(host.moves).toEqual([])
    expect(fs.ensured).toEqual([])
  })

  it("rejects an empty directory without touching the host", async () => {
    await expect(useCase.execute("ses_1", "   ")).rejects.toThrow(InvalidDirectoryError)
    expect(host.moves).toEqual([])
    expect(fs.ensured).toEqual([])
  })

  it("creates the destination, then delegates the move to the host", async () => {
    const result = await useCase.execute("ses_1", "  C:\\other-project\\sub  ")
    expect(fs.ensured).toEqual(["C:\\other-project\\sub"])
    expect(host.moves).toEqual([{ sessionId: "ses_1", directory: "C:\\other-project\\sub" }])
    expect(result).toEqual({ sessionId: "ses_1", newDirectory: "C:\\other-project\\sub" })
  })

  it("propagates host move failures", async () => {
    host.moveError = new Error("Directory is unavailable")
    await expect(useCase.execute("ses_1", "C:\\dest")).rejects.toThrow("Directory is unavailable")
  })
})
