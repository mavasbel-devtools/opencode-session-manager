/**
 * What the sidebar shows for one session: a line of text in one colour.
 *
 * `Color` stays a type parameter so the domain never names a UI package type;
 * the outbound TUI adapters bind it to the host's colour type. Both members are
 * read at paint time, so an implementation may expose them as getters over
 * reactive host state.
 */
export interface SidebarEntry<Color> {
  readonly text: string
  readonly color: Color
}
