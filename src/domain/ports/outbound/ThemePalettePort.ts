/**
 * Outbound (driven) port: the colours the application needs from the host theme.
 * Read on every paint, because the host theme is reactive and may change at runtime.
 */
export interface ThemePalettePort<Color> {
  muted(): Color
}
