import { describe, expect, it } from "bun:test"
import { HELP, HelpCliAdapter } from "@session-manager/infrastructure/adapters/inbound/cli/HelpCliAdapter"
import { FakeOutput } from "@test/support/maintenance/fakes/output"

describe("HelpCliAdapter", () => {
  it("prints the version, the help, and the help with exit 2 for extra words", () => {
    const output = new FakeOutput()
    const help = new HelpCliAdapter(output, "1.2.3")
    expect(help.run([], "version")).toBe(0)
    expect(output.lines).toEqual(["opencode-session-manager 1.2.3"])
    output.lines.length = 0
    expect(help.run([], "help")).toBe(0)
    expect(output.lines).toEqual([...HELP])
    output.lines.length = 0
    expect(help.run(["x"], "version")).toBe(2)
    expect(output.lines).toEqual([...HELP])
  })
})
