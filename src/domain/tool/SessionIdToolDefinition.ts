/**
 * The `session-id` tool contract, field for field the hand-written
 * `v2-plugins/session-id/index.js` (2026-09-23) this plugin replaces.
 */
export const SESSION_ID_TOOL = {
  name: "session-id",
  description: "Extracts and returns the active 'session ID' directly from the opencode plugin execution context.",
  input: { type: "object", properties: {}, additionalProperties: false },
  // Without codemode: false the tool is only reachable through v2's `execute` tool, not by name.
  options: { codemode: false },
} as const
