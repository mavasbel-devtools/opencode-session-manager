export class TargetExistsError extends Error {
  constructor(target: string) {
    super(`refusing to overwrite existing ${target}`)
    this.name = "TargetExistsError"
  }
}
