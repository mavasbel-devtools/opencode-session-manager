/** Magic Context's project identity for a folder on this machine, the way Magic Context derives it. */
export interface MagicContextIdentityPort {
  /** `git:<root commit>` in a git repository, else `dir:<hash>`; null when the folder is not here. */
  identityOf(directory: string): string | null
}
