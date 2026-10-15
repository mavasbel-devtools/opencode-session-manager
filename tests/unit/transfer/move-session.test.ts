import { describe, it, expect, beforeEach } from "bun:test"
import { MoveSessionUseCase } from "@session-manager/application/MoveSessionUseCase"
import { FakeFileSystemAdapter, FakeSessionHostAdapter } from "@test/support/fakes/transfer-ports"
import { SessionNotFoundError } from "@session-manager/domain/errors/SessionNotFoundError"

const HOME = "/home/user"

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
    await expect(useCase.execute("  ", "C:\\dest", HOME)).rejects.toThrow(SessionNotFoundError)
    expect(host.moves).toEqual([])
    expect(fs.ensured).toEqual([])
  })

  it("creates the destination, then delegates the move to the host", async () => {
    const result = await useCase.execute("ses_1", "  C:\\other-project\\sub  ", HOME)
    expect(fs.ensured).toEqual(["C:\\other-project\\sub"])
    expect(host.moves).toEqual([{ sessionId: "ses_1", directory: "C:\\other-project\\sub" }])
    expect(result).toEqual({ sessionId: "ses_1", newDirectory: "C:\\other-project\\sub" })
  })

  it("expands ~ against the given home before creating and moving", async () => {
    const result = await useCase.execute("ses_1", " ~/work/new ", HOME)
    expect(fs.ensured).toEqual(["/home/user/work/new"])
    expect(result.newDirectory).toBe("/home/user/work/new")
  })

  it("propagates host move failures", async () => {
    host.moveError = new Error("Directory is unavailable")
    await expect(useCase.execute("ses_1", "C:\\dest", HOME)).rejects.toThrow("Directory is unavailable")
  })
})
