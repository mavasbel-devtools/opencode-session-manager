import { ResolveSessionIdToolUseCase } from "@session-id/application/ResolveSessionIdToolUseCase"
import { SessionIdToolV2Adapter } from "@session-id/infrastructure/adapters/inbound/server/SessionIdToolV2Adapter"

/**
 * Composition root of the server runtime: the only place that wires concrete
 * adapters for the tool side.
 *
 * There is one root per runtime, not one for both, because the host loads the
 * two entrypoints into different processes. A single root would make the server
 * bundle import the TUI view adapter, and with it OpenTUI's native bindings —
 * measured: `Bun.build` of the server entry then fails to resolve
 * `@opentui/core-darwin-x64` and the other platform packages.
 */
export function createServerContainer(): { readonly tool: SessionIdToolV2Adapter } {
  return { tool: new SessionIdToolV2Adapter(new ResolveSessionIdToolUseCase()) }
}
