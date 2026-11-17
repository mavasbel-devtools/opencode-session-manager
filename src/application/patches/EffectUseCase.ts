import type { EffectReport } from "@session-manager/domain/model/patches/Reports"
import type { PatchEffectPort } from "@session-manager/domain/ports/inbound/PatchEffectPort"
import type { LogPort } from "@session-manager/domain/ports/outbound/LogPort"
import type { ServicePort } from "@session-manager/domain/ports/outbound/ServicePort"
import type { TextSourcePort } from "@session-manager/domain/ports/outbound/TextSourcePort"
import { effectVerdict, summarizeEffect, THRESHOLD_SETTING } from "@session-manager/domain/services/patches/EffectReading"
import { numericSetting } from "@session-manager/domain/services/Jsonc"

/**
 * Whether Magic Context runs with the configured execute threshold, from its own log since the
 * OpenCode server started (or since the time given). Reads only.
 */
export class EffectUseCase implements PatchEffectPort {
  constructor(
    private readonly log: LogPort,
    private readonly service: ServicePort,
    private readonly magicContextConfig: TextSourcePort,
  ) {}

  async effect(sinceMs: number | null): Promise<EffectReport> {
    const since = sinceMs ?? (await this.service.startedAt())
    const lines = (await this.log.lines()) ?? []
    const config = await this.magicContextConfig.read()
    const configured = config === null ? null : numericSetting(config, THRESHOLD_SETTING)
    const summary = summarizeEffect(lines, since)
    return { log: this.log.location(), since, configured, summary, verdict: effectVerdict(summary, configured) }
  }
}
