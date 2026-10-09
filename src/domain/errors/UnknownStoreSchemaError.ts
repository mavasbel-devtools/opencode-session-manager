/**
 * A store holds tables or columns the schema this program was built with does not describe: a copy
 * through that schema would leave their data behind, so the store is refused instead.
 */
export class UnknownStoreSchemaError extends Error {
  readonly _tag = "UnknownStoreSchemaError"
  constructor(
    public readonly store: string,
    public readonly unknown: readonly string[],
  ) {
    super(
      `${store} has data this version of opencode-session-manager does not know (${unknown.join(", ")}); it was written by a newer OpenCode or Magic Context: update opencode-session-manager (or regenerate its schemas with scripts/schema.ts) before syncing`,
    )
    this.name = "UnknownStoreSchemaError"
  }
}
