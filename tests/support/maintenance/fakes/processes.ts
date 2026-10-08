import type { ProcessEntry } from "@session-manager/domain/model/Database"
import type { ProcessListPort } from "@session-manager/domain/ports/outbound/ProcessListPort"

/** Reports a fixed set of processes, and records every image it was asked about. */
export class FakeProcessList implements ProcessListPort {
  public running: readonly ProcessEntry[] = []
  public readonly asked: string[] = []

  list(image: string): readonly ProcessEntry[] {
    this.asked.push(image)
    return this.running
  }
}
