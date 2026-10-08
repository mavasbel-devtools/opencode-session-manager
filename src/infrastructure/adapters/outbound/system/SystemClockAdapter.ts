import { homedir, tmpdir } from "node:os"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"

/** The only place the ambient process state is read. `stamp` takes an optional date so tests can pin it. */
export class SystemClockAdapter implements RuntimePort {
  constructor() {}

  pid(): number {
    return process.pid
  }

  platform(): string {
    return process.platform
  }

  now(): number {
    return Date.now()
  }

  stamp(date: Date = new Date()): string {
    const pad = (value: number): string => String(value).padStart(2, "0")
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join("-")
  }

  temporaryDirectory(): string {
    return tmpdir()
  }

  homeDirectory(): string {
    return homedir()
  }
}
