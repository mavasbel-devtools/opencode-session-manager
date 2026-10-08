import type { DatabaseHoldersPort } from "#domain/ports/outbound/DatabaseHoldersPort.ts"

/** Reports a fixed holder (or none), and records every path it was asked about. */
export class FakeHolders implements DatabaseHoldersPort {
  public holder: string | null = null
  public readonly asked: string[] = []

  constructor() {}

  heldBy(dbPath: string): string | null {
    this.asked.push(dbPath)
    return this.holder
  }
}
