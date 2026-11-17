/** One recognised shape of a patch site: the text, its replacement, and how often it occurs in each file that has it. */
export interface MatcherShape {
  readonly find: string
  readonly replace: string
  readonly count: number
}

/**
 * One place a patch changes. A file holds the site when it contains one of the site's shapes; it
 * must then hold exactly one shape exactly `count` times, with `anchor` at most `window` characters
 * before every hit, and no shape's replacement may be present already. Exactly `files` files must
 * hold the site.
 */
export interface MatcherSite {
  readonly name: string
  readonly files: number
  readonly shapes: readonly MatcherShape[]
  readonly anchor: string
  readonly window: number
}

/**
 * How `follow` finds a patch's sites in a release no person has reviewed yet. Files are found by
 * content, not by their hashed bundle names: every `extension` file under `directory` is searched
 * for every site. A file is changed when it holds at least one site; its replacements are applied
 * in the order of `sites`. Anything that does not hold stops `follow`.
 *
 * `optional` marks a patch whose site upstream introduced (or dropped) in some release: when no
 * file holds any of its sites, the patch has nothing to do on that version and does not stop
 * `follow`. A file that holds some sites but not all still stops it, as for any other patch.
 */
export interface PatchMatcher {
  readonly directory: string
  readonly extension: string
  readonly sites: readonly MatcherSite[]
  readonly optional?: boolean
}
