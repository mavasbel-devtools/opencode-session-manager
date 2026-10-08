/**
 * OpenCode 1 TUI entry (bundled to `dist/v1/session-manager.tui.js`), plugin
 * shape `{ id, tui }`: registers `/transfer-session` against the v1 store.
 */
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createV1Container, type V1Container } from "@session-manager/main/v1-container"
import { V1_TUI_PLUGIN_ID } from "@session-manager/main/plugin-id"

export async function tui(api: TuiPluginApi): Promise<V1Container> {
  const container = createV1Container()
  container.transfer.register(api)
  return container
}

const plugin = {
  id: V1_TUI_PLUGIN_ID,
  tui,
}

export default plugin
