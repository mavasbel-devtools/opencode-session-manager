import type { RuntimePort } from "@session-manager/domain/ports/outbound/RuntimePort"

/** Deterministic runtime: the clock advances one tick per read, and every name is pinned. */
export class FakeRuntime implements RuntimePort {
  public current = 0
  public processId = 4242
  public fixedStamp = "2026-09-27-00-00-00"
  public temporary = "C:/fake/tmp"
  public home = "C:/fake/home"

  public platformName = "linux"

  pid(): number {
    return this.processId
  }

  platform(): string {
    return this.platformName
  }

  now(): number {
    this.current += 1
    return this.current
  }

  stamp(): string {
    return this.fixedStamp
  }

  temporaryDirectory(): string {
    return this.temporary
  }

  homeDirectory(): string {
    return this.home
  }
}
