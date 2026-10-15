import { describe, it, expect } from "bun:test"
import { SessionNotFoundError } from "@session-manager/domain/errors/SessionNotFoundError"

describe("domain errors", () => {
  it("SessionNotFoundError carries the session id", () => {
    const error = new SessionNotFoundError("ses_x")
    expect(error._tag).toBe("SessionNotFoundError")
    expect(error.sessionId).toBe("ses_x")
    expect(error.message).toContain("ses_x")
  })
})
