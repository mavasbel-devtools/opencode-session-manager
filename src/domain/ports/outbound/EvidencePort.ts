/** Where `follow` writes the evidence of each adoption. */
export interface EvidencePort {
  /** Writes one evidence document and returns its path. */
  write(name: string, content: string): Promise<string>
}
