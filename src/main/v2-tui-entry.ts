/**
 * OpenCode 2 TUI entry (bundled to `dist/v2/tui.js`), plugin shape
 * `{ id, setup }` (packages/plugin/src/tui/plugin.ts). The v1 TUI entry
 * (`tui-entry.ts`, shape `{ id, tui }`) is untouched and still ships as
 * `dist/sessions-transfer.tui.js`.
 */
import { createV2Container } from "@transfer/main/container"
import {
  SessionsTransferV2TuiAdapter,
  type V2TuiContext,
} from "@transfer/infrastructure/adapters/inbound/tui/SessionsTransferV2TuiAdapter"
import type { OpenCode2Client } from "@transfer/infrastructure/adapters/outbound/opencode2/OpenCode2HostAdapter"
import { V2_PLUGIN_ID } from "@transfer/main/v2-server-entry"

export type V2PluginContext = V2TuiContext & { readonly client: OpenCode2Client }

export async function setup(context: V2PluginContext): Promise<() => void> {
  const adapter = new SessionsTransferV2TuiAdapter(createV2Container(context.client))
  return adapter.register(context)
}

const plugin = {
  id: V2_PLUGIN_ID,
  setup,
}

export default plugin
