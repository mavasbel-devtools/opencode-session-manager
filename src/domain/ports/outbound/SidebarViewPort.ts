import type { SidebarEntry } from "@session-manager/domain/model/SidebarEntry"

/** Outbound (driven) port: turns a sidebar entry into whatever the host renders. */
export interface SidebarViewPort<Color, Element> {
  render(entry: SidebarEntry<Color>): Element
}
