import { describe, expect, it } from "bun:test"
import plugin, { setup } from "@session-manager/main/v2/server"
import { fakeServerContext } from "@test/support/fakes/hosts"
// Verbatim copy of %USERPROFILE%\.config\opencode\v2-plugins\session-id\index.js
// (SHA-256 54657b2b…73c6), the hand-written tool this plugin replaces.
import legacy from "@test/support/fixtures/legacy-session-id-index.js"

const contexts: ReadonlyArray<{ readonly label: string; readonly value: unknown }> = [
  { label: "session", value: { sessionID: "ses_0123456789abCDEFGHIJKLMNOP" } },
  { label: "numeric", value: { sessionID: 42 } },
  { label: "empty string", value: { sessionID: "" } },
  { label: "missing field", value: {} },
  { label: "null field", value: { sessionID: null } },
  { label: "undefined context", value: undefined },
]

type Execute = (input: unknown, context: never) => Promise<unknown>

async function outcome(execute: Execute, context: unknown): Promise<unknown> {
  try {
    return { ok: await execute({}, context as never) }
  } catch (error) {
    return { error: String(error) }
  }
}

describe("session-id tool parity with the hand-written v2 plugin", () => {
  it("exposes a setup function under the merged plugin id (the tool, not the plugin id, is the frozen contract)", () => {
    expect(legacy.id).toBe("session-id-tool")
    expect(plugin.id).toBe("session-manager")
    expect(plugin.setup).toBe(setup)
  })

  it("registers exactly one tool with identical name, description, input schema and options", async () => {
    const ours = fakeServerContext()
    const theirs = fakeServerContext()
    await plugin.setup(ours)
    await legacy.setup(theirs)
    expect(ours.transforms).toBe(1)
    expect(ours.added).toHaveLength(1)
    const strip = ({ execute: _execute, ...rest }: { execute: unknown }) => rest
    expect(strip(ours.added[0]!)).toEqual(strip(theirs.added[0]!))
    expect(Object.keys(ours.added[0]!)).toEqual(Object.keys(theirs.added[0]!))
  })

  it("returns the same result or the same error message for every execution context", async () => {
    const ours = fakeServerContext()
    const theirs = fakeServerContext()
    await plugin.setup(ours)
    await legacy.setup(theirs)
    for (const context of contexts) {
      // String(error) is "<name>: <message>", so this also pins the error name the host would print.
      const a = { label: context.label, outcome: await outcome(ours.added[0]!.execute as Execute, context.value) }
      const b = { label: context.label, outcome: await outcome(theirs.added[0]!.execute as Execute, context.value) }
      expect(a).toEqual(b)
    }
  })

  it("hands the host fresh input/options objects on every registration", async () => {
    const first = fakeServerContext()
    const second = fakeServerContext()
    await plugin.setup(first)
    await plugin.setup(second)
    expect(first.added[0]!.input).not.toBe(second.added[0]!.input)
    expect(first.added[0]!.options).not.toBe(second.added[0]!.options)
  })
})
