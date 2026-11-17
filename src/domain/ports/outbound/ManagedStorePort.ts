/** The folders `follow` installs into: `<installs>/<version>/` and staging folders beside them. */
export interface ManagedStorePort {
  /** A new, empty staging folder for `version`. */
  stage(version: string): Promise<string>
  /** The published folder of `version`, or null when there is none. */
  published(version: string): Promise<string | null>
  /** Renames the staging folder to `<installs>/<version>/` in one step and returns it; refuses when that exists. */
  publish(staging: string, version: string): Promise<string>
  /** Every published version. */
  versions(): Promise<readonly string[]>
  /** Removes a staging or published folder and everything in it. */
  remove(folder: string): Promise<void>
}
