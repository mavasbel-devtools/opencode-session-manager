import type { ProcessEntry } from "#domain/model/Database.ts"
import type { ProcessListPort } from "#domain/ports/outbound/ProcessListPort.ts"

/** Reports a fixed set of processes, and records every image it was asked about. */
export class FakeProcessList implements ProcessListPort {
  public running: readonly ProcessEntry[] = []
  public readonly asked: string[] = []

  list(image: string): readonly ProcessEntry[] {
    this.asked.push(image)
    return this.running
  }
}
