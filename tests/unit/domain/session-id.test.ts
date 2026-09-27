import { describe, expect, it } from "bun:test"
import { MISSING_SESSION_ID_MESSAGE, MissingSessionIdError } from "@session-id/domain/errors/MissingSessionIdError"
import { requireSessionId, sidebarText } from "@session-id/domain/model/SessionId"

describe("MissingSessionIdError", () => {
  it("keeps the replaced tool's message verbatim", () => {
    expect(MISSING_SESSION_ID_MESSAGE).toBe(
      "State Inconsistency: 'sessionID' is undefined or null within the execution context.",
    )
    const error = new MissingSessionIdError()
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe(MISSING_SESSION_ID_MESSAGE)
  })
})

describe("requireSessionId", () => {
  it("treats only undefined and null as missing", () => {
    expect(() => requireSessionId(undefined)).toThrow(MISSING_SESSION_ID_MESSAGE)
    expect(() => requireSessionId(null)).toThrow(MissingSessionIdError)
  })

  it("stringifies anything else, exactly as the replaced tool did", () => {
    expect(requireSessionId("ses_abc")).toBe("ses_abc")
    expect(requireSessionId("")).toBe("")
    expect(requireSessionId(0)).toBe("0")
    expect(requireSessionId(false)).toBe("false")
  })
})

describe("sidebarText", () => {
  it("shows the raw session ID, unlabelled", () => {
    expect(sidebarText("ses_0123456789abCDEFGHIJKLMNOP")).toBe("ses_0123456789abCDEFGHIJKLMNOP")
  })
})
