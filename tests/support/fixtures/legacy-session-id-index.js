// v2 port of the v1 tools/session-id.ts custom tool (v2 no longer loads tools/*.ts).
// Plain object instead of Plugin.define (an identity function) so no package install is needed.
export default {
  id: "session-id-tool",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "session-id",
        description: "Extracts and returns the active 'session ID' directly from the opencode plugin execution context.",
        input: { type: "object", properties: {}, additionalProperties: false },
        // Without codemode: false the tool is only reachable through v2's `execute` tool, not by name.
        options: { codemode: false },
        async execute(_input, context) {
          const sessionID = context?.sessionID
          if (sessionID === undefined || sessionID === null)
            throw new Error("State Inconsistency: 'sessionID' is undefined or null within the execution context.")
          return { content: String(sessionID) }
        },
      })
    })
  },
}
