// E2E tier: this plugin's own source, driven by the real OpenCode 2.0.14 host
// code, in this process, so coverage is measured.
//
// Real host pieces used here:
//   * `@opencode/plugin/host` 2.0.14 — `Host.resolve` (the real plugin-directory
//     resolver: subpaths `server`/`index`, `tui`, `rpc`) and `Host.load`;
//   * `tests/support/fixtures/host-2.0.14/structure.ts` — the host's real slot
//     resolver, a verbatim copy of packages/tui/src/plugin/structure.ts;
//   * `@opentui/solid` + `@opentui/core` 0.5.10 — the same renderer version the
//     host shares with TUI plugins.
//
// The one host step that cannot run in-process is the claim normalisation in
// packages/tui/src/plugin/api.tsx (it pulls in 88 files of the TUI app: theme,
// keymap, client, audio). Its rule is applied by `normalize` below, quoted from
// the release, and the real thing is proven by the live tier against the real
// opencode.exe.
import { describe, expect, it } from "bun:test"
import path from "node:path"
import { createSignal } from "solid-js"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { Host } from "@opencode/plugin/host"
import { MISSING_SESSION_ID_MESSAGE } from "@session-manager/domain/errors/MissingSessionIdError"
import type { V2ServerContext, V2ToolInfo } from "@session-manager/infrastructure/host/V2ServerContext"
import type { HostColor, V2SidebarClaim, V2SlotClaim, V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { fakeV2Client } from "@test/support/fakes/hosts"
import { contains, resolveSlots, type Claim } from "@test/support/fixtures/host-2.0.14/structure"

const pluginDirectory = path.resolve(import.meta.dir, "../../src/main/v2")
const MUTED = "#808080"
const ID = "ses_0123456789abCDEFGHIJKLMNOP"

type Loaded<Context, Result> = { default: { id: string; setup: (context: Context) => Result } }

const entries = Host.resolve({ directory: pluginDirectory })

/**
 * v2.0.14 packages/tui/src/plugin/api.tsx, `slot(value: SlotClaim)`:
 *
 *   const key = `slot#${claims++}`
 *   const kinds = placements.filter((item) => value[item] !== undefined)
 *   if (kinds.length !== 1) throw new Error("Slot claim requires exactly one placement key")
 *   const kind = kinds[0]
 */
const PLACEMENTS = ["prepend", "append", "before", "after", "replace"] as const

function normalize(plugin: string, claims: readonly V2SlotClaim[]): Claim<V2SlotClaim["render"]>[] {
  return claims.map((claim, index) => {
    const kinds = PLACEMENTS.filter((kind) => (claim as unknown as Record<string, unknown>)[kind] !== undefined)
    if (kinds.length !== 1) throw new Error("Slot claim requires exactly one placement key")
    const kind = kinds[0]!
    return {
      key: `slot#${index}`,
      plugin,
      placement: { kind, target: (claim as unknown as Record<string, string>)[kind]! },
      render: claim.render,
    }
  })
}

function recordingTuiContext(muted: () => HostColor) {
  const claims: V2SlotClaim[] = []
  let disposals = 0
  const context: V2TuiContext = {
    theme: {
      text: {
        // A getter over a real Solid signal: the host's theme is reactive, and
        // this is what makes the difference observable through the renderer.
        get muted() {
          return muted()
        },
      },
    },
    client: fakeV2Client(),
    keymap: { layer: () => undefined },
    ui: {
      slot(claim) {
        claims.push(claim)
        return () => {
          disposals++
        }
      },
      dialog: { show: () => undefined, set: () => undefined, clear: () => undefined, select: async () => undefined },
      toast: { show: () => undefined },
      router: { current: () => ({ type: "home" }) },
    },
  }
  return { context, claims, disposals: () => disposals }
}

describe("real 2.0.14 Host.resolve", () => {
  it("accepts src/main/v2 as a plugin directory and finds both entrypoints", () => {
    expect({
      server: entries.server?.endsWith("/src/main/v2/server.ts"),
      tui: entries.tui?.endsWith("/src/main/v2/tui.ts"),
      rpc: entries.rpc,
    }).toEqual({ server: true, tui: true, rpc: undefined })
  })
})

describe("real 2.0.14 host loading the TUI plugin", () => {
  it("loads the module, resolves the claim into the real prepend bucket and paints the line", async () => {
    const mod = (await Host.load(entries.tui!)) as Loaded<V2TuiContext, () => void>
    expect(mod.default.id).toBe("session-manager")

    const [muted, setMuted] = createSignal<HostColor>(RGBA.fromHex(MUTED))
    const host = recordingTuiContext(muted)
    const cleanup = mod.default.setup(host.context)
    // Two claims: the session ID line and the transfer command's app slot.
    expect(host.claims).toHaveLength(2)

    // The host's own resolver decides where each claim goes.
    const resolved = resolveSlots({
      paths: new Set(["app", "sidebar", "sidebar.content", "sidebar.footer"]),
      claims: normalize(mod.default.id, host.claims),
    })
    const slotted = resolved.slotted.get("sidebar.content")!
    expect({
      prepend: slotted.prepend.map((claim) => claim.key),
      append: slotted.append.length,
      before: slotted.before.length,
      after: slotted.after.length,
      replace: slotted.replace,
      suppressed: resolved.suppressed.length,
      degraded: resolved.degraded.length,
      otherPaths: [...resolved.slotted.keys()],
    }).toEqual({
      prepend: ["slot#0"],
      append: 0,
      before: 0,
      after: 0,
      replace: undefined,
      suppressed: 0,
      degraded: 0,
      otherPaths: ["sidebar.content", "app"],
    })
    // The transfer command's claim lands in the host's `app` slot, where its keymap layer runs in-tree.
    expect(resolved.slotted.get("app")!.append.map((claim) => claim.key)).toEqual(["slot#1"])
    // `sidebar.content` is inside the sidebar, so the line scrolls with its content.
    expect(contains("sidebar", "sidebar.content")).toBe(true)

    const [session, setSession] = createSignal(ID)
    const render = await testRender(
      () => slotted.prepend[0]!.render({ get sessionID() { return session() } }) as never,
      { width: 40, height: 2 },
    )
    const paint = async () => {
      await render.renderOnce()
      const line = render.captureCharFrame().split("\n")[0]!.trimEnd()
      const span = render.captureSpans().lines[0]!.spans.find((entry) => entry.text.includes("ses_"))
      const fg = span ? `#${span.fg.toInts().slice(0, 3).map((value) => value.toString(16).padStart(2, "0")).join("")}` : null
      return { line, fg }
    }

    expect(await paint()).toEqual({ line: ID, fg: MUTED })

    // Both bindings are live: a session switch and a theme switch repaint in place.
    setSession("ses_ZZZZZZZZZZZZZZZZZZZZZZZZZZ")
    setMuted(RGBA.fromHex("#5f87af"))
    expect(await paint()).toEqual({ line: "ses_ZZZZZZZZZZZZZZZZZZZZZZZZZZ", fg: "#5f87af" })

    render.renderer.destroy()
    cleanup()
    expect(host.disposals()).toBe(2)
  }, 60_000)
})

describe("real 2.0.14 host loading the server plugin", () => {
  it("loads the module and registers a working session-id tool", async () => {
    const mod = (await Host.load(entries.server!)) as Loaded<V2ServerContext, Promise<void>>
    expect(mod.default.id).toBe("session-manager")

    const added: V2ToolInfo[] = []
    await mod.default.setup({
      tool: {
        async transform(callback) {
          callback({ add: (tool) => added.push(tool) })
          return { dispose: () => undefined }
        },
      },
    })
    expect(added.map((tool) => tool.name)).toEqual(["session-id"])
    expect(await added[0]!.execute({}, { sessionID: ID })).toEqual({ content: ID })
  })

  it("fails a call without a session ID with the message the replaced tool used", async () => {
    const mod = (await Host.load(entries.server!)) as Loaded<V2ServerContext, Promise<void>>
    const added: V2ToolInfo[] = []
    await mod.default.setup({
      tool: {
        async transform(callback) {
          callback({ add: (tool) => added.push(tool) })
          return { dispose: () => undefined }
        },
      },
    })
    await expect(added[0]!.execute({}, {})).rejects.toThrow(MISSING_SESSION_ID_MESSAGE)
  })
})
