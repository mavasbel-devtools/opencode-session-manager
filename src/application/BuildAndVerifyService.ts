import type { BuildAndVerifyResult, BuildChecks } from "#domain/model/Build.ts"
import type { FingerprintComparer } from "#domain/services/FingerprintComparer.ts"
import type { ParityPolicy } from "#domain/services/ParityPolicy.ts"
import type { FileSystemPort } from "#domain/ports/outbound/FileSystemPort.ts"
import type { RuntimePort } from "#domain/ports/outbound/RuntimePort.ts"
import type { SqlitePort } from "#domain/ports/outbound/SqlitePort.ts"

export interface BuildAndVerifyInput {
  readonly source: string
  readonly target: string
  /** An offline run demands exact per-table parity; a rehearsal against a live source reports drift only. */
  readonly strict: boolean
}

/** Builds the compacted copy and proves it, returning the evidence. `ok` is false when a required check fails. */
export class BuildAndVerifyService {
  private readonly sqlite: SqlitePort
  private readonly fileSystem: FileSystemPort
  private readonly runtime: RuntimePort
  private readonly comparer: FingerprintComparer
  private readonly parity: ParityPolicy

  constructor(
    sqlite: SqlitePort,
    fileSystem: FileSystemPort,
    runtime: RuntimePort,
    comparer: FingerprintComparer,
    parity: ParityPolicy,
  ) {
    this.sqlite = sqlite
    this.fileSystem = fileSystem
    this.runtime = runtime
    this.comparer = comparer
    this.parity = parity
  }

  buildAndVerify(input: BuildAndVerifyInput): BuildAndVerifyResult {
    const started = this.runtime.now()
    this.sqlite.vacuumInto(input.source, input.target)
    const vacuumMs = this.runtime.now() - started
    const integrity = this.sqlite.integrity(input.target)
    const pages = this.sqlite.pageStats(input.target)
    const comparison = this.comparer.compare(
      this.sqlite.fingerprint(input.source),
      this.sqlite.fingerprint(input.target),
    )
    this.sqlite.setWal(input.target)
    const leftovers = ["-wal", "-shm"].filter((suffix) => this.fileSystem.exists(input.target + suffix))
    const checks: BuildChecks = {
      integrity_ok: integrity.integrity_ok,
      foreign_keys_ok: integrity.foreign_key_violations === 0,
      freelist_zero: pages.freelist_count === 0,
      parity_ok: comparison.ok,
      journal_wal: this.sqlite.journalMode(input.target) === "wal",
      no_target_sidecars: leftovers.length === 0,
    }
    return {
      ok: this.parity.ok(checks, input.strict),
      checks,
      vacuum_ms: vacuumMs,
      total_ms: this.runtime.now() - started,
      target_bytes: this.fileSystem.size(input.target),
      target_pages: pages,
      integrity,
      comparison,
    }
  }
}
