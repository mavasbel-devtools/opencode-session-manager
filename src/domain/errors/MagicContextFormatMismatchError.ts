export class MagicContextFormatMismatchError extends Error {
  /** Rows move between two stores only in one format, and a store is never migrated down. */
  constructor(source: string, sourceFormat: number, target: string, targetFormat: number) {
    super(
      `${source} has Magic Context format ${sourceFormat} and ${target} has ${targetFormat}: ` +
        (sourceFormat > targetFormat
          ? "update Magic Context where the target is used, start OpenCode there once, then sync again"
          : "the installed Magic Context cannot bring the source to the target's format; update Magic Context here"),
    )
    this.name = "MagicContextFormatMismatchError"
  }
}
