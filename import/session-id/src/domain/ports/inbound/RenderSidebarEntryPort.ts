/** What the host publishes to a `sidebar.content` claim. */
export interface SidebarSlotInput {
  readonly sessionID: string
}

/**
 * Inbound (driving) port: renders the sidebar line for a session.
 * `Element` stays a type parameter so the domain never names a UI package type.
 */
export interface RenderSidebarEntryPort<Element> {
  render(input: SidebarSlotInput): Element
}
