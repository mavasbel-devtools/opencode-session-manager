import type { TextRewriter } from "@session-manager/domain/services/PathRewriter"

/** Several rewriters as one: each rewrites the previous one's result; text is residual when any of them finds it so. */
export class CompositeTextRewriter implements TextRewriter {
  constructor(private readonly parts: readonly TextRewriter[]) {}

  rewrite(text: string): string {
    return this.parts.reduce((current, part) => part.rewrite(current), text)
  }

  residual(text: string): boolean {
    return this.parts.some((part) => part.residual(text))
  }
}
