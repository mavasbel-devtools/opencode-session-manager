import { describe, expect, it } from "bun:test"
import { RenderSidebarEntryUseCase } from "@session-manager/application/RenderSidebarEntryUseCase"
import { fakePalette, fakeView } from "@test/support/fakes/hosts"

describe("RenderSidebarEntryUseCase", () => {
  it("hands the view an entry carrying the session ID and the muted colour", () => {
    const palette = fakePalette("#808080")
    const view = fakeView()
    const entry = new RenderSidebarEntryUseCase(palette, view).render({ sessionID: "ses_1" })
    expect({ text: entry.text, color: entry.color }).toEqual({ text: "ses_1", color: "#808080" })
    expect(view.entries).toHaveLength(1)
  })

  it("reads text and colour only when they are used, so both stay reactive", () => {
    const palette = fakePalette("#111111")
    const view = fakeView()
    const useCase = new RenderSidebarEntryUseCase(palette, view)
    const input = { sessionID: "ses_before" }
    const entry = useCase.render(input)
    // Nothing read yet: the use case must not have snapshotted the values.
    expect(palette.reads).toBe(0)

    palette.color = "#222222"
    expect(entry.color).toBe("#222222")
    expect(palette.reads).toBe(1)
    expect(entry.text).toBe("ses_before")
  })

  it("follows the host input object when the session changes", () => {
    const palette = fakePalette("#333333")
    const view = fakeView()
    const input = { sessionID: "ses_a" }
    const entry = new RenderSidebarEntryUseCase(palette, view).render(input)
    expect(entry.text).toBe("ses_a")
    // The host passes one reactive object per claim; a session switch mutates it.
    ;(input as { sessionID: string }).sessionID = "ses_b"
    expect(entry.text).toBe("ses_b")
  })
})
