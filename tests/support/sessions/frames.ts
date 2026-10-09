import type { TestRendererSetup } from "@opentui/core/testing"

/**
 * Waits in real time until the painted frame contains `text` (OpenTUI's `waitForFrame` only renders
 * passes back to back, so it cannot see the end of work that waits on a timer, such as a lone
 * Escape or an apply that lets the notice paint first).
 */
export async function waitForText(setup: TestRendererSetup, text: string, timeoutMs = 3000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    await setup.renderOnce()
    const frame = setup.captureCharFrame()
    if (frame.includes(text)) return frame
    if (Date.now() > deadline) throw new Error(`timed out waiting for "${text}"; last frame:\n${frame}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
