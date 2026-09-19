import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createContainer } from "@transfer/main/container"
import { SessionsTransferTuiAdapter } from "@transfer/infrastructure/adapters/inbound/tui/SessionsTransferTuiAdapter"

export async function tui(api: TuiPluginApi) {
  const container = createContainer()
  const adapter = new SessionsTransferTuiAdapter(container)
  adapter.register(api)
  return container
}

const plugin = {
  id: "opencode-sessions-transfer-tui",
  tui,
}

export default plugin
