/** Magic Context's diagnostic log. */
export interface LogPort {
  location(): string
  /** Every line, or `null` when the log does not exist. */
  lines(): Promise<readonly string[] | null>
}
