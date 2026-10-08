import { afterEach, describe, expect, it } from "bun:test"
import os from "node:os"
import { SystemHomeDirectoryAdapter } from "@session-manager/infrastructure/adapters/outbound/system/SystemHomeDirectoryAdapter"

const saved = { HOME: process.env["HOME"], USERPROFILE: process.env["USERPROFILE"] }

function restore(name: "HOME" | "USERPROFILE") {
  if (saved[name] === undefined) delete process.env[name]
  else process.env[name] = saved[name]
}

afterEach(() => {
  restore("HOME")
  restore("USERPROFILE")
})

describe("SystemHomeDirectoryAdapter", () => {
  const adapter = new SystemHomeDirectoryAdapter()

  it("reads HOME on every call, unlike Bun's cached os.homedir()", () => {
    process.env["HOME"] = "/first"
    expect(adapter.homeDirectory()).toBe("/first")
    process.env["HOME"] = "/second"
    expect(adapter.homeDirectory()).toBe("/second")
  })

  it("falls back to USERPROFILE, then to the account's directory", () => {
    process.env["HOME"] = ""
    process.env["USERPROFILE"] = "C:\\Users\\someone"
    expect(adapter.homeDirectory()).toBe("C:\\Users\\someone")
    delete process.env["USERPROFILE"]
    expect(adapter.homeDirectory()).toBe(os.homedir())
  })
})
