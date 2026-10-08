export class DatabaseNotFoundError extends Error {
  constructor(dbPath: string) {
    super(`database not found: ${dbPath}`)
    this.name = "DatabaseNotFoundError"
  }
}
