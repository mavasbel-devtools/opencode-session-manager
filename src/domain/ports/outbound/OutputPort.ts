/** Where the CLI writes its lines. Nothing else in the tool prints. */
export interface OutputPort {
  line(text: string): void
}
