import { describe, expect, it } from "bun:test"
import { StderrOutputAdapter } from "@session-manager/infrastructure/adapters/outbound/system/StderrOutputAdapter"

describe("StderrOutputAdapter", () => {
  it("writes one line per call to stderr", () => {
    const chunks: string[] = []
    const original = process.stderr.write
    process.stderr.write = ((chunk: string) => {
      chunks.push(chunk)
      return true
    }) as typeof process.stderr.write
    try {
      const output = new StderrOutputAdapter()
      output.line("first")
      output.line("second")
    } finally {
      process.stderr.write = original
    }
    expect(chunks).toEqual(["first\n", "second\n"])
  })
})
