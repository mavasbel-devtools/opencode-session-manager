import os from "node:os"
import type { HomeDirectoryPort } from "@session-manager/domain/ports/outbound/HomeDirectoryPort"

/**
 * The home directory as Node defines it — `HOME` (POSIX) or `USERPROFILE`
 * (Windows), else the account's directory — read on every call. Bun's
 * `os.homedir()` caches its first answer and ignores a later `HOME`, so the
 * environment is consulted first.
 */
export class SystemHomeDirectoryAdapter implements HomeDirectoryPort {
  constructor() {}

  homeDirectory(): string {
    return process.env["HOME"] || process.env["USERPROFILE"] || os.homedir()
  }
}
