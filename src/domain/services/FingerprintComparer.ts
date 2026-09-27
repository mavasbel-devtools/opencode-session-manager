import type { ComparisonResult, Fingerprint, TableComparison } from "#domain/model/Database.ts"

/** Compares two fingerprints and names every difference: schema, header, row count or row content. */
export class FingerprintComparer {
  compare(source: Fingerprint, target: Fingerprint): ComparisonResult {
    const failures: string[] = []
    if (JSON.stringify(source.schema) !== JSON.stringify(target.schema)) failures.push("schema differs")
    if (JSON.stringify(source.header) !== JSON.stringify(target.header)) failures.push("user_version/application_id differ")
    const names = [...new Set([...Object.keys(source.tables), ...Object.keys(target.tables)])].sort()
    const tables: TableComparison[] = names.map((name) => {
      const from = source.tables[name]
      const to = target.tables[name]
      const match = from !== undefined && to !== undefined && from.rows === to.rows && from.sha256 === to.sha256
      if (!match) failures.push(`table ${name} differs`)
      return { name, source_rows: from?.rows ?? null, target_rows: to?.rows ?? null, match }
    })
    return { ok: failures.length === 0, failures, tables }
  }
}
