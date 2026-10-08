import { describe, expect, it } from "bun:test"
import { SESSION_ID_TOOL } from "@session-manager/domain/tool/SessionIdToolDefinition"

describe("SESSION_ID_TOOL", () => {
  it("defines the session-id tool contract", () => {
    expect(SESSION_ID_TOOL).toEqual({
      name: "session-id",
      description:
        "Extracts and returns the active 'session ID' directly from the opencode plugin execution context.",
      input: { type: "object", properties: {}, additionalProperties: false },
      options: { codemode: false },
    })
  })
})
