import type { PatchDefinition } from "@session-manager/domain/model/patches/Patch"
import { executeThresholdMin } from "@session-manager/domain/patch-definitions/execute-threshold-min"
import { foldIdentityStable } from "@session-manager/domain/patch-definitions/fold-identity-stable"
import { foldProvenanceHeal } from "@session-manager/domain/patch-definitions/fold-provenance-heal"
import { noSessionModelFallback } from "@session-manager/domain/patch-definitions/no-session-model-fallback"
import { refusalRecovery } from "@session-manager/domain/patch-definitions/refusal-recovery"

/** Every patch, in the order they are applied. A file two patches change takes them in this order. */
export const PATCHES: readonly PatchDefinition[] = [
  executeThresholdMin,
  noSessionModelFallback,
  refusalRecovery,
  foldIdentityStable,
  foldProvenanceHeal,
]
