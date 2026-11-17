import type { EffectReport } from "@session-manager/domain/model/patches/Reports"

export interface PatchEffectPort {
  effect(sinceMs: number | null): Promise<EffectReport>
}
