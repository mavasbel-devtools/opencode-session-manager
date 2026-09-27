import { describe, expect, it } from "bun:test"
import { ResolveSessionIdToolUseCase } from "@session-id/application/ResolveSessionIdToolUseCase"
import { MISSING_SESSION_ID_MESSAGE } from "@session-id/domain/errors/MissingSessionIdError"

describe("ResolveSessionIdToolUseCase", () => {
  const useCase = new ResolveSessionIdToolUseCase()

  it("returns the context session ID as tool content", () => {
    expect(useCase.execute({ sessionID: "ses_1" })).toEqual({ content: "ses_1" })
  })

  it("throws the verbatim error when the context or its sessionID is missing", () => {
    expect(() => useCase.execute(undefined)).toThrow(MISSING_SESSION_ID_MESSAGE)
    expect(() => useCase.execute({})).toThrow(MISSING_SESSION_ID_MESSAGE)
    expect(() => useCase.execute({ sessionID: null })).toThrow(MISSING_SESSION_ID_MESSAGE)
  })
})
