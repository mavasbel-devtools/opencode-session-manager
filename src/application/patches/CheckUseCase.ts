import type { CheckReport } from "@session-manager/domain/model/patches/Reports"
import type { PatchCheckPort } from "@session-manager/domain/ports/inbound/PatchCheckPort"
import type { PatchStatusPort } from "@session-manager/domain/ports/inbound/PatchStatusPort"

/** Passes only when every patch is applied on every installed copy OpenCode loads. */
export class CheckUseCase implements PatchCheckPort {
  constructor(private readonly status: PatchStatusPort) {}

  async check(): Promise<CheckReport> {
    const report = await this.status.status()
    const fail = (reason: string): CheckReport => ({ ok: false, loadedSpec: report.loadedSpec, reason, problems: [] })
    if (report.loadedSpec === null) return fail("Magic Context is not configured in opencode.jsonc")
    if (!report.installations.some((installation) => installation.loaded)) {
      return fail(`Magic Context ${report.loadedSpec} is configured but not installed yet (start OpenCode once)`)
    }
    const problems = report.patches
      .filter((patch) => patch.installation.loaded && patch.state !== "applied")
      .map((patch) => ({ patch: patch.patch, version: patch.installation.version, root: patch.installation.root, state: patch.state }))
    return { ok: problems.length === 0, loadedSpec: report.loadedSpec, reason: null, problems }
  }
}
