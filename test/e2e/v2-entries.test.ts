import { describe, it, expect } from "bun:test"
import serverPlugin, { V2_PLUGIN_ID } from "@transfer/main/v2-server-entry"
import tuiPlugin, { type V2PluginContext } from "@transfer/main/v2-tui-entry"
import v1TuiPlugin from "@transfer/main/tui-entry"

/** Mirrors packages/core/src/plugin/module.ts `Module` (v2.0.14). */
function isV2ServerModule(mod: { default?: unknown }): boolean {
  const value = mod.default as Record<string, unknown> | undefined
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value["id"] === "string" &&
    (typeof value["setup"] === "function" || typeof value["effect"] === "function")
  )
}

/** Mirrors packages/tui/src/plugin/context.tsx `isPlugin` (v2.0.14). */
function isV2TuiPlugin(value: unknown): boolean {
  const record = value as Record<string, unknown>
  return (
    typeof value === "object" &&
    value !== null &&
    typeof record["id"] === "string" &&
    (record["id"] as string).length > 0 &&
    typeof record["setup"] === "function"
  )
}

describe("OpenCode 2 entries", () => {
  it("server entry satisfies the v2 core loader and is a no-op", async () => {
    expect(isV2ServerModule({ default: serverPlugin })).toBe(true)
    expect(serverPlugin.id).toBe(V2_PLUGIN_ID)
    expect(await serverPlugin.setup()).toBeUndefined()
  })

  it("tui entry satisfies the v2 TUI loader and registers through an app slot", async () => {
    expect(isV2TuiPlugin(tuiPlugin)).toBe(true)
    expect(tuiPlugin.id).toBe(V2_PLUGIN_ID)

    const slots: any[] = []
    let unregistered = 0
    const context = {
      client: {
        session: { list: async () => ({ data: [] }), move: async () => undefined },
        project: { list: async () => [] },
      },
      keymap: { layer: () => undefined },
      ui: {
        dialog: { select: async () => undefined, prompt: async () => undefined },
        toast: { show: () => undefined },
        router: { current: () => ({ type: "home" }) },
        slot: (claim: unknown) => {
          slots.push(claim)
          return () => {
            unregistered++
          }
        },
      },
    } as unknown as V2PluginContext

    const cleanup = await tuiPlugin.setup(context)
    expect(slots.length).toBe(1)
    expect(slots[0].append).toBe("app")
    cleanup()
    expect(unregistered).toBe(1)
  })

  it("v1 tui entry keeps the v1 shape and never exposes the v2 setup", () => {
    expect(typeof v1TuiPlugin.tui).toBe("function")
    expect("setup" in v1TuiPlugin).toBe(false)
  })
})
