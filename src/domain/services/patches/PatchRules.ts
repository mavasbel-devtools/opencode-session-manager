import { PatchError } from "@session-manager/domain/errors/PatchError"
import type { PatchDefinition, PatchedFile, PatchRelease, Replacement } from "@session-manager/domain/model/patches/Patch"
import type { FileState, PatchState } from "@session-manager/domain/model/patches/Status"

/** The release of a patch checked against `version`, if any. */
export function releaseFor(patch: PatchDefinition, version: string): PatchRelease | undefined {
  return patch.releases.find((release) => release.version === version)
}

/**
 * Where a file stands, from its sha256 (`null` when the file is absent). `later` holds the checksums a
 * later patch gives the same file, so a file already carried past this patch still reads as patched;
 * `earlier` holds an earlier patch's originals, so a file not carried to this patch yet still reads as
 * original.
 */
export function fileState(file: PatchedFile, sha: string | null, later: readonly string[] = [], earlier: readonly string[] = []): FileState {
  if (sha === null) return "missing"
  if (sha === file.before || earlier.includes(sha)) return "original"
  if (sha === file.after || later.includes(sha)) return "patched"
  return "changed"
}

/** Where a patch stands on an installation, from the states of its files. */
export function patchState(states: readonly FileState[]): PatchState {
  if (states.includes("missing")) return "missing-file"
  if (states.includes("changed")) return "changed"
  if (states.every((state) => state === "patched")) return "applied"
  if (states.every((state) => state === "original")) return "not-applied"
  return "partial"
}

export const occurrences = (text: string, needle: string): number => text.split(needle).length - 1

function rewrite(text: string, file: PatchedFile, from: (r: Replacement) => string, to: (r: Replacement) => string): string {
  return file.replacements.reduce((current, replacement) => {
    const found = occurrences(current, from(replacement))
    if (found !== replacement.count) {
      throw new PatchError(
        "count-mismatch",
        `${file.path}: expected ${replacement.count} × ${JSON.stringify(from(replacement))}, found ${found}`,
      )
    }
    return current.split(from(replacement)).join(to(replacement))
  }, text)
}

/** The patched text; refuses when a `find` text does not occur exactly the expected number of times. */
export function applyReplacements(text: string, file: PatchedFile): string {
  return rewrite(text, file, (r) => r.find, (r) => r.replace)
}

/** The original text back from a patched one; refuses on the same count rule, reversed. */
export function revertReplacements(text: string, file: PatchedFile): string {
  return rewrite(
    text,
    { ...file, replacements: [...file.replacements].reverse() },
    (r) => r.replace,
    (r) => r.find,
  )
}
