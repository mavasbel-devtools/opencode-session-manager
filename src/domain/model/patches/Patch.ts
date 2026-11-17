import type { PatchMatcher } from "@session-manager/domain/model/patches/Matcher"

/** One textual change inside a file: `find` must occur exactly `count` times before, `replace` after. */
export interface Replacement {
  readonly find: string
  readonly replace: string
  readonly count: number
}

/** A file of the installed package (path relative to the package root) and its sha256 before and after. */
export interface PatchedFile {
  readonly path: string
  readonly before: string
  readonly after: string
  readonly replacements: readonly Replacement[]
}

/** The exact files a patch changes in one published version of the package. */
export interface PatchRelease {
  readonly version: string
  readonly files: readonly PatchedFile[]
}

/** A local change to the installed Magic Context, with the versions it has been checked against. */
export interface PatchDefinition {
  readonly id: string
  readonly title: string
  readonly reason: string
  /** Repo-relative path of the document holding the evidence for this patch. */
  readonly evidence: string
  /** The versions a person reviewed. */
  readonly releases: readonly PatchRelease[]
  /** How `follow` locates the sites in a version nobody reviewed. */
  readonly matcher: PatchMatcher
}

/** Who checked a release: a person (`releases` in `patches/`), or `follow` through the matcher and the sandbox proof. */
export type CheckedBy = "reviewed" | "auto"

/** A release `follow` derived and proved, stored beside the installs. */
export interface DerivedRelease {
  readonly patch: string
  readonly release: PatchRelease
}
