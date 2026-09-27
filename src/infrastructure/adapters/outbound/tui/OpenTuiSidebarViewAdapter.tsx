import type { JSX } from "@opentui/solid"
import type { SidebarEntry } from "@session-id/domain/model/SidebarEntry"
import type { SidebarViewPort } from "@session-id/domain/ports/outbound/SidebarViewPort"
import type { HostColor } from "@session-id/infrastructure/host/V2TuiContext"

/**
 * Outbound adapter: one muted line of text. The entry's members are read inside
 * JSX, so the Solid transform turns them into reactive bindings and the line
 * repaints in place when the session or the theme changes.
 */
export class OpenTuiSidebarViewAdapter implements SidebarViewPort<HostColor, JSX.Element> {
  constructor() {}

  render(entry: SidebarEntry<HostColor>): JSX.Element {
    return <text fg={entry.color}>{entry.text}</text>
  }
}
