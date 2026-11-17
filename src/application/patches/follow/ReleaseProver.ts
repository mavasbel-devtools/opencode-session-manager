import type { StepLog } from "@session-manager/domain/model/patches/StepLog"
import type { SandboxPort } from "@session-manager/domain/ports/outbound/SandboxPort"
import type { TextSourcePort } from "@session-manager/domain/ports/outbound/TextSourcePort"
import { CONFIG_REJECTION, loadsFrom } from "@session-manager/domain/services/patches/FollowRules"

/**
 * Step prove: an isolated OpenCode server, given the user's real magic-context.jsonc and the staged
 * copy as its only plugin, must report the plugin `active`, loaded from that copy, and Magic Context
 * must not have rejected any setting.
 */
export class ReleaseProver {
  constructor(
    private readonly sandbox: SandboxPort,
    private readonly magicContextConfig: TextSourcePort,
  ) {}

  async prove(root: string, log: StepLog): Promise<boolean> {
    const proof = await this.sandbox.prove(root, await this.magicContextConfig.read())
    if (proof.error !== null) return log.fail("prove", `the isolated OpenCode server could not run: ${proof.error}`)
    if (proof.status !== "active") return log.fail("prove", `the isolated OpenCode server reports the plugin ${proof.status ?? "missing"}`)
    if (!loadsFrom(proof.source, root)) return log.fail("prove", `the isolated OpenCode server loaded ${proof.source ?? "nothing"}, not ${root}`)
    const rejections = proof.lines.filter((line) => CONFIG_REJECTION.test(line))
    if (rejections.length > 0) return log.fail("prove", `Magic Context rejected its configuration: ${rejections[0]}`)
    return log.pass(
      "prove",
      `an isolated OpenCode server loaded ${proof.source} (active) with ${this.magicContextConfig.location()}; ${proof.lines.length} log lines, 0 "config reload failed"`,
    )
  }
}
