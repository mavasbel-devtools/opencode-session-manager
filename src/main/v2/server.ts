/**
 * OpenCode 2 server entry (bundled to `dist/v2/server.js`), plugin shape
 * `{ id, setup }`: registers the `session-id` tool.
 *
 * The file is named `server.ts` because the host's own resolver looks for the
 * subpaths `server` then `index` in a plugin directory
 * (`@opencode/plugin/host` `resolve`, v2.0.14), so this directory is a plugin
 * directory the real resolver accepts as-is.
 */
import type { V2ServerContext } from "@session-id/infrastructure/host/V2ServerContext"
import { createServerContainer } from "@session-id/main/server-container"
import { V2_PLUGIN_ID } from "@session-id/main/plugin-id"

export async function setup(context: V2ServerContext): Promise<void> {
  await createServerContainer().tool.register(context)
}

const plugin = {
  id: V2_PLUGIN_ID,
  setup,
}

export default plugin
