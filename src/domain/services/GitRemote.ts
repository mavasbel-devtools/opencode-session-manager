/**
 * The form OpenCode hashes into a git project's id: `host/path`, the host lower-cased, with no
 * leading slash, no trailing slash and no `.git`. Works for URLs (`https://`, `ssh://`, `git://`)
 * and scp-like remotes (`git@host:owner/repo.git`); a `file://` URL, a local path or an empty
 * remote has no host and yields `null`.
 */
export function normalizeRemote(remote: string | null): string | null {
  const url = (remote ?? "").trim()
  let host: string
  let path: string
  if (url.includes("://")) {
    const parsed = URL.canParse(url) ? new URL(url) : null
    if (parsed === null || parsed.protocol === "file:" || parsed.hostname === "") return null
    host = parsed.hostname
    path = decodeURIComponent(parsed.pathname)
  } else {
    const scp = /^(?:[^@/:]+@)?([^/:]+):(.+)$/.exec(url)
    if (scp === null) return null
    host = scp[1] as string
    path = scp[2] as string
  }
  const cleaned = path.replace(/^\/+/, "").replace(/\.git\/?$/, "").replace(/\/+$/, "")
  return cleaned === "" ? null : `${host.toLowerCase()}/${cleaned}`
}
