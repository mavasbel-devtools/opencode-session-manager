import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Database } from "bun:sqlite"

/**
 * Two databases shaped like `opencode.db` — this machine's and a Windows one — and a home folder
 * on disk for their sessions: a git repository with an `origin`, a plain folder, a folder that moved
 * on this machine, folders that do not exist here, a Mercurial checkout, a repository with a stored
 * id, an empty repository, one with an scp-style remote, and a file where a folder should be.
 */

const SCHEMA = `
  create table project(id text primary key, worktree text not null, vcs text, name text,
    time_created integer not null, time_updated integer not null, sandboxes text not null, time_active integer default 0 not null);
  create table project_directory(project_id text not null references project(id) on delete cascade, directory text not null,
    primary key (project_id, directory));
  create table worktree(directory text primary key, project_id text not null references project(id) on delete cascade);
  create table permission(project_id text primary key references project(id) on delete cascade, resource text);
  create table session(id text primary key, project_id text not null references project(id) on delete cascade,
    directory text not null, path text, title text);
  create table message(id text primary key, session_id text not null references session(id) on delete cascade, data text);
  create table part(id text primary key, message_id text not null references message(id) on delete cascade, data text);
  create table todo(session_id text not null references session(id) on delete cascade, position integer not null, content text,
    primary key (session_id, position));
  create table session_v2(id text primary key, project_id text not null references project(id) on delete cascade,
    directory text not null, path text, title text);
  create table session_message(id text primary key, session_id text not null references session_v2(id) on delete cascade, data text);
  create table kv(key text primary key, value text);
  create table migration(id text primary key, name text);
  create table credential(id text primary key, secret text);
  create table event(id integer primary key, data text);
  create table note(body text);
`

export const WINDOWS_USER = "Robin"
export const MOUNT = "/mnt/windows"
/** A timestamp beyond 2^53: a copied project row has to keep it exactly. */
export const BIG_TIME = 9007199254740993n

export function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex")
}

function git(folder: string, ...args: string[]): void {
  const result = spawnSync(
    "git",
    ["-C", folder, "-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args],
    { encoding: "utf8" },
  )
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`)
}

/** `git init` with an optional remote and an optional first commit. */
export function makeRepository(folder: string, options: { remote?: string; remoteName?: string; commit?: boolean } = {}): void {
  mkdirSync(folder, { recursive: true })
  git(folder, "init", "-q")
  if (options.remote !== undefined) git(folder, "remote", "add", options.remoteName ?? "origin", options.remote)
  if (options.commit === true) git(folder, "commit", "-q", "--allow-empty", "-m", "first")
}

export interface MigrationWorld {
  /** The home the Windows profile maps to (symlinks resolved). */
  readonly home: string
  readonly live: string
  readonly windows: string
  /** Where the Windows `Old/proj` folder lives on this machine. */
  readonly moved: { readonly from: string; readonly to: string }
  readonly ids: {
    readonly repo: string
    readonly notes: string
    readonly moved: string
    readonly liveHome: string
    readonly stored: string
    readonly scp: string
  }
}

/** Builds the home folders and both databases under `root`. */
export function makeMigrationWorld(root: string): MigrationWorld {
  const home = join(realpathSync(root), "home")
  makeRepository(join(home, "Dev", "repo"), { remote: "https://GitHub.com/Example/Repo.git", commit: true })
  mkdirSync(join(home, "Dev", "repo", "sub"), { recursive: true })
  mkdirSync(join(home, "Notes"), { recursive: true })
  mkdirSync(join(home, "New", "proj"), { recursive: true })
  mkdirSync(join(home, "Hg", ".hg"), { recursive: true })
  makeRepository(join(home, "Stored"), { remote: "/local/only", commit: true })
  writeFileSync(join(home, "Stored", ".git", "opencode"), "stored-project-id\n")
  makeRepository(join(home, "Empty"))
  makeRepository(join(home, "Scp"), { remote: "git@example.org:team/scp.git" })
  writeFileSync(join(home, "afile"), "")
  const ids = {
    repo: sha1("git-remote:github.com/Example/Repo"),
    notes: sha1(`directory:${join(home, "Notes")}`),
    moved: sha1(`directory:${join(home, "New", "proj")}`),
    liveHome: sha1(`directory:${home}`),
    stored: "stored-project-id",
    scp: sha1("git-remote:example.org/team/scp"),
  }

  const live = join(root, "live", "opencode.db")
  mkdirSync(join(root, "live"), { recursive: true })
  const db = new Database(live)
  db.exec(SCHEMA)
  db.exec("pragma journal_mode = wal")
  const project = db.query("insert into project values (?, ?, ?, ?, ?, ?, '[]', 0)")
  project.run("global", "/", null, null, 1, 1)
  project.run(ids.liveHome, home, null, "home", 2, 2)
  // The same repository, known here from an older clone: its id matches, its worktree is stale.
  project.run(ids.repo, join(home, "Old", "repo-clone"), "git", "Repo (old clone)", 7, 7)
  const v2 = db.query("insert into session_v2 values (?, ?, ?, ?, ?)")
  v2.run("ses_l1", ids.liveHome, home, null, "live home")
  v2.run("ses_l2", "global", `${MOUNT}/Users/${WINDOWS_USER}/Dev/repo`, `mnt/windows/Users/${WINDOWS_USER}/Dev/repo`, "mounted")
  db.query("insert into session_message values ('msg_l1', 'ses_l2', ?)").run(
    JSON.stringify({ cwd: `${MOUNT}/Users/${WINDOWS_USER}/Dev/repo` }),
  )
  db.query("insert into permission values (?, ?)").run(ids.liveHome, `${MOUNT}/Users/${WINDOWS_USER}/Notes/*`)
  db.query("insert into kv values ('shared', 'linux')").run()
  db.query("insert into migration values ('m1', 'first')").run()
  db.query("insert into event values (1, 'live event')").run()
  db.close()

  const windows = join(root, "windows", "opencode.db")
  mkdirSync(join(root, "windows"), { recursive: true })
  const win = new Database(windows)
  win.exec(SCHEMA)
  const wproject = win.query("insert into project values (?, ?, ?, ?, ?, ?, '[]', 0)")
  wproject.run("global", "/", null, null, 1, 1)
  wproject.run("winrepo", "C:/Users/Robin/Dev/repo", "git", "Repo", BIG_TIME, 3)
  wproject.run("winnotes", "C:/Users/Robin/Notes", null, "Notes", 4, 4)
  wproject.run("winmoved", "C:/Users/Robin/Old/proj", null, "Moved", 5, 5)
  wproject.run("wingone", "C:/Users/Robin/Gone", null, "Gone", 6, 6)
  win.query("insert into project_directory values ('winrepo', ?)").run("C:/Users/Robin/Dev/repo")
  // The same folder in the other spelling: both rows collapse into one once rewritten.
  win.query("insert into project_directory values ('winrepo', ?)").run("C:\\Users\\Robin\\Dev\\repo")
  win.query("insert into worktree values (?, 'winrepo')").run("C:/Users/Robin/Dev/repo-wt")
  win.query("insert into permission values ('winrepo', ?)").run("C:\\Users\\Robin\\Dev\\repo\\*")
  win.query("insert into permission values ('winmoved', ?)").run("C:/Users/Robin/Old/proj/*")
  const v1 = win.query("insert into session values (?, ?, ?, ?, ?)")
  v1.run("ses_w1", "winrepo", "C:/Users/Robin/Dev/repo/sub", "sub", "repo sub")
  v1.run("ses_w2", "global", "C:\\Users\\Robin", "Users/Robin", "profile")
  win.query("insert into message values ('msg_w1', 'ses_w1', ?)").run(
    // The big number has to come out byte-identical: the rewrite never re-serializes JSON.
    `{"path":{"cwd":"C:\\\\Users\\\\Robin\\\\Dev\\\\repo\\\\sub","root":"/"},"n":12345678901234567890}`,
  )
  win.query("insert into part values ('prt_w1', 'msg_w1', ?)").run(
    JSON.stringify({ input: JSON.stringify({ command: "dir C:\\Users\\Robin\\Notes" }), title: "Users\\Robin\\Notes\\a.md" }),
  )
  win.query("insert into part values ('prt_w2', 'msg_w1', ?)").run("plain text, no path")
  win.query("insert into todo values ('ses_w1', 0, 'do it')").run()
  const wv2 = win.query("insert into session_v2 values (?, ?, ?, ?, ?)")
  wv2.run("ses_w3", "winnotes", "C:/Users/Robin/Notes", null, "notes")
  wv2.run("ses_w4", "winmoved", "C:/Users/Robin/Old/proj", null, "moved")
  wv2.run("ses_w5", "wingone", "C:/Users/Robin/Gone/x", "x", "gone")
  wv2.run("ses_w6", "global", "C:/Users/Robin/Elsewhere", "Users/Robin/Elsewhere", "elsewhere")
  // An older Windows build stored the subpath with backslashes; the folder no longer exists.
  wv2.run("ses_w12", "wingone", "C:/Users/Robin/Gone/y/z", "y\\z", "backslash subpath")
  wv2.run("ses_w7", "global", "C:/Users/Robin/Hg", "Users/Robin/Hg", "mercurial")
  wv2.run("ses_w8", "global", "C:/Users/Robin/Stored", "Users/Robin/Stored", "stored id")
  wv2.run("ses_w9", "global", "C:/Users/Robin/Empty", "Users/Robin/Empty", "empty repo")
  wv2.run("ses_w10", "global", "C:/Users/Robin/Scp", "Users/Robin/Scp", "scp remote")
  wv2.run("ses_w11", "global", "C:/Users/Robin/afile", "Users/Robin/afile", "a file")
  // Looks like JSON but is not, before or after the rewrite.
  win.query("insert into part values ('prt_w3', 'msg_w1', ?)").run("[oops C:/Users/Robin/x")
  // A drive glued to a word (binary output): left alone, and reported as residual.
  win.query("insert into part values ('prt_w4', 'msg_w1', ?)").run("dump xC:\\Users\\Robin\\y")
  win.query("insert into session_message values ('msg_w3', 'ses_w3', ?)").run(
    `{"text":"see @fs/C:/Users/Robin/Notes/b.md and C:/Users/Robin/Old/proj/c.md"}`,
  )
  win.query("insert into kv values ('shared', 'windows')").run()
  win.query("insert into kv values ('windows-only', 'C:/Users/Robin/x')").run()
  win.query("insert into migration values ('m1', 'first')").run()
  win.query("insert into credential values ('c1', 'C:/Users/Robin/.secret')").run()
  win.query("insert into event values (1, 'windows event')").run()
  win.query("insert into note values ('dup')").run()
  win.query("insert into note values ('dup')").run()
  win.close()

  return { home, live, windows, moved: { from: join(home, "Old", "proj"), to: join(home, "New", "proj") }, ids }
}

/** Runs a query read-only and returns plain objects. */
export function query<T>(dbPath: string, sql: string, ...params: (string | number)[]): T[] {
  const db = new Database(dbPath, { readonly: true })
  try {
    return (db.query(sql).all(...params) as Record<string, unknown>[]).map((row) => ({ ...row })) as T[]
  } finally {
    db.close()
  }
}
