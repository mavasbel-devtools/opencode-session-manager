import { describe, expect, it } from "bun:test"
import { MISSING_SESSION_ID_MESSAGE } from "@session-id/domain/errors/MissingSessionIdError"
import { SESSION_ID_TOOL } from "@session-id/domain/tool/SessionIdToolDefinition"
import { SessionIdToolV2Adapter } from "@session-id/infrastructure/adapters/inbound/server/SessionIdToolV2Adapter"
import { fakeServerContext } from "@test/support/fakes/hosts"

const useCase = {
  execute(context: { readonly sessionID?: unknown } | undefined) {
    if (context?.sessionID === undefined || context?.sessionID === null) throw new Error(MISSING_SESSION_ID_MESSAGE)
    return { content: String(context.sessionID) }
  },
}

describe("SessionIdToolV2Adapter", () => {
  it("adds exactly one tool, through exactly one transform", async () => {
    const context = fakeServerContext()
    await new SessionIdToolV2Adapter(useCase).register(context)
    expect(context.transforms).toBe(1)
    expect(context.added.map((tool) => tool.name)).toEqual(["session-id"])
  })

  it("registers the domain contract, with fresh copies of the nested literals", async () => {
    const context = fakeServerContext()
    await new SessionIdToolV2Adapter(useCase).register(context)
    const tool = context.added[0]!
    expect({ name: tool.name, description: tool.description, input: tool.input, options: tool.options }).toEqual({
      name: SESSION_ID_TOOL.name,
      description: SESSION_ID_TOOL.description,
      input: SESSION_ID_TOOL.input,
      options: SESSION_ID_TOOL.options,
    })
    expect(tool.input).not.toBe(SESSION_ID_TOOL.input)
    expect(tool.options).not.toBe(SESSION_ID_TOOL.options)
  })

  it("delegates execution to the use case, ignoring the tool input", async () => {
    const context = fakeServerContext()
    await new SessionIdToolV2Adapter(useCase).register(context)
    const tool = context.added[0]!
    expect(await tool.execute({ anything: true }, { sessionID: "ses_9" })).toEqual({ content: "ses_9" })
    await expect(tool.execute({}, undefined)).rejects.toThrow(MISSING_SESSION_ID_MESSAGE)
  })
})
