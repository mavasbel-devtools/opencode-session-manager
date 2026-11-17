import type { InstalledCopy } from "@session-manager/domain/model/patches/Installation"
import type { InstallationsPort } from "@session-manager/domain/ports/outbound/InstallationsPort"

/** Every copy from several places, in order: OpenCode's npm cache, then the folders `follow` installed. */
export class CompositeInstallationsAdapter implements InstallationsPort {
  constructor(private readonly sources: readonly InstallationsPort[]) {}

  async list(): Promise<readonly InstalledCopy[]> {
    return (await Promise.all(this.sources.map((source) => source.list()))).flat()
  }
}
