import { createHash } from "node:crypto"
import type { HashPort } from "@session-manager/domain/ports/outbound/HashPort"

export class Sha256Adapter implements HashPort {
  constructor() {}

  sha256(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex")
  }
}
