/** What an isolated OpenCode server reported after loading one plugin folder. */
export interface SandboxProof {
  /** The plugin's state in `GET /api/plugin` (`active`, `failed`, …), or null when it never appeared. */
  readonly status: string | null
  /** The folder the plugin was loaded from, or null. */
  readonly source: string | null
  /** Every line of the sandbox's Magic Context log. */
  readonly lines: readonly string[]
  /** Why the server could not be run, or null. */
  readonly error: string | null
}

/** Runs an isolated `opencode serve` (its own HOME, XDG folders and TMPDIR) with one plugin. */
export interface SandboxPort {
  prove(pluginRoot: string, magicContextConfig: string | null): Promise<SandboxProof>
}
