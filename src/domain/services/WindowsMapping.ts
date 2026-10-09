import type { PathMapping } from "@session-manager/domain/model/Migration"

const WINDOWS_PROFILE = /^([A-Za-z]):[\\/]+Users[\\/]+([^\\/]+)(.*)$/i

/**
 * The path mapping one session's own folders imply: a session kept under a Windows user profile on
 * the source (`C:/Users/Me/work/app`) and under a POSIX folder on the target (`/home/me/apps/app`)
 * maps that profile to `home`, then relocates the session's folder if it moved within it. Null when
 * the source folder is not under a Windows profile, or the target folder is not POSIX.
 */
export function inferWindowsMapping(sourceDirectory: string, targetDirectory: string, home: string): PathMapping | null {
  const match = WINDOWS_PROFILE.exec(sourceDirectory)
  if (match === null || !targetDirectory.startsWith("/")) return null
  const rest = match[3]!.replace(/[\\/]+/g, "/").replace(/\/$/, "")
  const mapped = `${home}${rest}`
  return {
    home,
    windowsUser: match[2]!,
    drive: match[1]!,
    mounts: [],
    relocations: mapped === targetDirectory ? [] : [{ from: mapped, to: targetDirectory }],
  }
}
