import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/solid"
import type { V2KeymapLayer, V2ThemeTokens, V2TuiContext } from "@session-manager/infrastructure/host/V2TuiContext"
import { fakeV2Client } from "@test/support/fakes/hosts"
import { waitForText } from "@test/support/sessions/frames"

/** The dialog colours of a theme: what `surface("dialog")` gives the host's own dialogs. */
export const DIALOG_THEME: V2ThemeTokens = {
  text: { muted: "#808080" },
  surface: () => ({
    text: { muted: "#808080", base: "#eeeeee", action: { primary: { focused: "#000000" } } },
    background: { action: { primary: { focused: "#fab283" } } },
  }),
}

/**
 * The host's dialog stack and keymap, as far as a plugin dialog sees them: `ui.dialog.show` paints
 * the dialog with OpenTUI's test renderer (the renderer the host shares), `keymap.layer` keeps the
 * layers a component registers so a key can run the command bound to it (as the host's keymap
 * does, above the focused input), and Esc runs the dialog's `onClose` (the host's own Escape).
 */
export function dialogHost(options: { readonly theme?: V2ThemeTokens; readonly route?: { type: string; sessionID?: string } } = {}) {
  const layers: Array<() => V2KeymapLayer> = []
  const sizes: string[] = []
  const toasts: unknown[] = []
  let setup: TestRendererSetup | undefined
  let closing: (() => void) | undefined
  let shown: Promise<void> = Promise.resolve()
  let clears = 0

  const close = () => {
    setup?.renderer.destroy()
    setup = undefined
  }
  const context: V2TuiContext = {
    theme: options.theme ?? DIALOG_THEME,
    client: fakeV2Client(),
    keymap: { layer: (layer) => void layers.push(layer) },
    ui: {
      slot: () => () => undefined,
      dialog: {
        show: (render, onClose) => {
          closing = onClose
          shown = testRender(render, { width: 100, height: 30 }).then((value) => {
            setup = value
          })
        },
        set: (value) => void sizes.push(value.size ?? "medium"),
        clear: () => {
          clears++
          closing?.()
          close()
        },
        select: async () => undefined,
      },
      toast: { show: (toast) => void toasts.push(toast) },
      router: { current: () => options.route ?? { type: "home" } },
    },
  }

  const current = () => {
    if (setup === undefined) throw new Error("no dialog is shown")
    return setup
  }
  return {
    context,
    /** Every keymap layer registered so far (the plugin's own command layer first). */
    layers: () => layers,
    sizes,
    toasts,
    clears: () => clears,
    /** Waits until the dialog is painted and its input has had its focus. */
    async ready(): Promise<void> {
      await shown
      await current().renderOnce()
      await new Promise((resolve) => setTimeout(resolve, 10))
    },
    /** Runs the command the dialog's newest modal layer binds to `key`. */
    async press(key: string): Promise<void> {
      const layer = [...layers].reverse().map((factory) => factory()).find((value) => value.mode === "modal")
      const command = layer?.commands.find((entry) => entry.bind === key)
      if (command === undefined) throw new Error(`no command is bound to ${key}`)
      command.run()
      if (setup !== undefined) await setup.renderOnce()
    },
    /** Types into the focused input. */
    async type(text: string): Promise<void> {
      await current().mockInput.typeText(text)
      await current().renderOnce()
    },
    async backspace(times: number): Promise<void> {
      for (let index = 0; index < times; index++) current().mockInput.pressBackspace()
      await current().renderOnce()
    },
    /** Clicks the first painted line holding `text`. */
    async click(text: string): Promise<void> {
      await current().renderOnce()
      const lines = current().captureCharFrame().split("\n")
      const row = lines.findIndex((line) => line.includes(text))
      if (row === -1) throw new Error(`"${text}" is not painted`)
      await current().mockMouse.click(lines[row]!.indexOf(text), row)
      if (setup !== undefined) await setup.renderOnce()
    },
    async frame(): Promise<string> {
      await current().renderOnce()
      return current().captureCharFrame()
    },
    waitFor: (text: string) => waitForText(current(), text),
    /** The host's Escape: closes the dialog and runs its `onClose`. */
    escape(): void {
      closing?.()
      close()
    },
    shown: () => setup !== undefined,
    destroy: close,
  }
}
