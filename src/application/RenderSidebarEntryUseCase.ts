import { sidebarText } from "@session-id/domain/model/SessionId"
import type {
  RenderSidebarEntryPort,
  SidebarSlotInput,
} from "@session-id/domain/ports/inbound/RenderSidebarEntryPort"
import type { SidebarViewPort } from "@session-id/domain/ports/outbound/SidebarViewPort"
import type { ThemePalettePort } from "@session-id/domain/ports/outbound/ThemePalettePort"

export class RenderSidebarEntryUseCase<Color, Element> implements RenderSidebarEntryPort<Element> {
  constructor(
    private readonly palette: ThemePalettePort<Color>,
    private readonly view: SidebarViewPort<Color, Element>,
  ) {}

  render(input: SidebarSlotInput): Element {
    const palette = this.palette
    // Getters keep the entry lazy: the host's slot input and theme are reactive
    // stores, so both values must be read when the line paints, not when the
    // claim is registered. Switching session or theme then repaints in place.
    return this.view.render({
      get text() {
        return sidebarText(input.sessionID)
      },
      get color() {
        return palette.muted()
      },
    })
  }
}
