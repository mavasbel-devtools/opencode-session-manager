import { constants } from "node:fs"
import { copyFile, mkdir, rename, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

/**
 * Keeps the real stores the live tier syncs and upgrades in a folder a reboot does not clear:
 * `OPENCODE_SM_LIVE_FIXTURES`, else `$XDG_CACHE_HOME/opencode-session-manager/live` (default
 * `~/.cache/opencode-session-manager/live`).
 *   bun scripts/live-fixtures.mjs [--other <folder>] [--old-context <context.db>]
 * `--other` names a folder holding another profile's stores, either as a data home
 * (`opencode/opencode.db`, `cortexkit/magic-context/context.db`) or side by side (`opencode.db`,
 * `context.db`, as a backup folder holds them); they become `other-profile/` (a data home). `--old-context`
 * names a Magic Context store in an older format; it becomes `old-context/context.db`. Each source must
 * be a standalone store (a backup or a `VACUUM INTO` copy): one with a non-empty `-wal` file beside it
 * is refused, since a plain copy of it would miss what the WAL holds. Files land under a temporary
 * name and are renamed into place (cloned where the filesystem can). The live tests read these
 * folders when OPENCODE_SM_LIVE_OTHER_PROFILE / OPENCODE_SM_LIVE_OLD_CONTEXT are unset.
 */
const usage = "usage: bun scripts/live-fixtures.mjs [--other <folder>] [--old-context <context.db>]"
const home = process.env.HOME || os.homedir()
const destination =
  process.env.OPENCODE_SM_LIVE_FIXTURES || path.join(process.env.XDG_CACHE_HOME || path.join(home, ".cache"), "opencode-session-manager", "live")

const options = { other: undefined, oldContext: undefined }
const argv = process.argv.slice(2)
for (let index = 0; index < argv.length; index += 2) {
  const value = argv[index + 1]
  if (value === undefined || value.startsWith("--")) throw new Error(usage)
  if (argv[index] === "--other") options.other = path.resolve(value)
  else if (argv[index] === "--old-context") options.oldContext = path.resolve(value)
  else throw new Error(usage)
}
if (options.other === undefined && options.oldContext === undefined) throw new Error(usage)

async function exists(file) {
  return stat(file).then(
    () => true,
    () => false,
  )
}

async function standalone(file) {
  if (!(await exists(file))) throw new Error(`${file} does not exist`)
  const wal = await stat(`${file}-wal`).catch(() => null)
  if (wal !== null && wal.size > 0) throw new Error(`${file} has a non-empty ${path.basename(file)}-wal beside it: copy a backup or a VACUUM INTO copy instead`)
  return file
}

async function place(source, target) {
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  await copyFile(source, temporary, constants.COPYFILE_FICLONE)
  await rename(temporary, target)
  return { source, target, bytes: (await stat(target)).size }
}

async function otherStores(folder) {
  const dataHome = { opencode: path.join(folder, "opencode", "opencode.db"), context: path.join(folder, "cortexkit", "magic-context", "context.db") }
  if (await exists(dataHome.opencode)) return dataHome
  return { opencode: path.join(folder, "opencode.db"), context: path.join(folder, "context.db") }
}

const placed = []
if (options.other !== undefined) {
  const stores = await otherStores(options.other)
  const sources = [await standalone(stores.opencode), await standalone(stores.context)]
  const profile = path.join(destination, "other-profile")
  placed.push(await place(sources[0], path.join(profile, "opencode", "opencode.db")))
  placed.push(await place(sources[1], path.join(profile, "cortexkit", "magic-context", "context.db")))
}
if (options.oldContext !== undefined) {
  placed.push(await place(await standalone(options.oldContext), path.join(destination, "old-context", "context.db")))
}
console.log(JSON.stringify({ destination, placed }))
