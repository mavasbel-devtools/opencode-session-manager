/**
 * The form OpenCode hashes into a git project's id (`url` and `parts` in OpenCode's
 * `project.ts`, the same in OpenCode 1.18.32 and 2.0.26): a remote that parses as a URL gives its
 * host (lower-cased) and path, a `file:` URL gives nothing; otherwise the scp form
 * `[user@]host:path`. The path loses its leading slashes, a trailing `.git` and trailing slashes,
 * and is kept as written (case, percent-escapes). No host or no path gives `null`.
 */
export function normalizeRemote(remote: string | null): string | null {
  const value = (remote ?? "").trim()
  if (value === "") return null
  const parsed = URL.parse(value)
  if (parsed !== null) return parsed.protocol === "file:" ? null : parts(parsed.hostname, parsed.pathname)
  const scp = /^([^@/:]+@)?([^/:]+):(.+)$/.exec(value)
  return scp === null ? null : parts(scp[2]!, scp[3]!)
}

function parts(host: string, name: string): string | null {
  const path = name.replace(/^\/+/, "").replace(/\.git\/?$/, "").replace(/\/+$/, "")
  return host === "" || path === "" ? null : `${host.toLowerCase()}/${path}`
}
