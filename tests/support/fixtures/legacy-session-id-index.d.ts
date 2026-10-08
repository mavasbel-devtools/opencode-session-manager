import type { V2ServerContext } from "@session-manager/infrastructure/adapters/inbound/server/SessionIdToolV2Adapter"

declare const legacy: {
  readonly id: string
  setup(context: V2ServerContext): Promise<void>
}

export default legacy
