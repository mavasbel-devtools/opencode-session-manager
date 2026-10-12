import { opencodeId, SLUG_ADJECTIVES, SLUG_NOUNS } from "@session-manager/domain/model/Fork"
import type { IdentifiersPort } from "@session-manager/domain/ports/outbound/IdentifiersPort"
import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"

/** OpenCode's identifiers: the time with a per-millisecond counter, and random characters. */
export class OpencodeIdentifiersAdapter implements IdentifiersPort {
  private last = 0
  private counter = 0

  constructor(
    private readonly runtime: Pick<RuntimePort, "now">,
    private readonly random: (length: number) => Uint8Array = (length) => crypto.getRandomValues(new Uint8Array(length)),
  ) {}

  sessionId(): string {
    return this.next("ses", true)
  }

  messageBase(): string {
    return this.next("msg", false)
  }

  slug(): string {
    const [adjective, noun] = this.random(2)
    return `${SLUG_ADJECTIVES[adjective! % SLUG_ADJECTIVES.length]}-${SLUG_NOUNS[noun! % SLUG_NOUNS.length]}`
  }

  private next(prefix: string, descending: boolean): string {
    const now = this.runtime.now()
    if (now !== this.last) {
      this.last = now
      this.counter = 0
    }
    this.counter++
    return opencodeId(prefix, now, this.counter, descending, this.random(14))
  }
}
