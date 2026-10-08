export class MissingOriginalError extends Error {
  constructor(backupDirectory: string) {
    super(`no original database in ${backupDirectory}`)
    this.name = "MissingOriginalError"
  }
}
