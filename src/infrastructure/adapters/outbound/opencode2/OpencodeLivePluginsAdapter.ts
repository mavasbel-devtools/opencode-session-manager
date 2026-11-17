import { readFile } from "node:fs/promises"
import type { LivePlugin, LivePluginsPort } from "@session-manager/domain/ports/outbound/LivePluginsPort"
import { MAGIC_CONTEXT_PACKAGE } from "@session-manager/domain/services/Jsonc"

interface PluginInfo {
  readonly source?: { readonly type?: string; readonly path?: string; readonly target?: string }
  readonly state?: { readonly status?: string; readonly error?: string }
}

/** A `GET /api/plugin` answer: `{ location: { directory }, data: [...] }` (OpenCode 2.1.1). */
export interface PluginAnswer {
  readonly location?: { readonly directory?: string }
  readonly data?: readonly PluginInfo[]
}

/** Where a plugin comes from: the file of a `local` plugin, the target of a `package` one. */
const sourceOf = (plugin: PluginInfo): string | null => plugin.source?.path ?? plugin.source?.target ?? null

/** Magic Context's entry in an OpenCode `GET /api/plugin` answer (OpenCode 2.1.1, packages/schema/src/plugin.ts). */
export function magicContextPlugin(answer: PluginAnswer): { source: string; status: string } | null {
  const plugin = (answer.data ?? []).find((entry) => {
    const source = sourceOf(entry) ?? ""
    // OpenCode 2.1.1 reports a local plugin's entry file; 2.2.5 reports its folder, with no trailing slash.
    return source.includes(`/${MAGIC_CONTEXT_PACKAGE}/`) || source.endsWith(`/${MAGIC_CONTEXT_PACKAGE}`) || source === MAGIC_CONTEXT_PACKAGE || source.startsWith(`${MAGIC_CONTEXT_PACKAGE}@`)
  })
  if (plugin === undefined) return null
  const status = plugin.state?.status ?? "unknown"
  return { source: sourceOf(plugin)!, status: plugin.state?.error === undefined ? status : `${status}: ${plugin.state.error}` }
}

/** Basic auth as OpenCode's server expects it (user `opencode`). */
export const authorization = (password: string) => ({ authorization: `Basic ${btoa(`opencode:${password}`)}` })

/**
 * The running OpenCode service, from its `service.json` (`url`, `password`): the loaded locations
 * (`GET /api/debug/location`), then each one's plugins (`GET /api/plugin?directory=`). Reads only;
 * asking only for loaded locations never makes the server open a new one.
 */
export class OpencodeLivePluginsAdapter implements LivePluginsPort {
  constructor(private readonly serviceFile: string) {}

  async magicContext(): Promise<readonly LivePlugin[] | null> {
    let service: { url?: unknown; password?: unknown } | null
    try {
      service = JSON.parse(await readFile(this.serviceFile, "utf8")) as { url?: unknown; password?: unknown }
    } catch {
      return null
    }
    if (typeof service?.url !== "string" || typeof service.password !== "string") return null
    const headers = authorization(service.password)
    const get = (url: string) =>
      fetch(url, { headers }).then(
        async (response) => (response.ok ? { body: (await response.json()) as unknown, failure: null } : { body: null, failure: `HTTP ${response.status}` }),
        (error: unknown) => ({ body: null, failure: `unreachable: ${(error as Error).message}` }),
      )
    const listed = await get(`${service.url}/api/debug/location`)
    // Nothing listening: no server runs. Any other failure is a server that is not ready, never "no server".
    if (listed.failure?.startsWith("unreachable")) return null
    if (listed.failure !== null) return [{ directory: service.url, source: null, status: listed.failure }]
    if (!Array.isArray(listed.body)) return [{ directory: service.url, source: null, status: "not a list of locations" }]
    const plugins = new Map<string, LivePlugin>()
    for (const { directory } of listed.body as Array<{ directory: string }>) {
      const answer = await get(`${service.url}/api/plugin?directory=${encodeURIComponent(directory)}`)
      if (answer.failure !== null) {
        plugins.set(directory, { directory, source: null, status: answer.failure })
        continue
      }
      const body = answer.body as PluginAnswer
      const found = magicContextPlugin(body)
      // The server answers for the location the directory belongs to, which may be a parent one.
      const location = body.location?.directory ?? directory
      plugins.set(location, { directory: location, source: found?.source ?? null, status: found?.status ?? null })
    }
    return [...plugins.values()]
  }
}
