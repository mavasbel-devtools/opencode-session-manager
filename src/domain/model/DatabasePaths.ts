/** Pure path helpers, so the domain and application layers never import `node:path`. Both separators work. */

/** The file name of a path, without the directory part. */
export function baseName(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  return index >= 0 ? path.slice(index + 1) : path
}

/** The directory part of a path, or `""` when the path has no separator. */
export function dirName(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  if (index < 0) return ""
  if (index === 0) return path.slice(0, 1)
  return path.slice(0, index)
}

/** Joins path parts with `/`, which every Windows and POSIX file API accepts. */
export function joinPath(...parts: readonly string[]): string {
  return parts
    .filter((part) => part.length > 0)
    .map((part, index) =>
      index === 0 ? part.replace(/[\\/]+$/, "") : part.replace(/^[\\/]+/, "").replace(/[\\/]+$/, ""),
    )
    .join("/")
}
