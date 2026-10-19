import fs from "node:fs"
import path from "node:path"
import { InvalidMapRuleError } from "@session-manager/domain/errors/InvalidMapRuleError"
import type { MapRule } from "@session-manager/domain/model/SessionSync"
import { stripComments } from "@session-manager/domain/services/Jsonc"
import { relocationsFromRules } from "@session-manager/domain/services/RelocateRules"
import { isWithin } from "@session-manager/domain/services/PosixPaths"
import type { LocationRepairMappingsPort } from "@session-manager/domain/ports/outbound/LocationRepairMappingsPort"

interface RepairConfig {
  readonly location_repair?: { readonly maps?: unknown }
}

/** Reads only the explicit mappings the owner has opted into for live repairs. */
export class NodeLocationRepairMappingsAdapter implements LocationRepairMappingsPort {
  constructor(
    private readonly environment: Readonly<Record<string, string | undefined>>,
    private readonly home: () => string,
  ) {}

  mappings(): readonly MapRule[] {
    const file = path.join(this.environment["XDG_CONFIG_HOME"] ?? path.join(this.home(), ".config"), "opencode", "session-manager.jsonc")
    if (!fs.existsSync(file)) return []
    let parsed: RepairConfig
    try {
      parsed = JSON.parse(stripComments(fs.readFileSync(file, "utf8"))) as RepairConfig
    } catch {
      throw new InvalidMapRuleError(file, "location_repair must be valid JSONC")
    }
    const raw = parsed.location_repair?.maps
    if (raw === undefined) return []
    if (!Array.isArray(raw)) throw new InvalidMapRuleError(file, "location_repair.maps must be an array")
    const maps = raw.map((value, index): MapRule => {
      if (typeof value !== "object" || value === null || typeof value.from !== "string" || typeof value.to !== "string")
        throw new InvalidMapRuleError(`${file}[${index}]`, "each map needs string from and to")
      return { from: value.from, to: value.to }
    })
    // Reuse the offline relocation validation so the two surfaces cannot accept different rules.
    const normalized = relocationsFromRules(maps, this.home()).folders
    for (let left = 0; left < normalized.length; left++)
      for (let right = left + 1; right < normalized.length; right++)
        if (isWithin(normalized[left]!.from, normalized[right]!.from) || isWithin(normalized[right]!.from, normalized[left]!.from))
          throw new InvalidMapRuleError(file, "location_repair maps must not overlap")
    return normalized
  }
}
