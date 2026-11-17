import type {
  ActionReport,
  CheckReport,
  EffectReport,
  FollowReport,
  InspectReport,
  NotifyReport,
  StatusReport,
} from "@session-manager/domain/model/patches/Reports"

const short = (sha: string | null) => (sha === null ? "-" : sha.slice(0, 16))
const time = (ms: number | null) => (ms === null ? "(all lines)" : new Date(ms).toISOString())

/** Human-readable output of every command; `--json` prints the reports themselves instead. */
export const PatchesTextFormatter = {
  status(report: StatusReport): string {
    const lines = [`OpenCode loads Magic Context: ${report.loadedSpec ?? "(not configured in opencode.jsonc)"}`, "installed copies:"]
    if (report.installations.length === 0) lines.push("  (none)")
    for (const i of report.installations) {
      const spec = i.spec === i.root ? "(folder)" : i.spec
      lines.push(`  ${i.version.padEnd(10)} spec ${spec.padEnd(10)} ${i.loaded ? "LOADED " : "       "} ${i.root}`)
    }
    lines.push("patches:")
    for (const p of report.patches) {
      const checked = p.checked === "auto" ? " (auto-checked by follow)" : ""
      lines.push(`  ${p.patch} on ${p.installation.version}${p.installation.loaded ? " (loaded)" : ""}: ${p.state}${checked}`)
      for (const f of p.files) lines.push(`      ${f.path}  ${f.state}  ${short(f.sha)}`)
    }
    return lines.join("\n")
  },

  action(report: ActionReport): string {
    const lines: string[] = []
    for (const r of report.results) {
      lines.push(`${r.patch} on ${r.installation.version} (${r.installation.root}): ${r.outcome}${r.reason === null ? "" : ` — ${r.reason}`}`)
      for (const f of r.files) lines.push(`    ${f.path}  ${short(f.from)} → ${short(f.to)}`)
    }
    lines.push(`audit log: ${report.auditLog}`)
    return lines.join("\n")
  },

  check(report: CheckReport): string {
    if (report.ok) return `OK: every patch is applied on the loaded Magic Context (${report.loadedSpec})`
    const lines = [`NOT OK${report.reason === null ? "" : `: ${report.reason}`}`]
    for (const p of report.problems) lines.push(`  ${p.patch} on ${p.version}: ${p.state} (${p.root})`)
    return lines.join("\n")
  },

  inspect(report: InspectReport): string {
    const lines = [`Magic Context ${report.version}: ${report.roots.join(", ")}`]
    for (const f of report.findings) {
      lines.push(`${f.patch} (checked against ${f.checkedVersion}): ${JSON.stringify(f.find)}`)
      if (f.files.length === 0) lines.push("    not found in any dist/**/*.js file")
      for (const file of f.files) {
        const same = file.sameAsChecked ? "same file as the checked version" : "differs from the checked version"
        const expected = file.expected === null ? "a path the checked version does not change" : `${file.expected} expected`
        lines.push(`    ${file.path}: ${file.count} to replace (${expected}), ${file.replaced} already replaced, sha256 ${short(file.sha)} (${same})`)
        for (const snippet of file.snippets) lines.push(`        … ${snippet} …`)
      }
    }
    return lines.join("\n")
  },

  effect(report: EffectReport): string {
    const floors = Object.entries(report.summary.floors).map(([floor, count]) => `${floor}% ×${count}`).join(", ")
    return [
      `log: ${report.log}`,
      `since: ${time(report.since)} (${report.summary.linesRead} lines)`,
      `configured execute_threshold_percentage: ${report.configured ?? "(not set)"}`,
      `rejections of execute_threshold_percentage: ${report.summary.rejections}`,
      ...(report.summary.lastRejection === null ? [] : [`  last: ${report.summary.lastRejection}`]),
      `proactive floors logged: ${floors === "" ? "(none yet)" : floors}`,
      `threshold in use: ${report.summary.effectiveThreshold === null ? "(unknown yet)" : `${report.summary.effectiveThreshold}%`}`,
      `verdict: ${report.verdict}`,
    ].join("\n")
  },

  follow(report: FollowReport): string {
    const lines = [`follow: ${report.outcome}${report.version === null ? "" : ` (${report.version})`}`]
    for (const step of report.steps) lines.push(`  ${step.ok ? "ok    " : "FAILED"} ${step.step.padEnd(8)} ${`${(step.ms / 1000).toFixed(1)} s`.padStart(7)}  ${step.detail}`)
    lines.push(`opencode.jsonc entry: ${report.from ?? "(none)"}${report.to !== report.from ? ` → ${report.to}` : " (unchanged)"}`)
    if (report.evidence !== null) lines.push(`evidence: ${report.evidence}`)
    lines.push(`audit log: ${report.auditLog}`)
    return lines.join("\n")
  },

  notify(report: NotifyReport): string {
    if (report.ok) return "OK: nothing to notify"
    return `${report.notified ? "notified" : "already notified"}: ${report.message}`
  },
}
