import { test } from "bun:test"
import assert from "node:assert/strict"
import type { PathMapping } from "@session-manager/domain/model/PathMapping"
import { normalizeRemote } from "@session-manager/domain/services/GitRemote"
import { PathRewriter } from "@session-manager/domain/services/PathRewriter"
import { isWithin, sessionSubpath } from "@session-manager/domain/services/PosixPaths"

const MAPPING: PathMapping = {
  home: "/home/me",
  windowsUser: "Robin",
  drive: "C",
  relocations: [{ from: "/home/me/Old/proj", to: "/home/me/New/proj" }],
}

const rewriter = new PathRewriter(MAPPING)

/** [input, expected] — every one must also be a fixed point of a second rewrite. */
const CASES: readonly (readonly [string, string])[] = [
  ["C:/Users/Robin/Dev/AIML", "/home/me/Dev/AIML"],
  ["C:\\Users\\Robin\\Dev\\a.ts", "/home/me/Dev/a.ts"],
  ['{"cwd":"C:\\\\Users\\\\Robin\\\\Dev\\\\AIML","root":"/"}', '{"cwd":"/home/me/Dev/AIML","root":"/"}'],
  ['\\"C:\\\\\\\\Users\\\\\\\\Robin\\\\\\\\x.exe\\"', '\\"/home/me/x.exe\\"'],
  ["http://localhost:3030/@fs/C:/Users/Robin/AppData/x.js", "http://localhost:3030/@fs/home/me/AppData/x.js"],
  ["file:///C:/Users/Robin/a", "file:///home/me/a"],
  ['"sessionID:\\n"', '"sessionID:\\n"'],
  ["see\\nC:\\\\Users\\\\Robin\\\\a b", "see\\n/home/me/a b"],
  ["C:\\Users\\Robin2\\x", "C:\\Users\\Robin2\\x"],
  ["C:\\Users\\Robin.bak\\x", "C:\\Users\\Robin.bak\\x"],
  ["c:\\users\\robin", "/home/me"],
  ["D:\\Users\\Robin\\x", "D:\\Users\\Robin\\x"],
  ["xC:\\Users\\Robin", "xC:\\Users\\Robin"],
  ["/mnt/c/Users/Robin/x /c/Users/Robin/y /cygdrive/c/Users/Robin", "/home/me/x /home/me/y /home/me"],
  ["/run/media/me/Windows/Users/Robin/Dev", "/run/media/me/Windows/Users/Robin/Dev"],
  ["Users/Robin/Dev/AIML", "home/me/Dev/AIML"],
  ["my-Users/Robin/x", "my-Users/Robin/x"],
  ['"title":"Users\\\\Robin\\\\Documents\\\\x.md"', '"title":"home/me/Documents/x.md"'],
  ['pattern=\\"Users\\\\\\\\Robin\\\\\\\\Dev\\"', 'pattern=\\"home/me/Dev\\"'],
  ["C:\\Users\\Robin\\Relación\\x.md", "/home/me/Relación/x.md"],
  ["C:\\\\Users\\\\Robin\\\\a\\\\b\\n\\\\s+", "/home/me/a/b\\n\\\\s+"],
  ["C:/Users/Robin/a\\b", "/home/me/a\\b"],
  ["C:\\Users\\Robin\\src\\a.ts:12:3", "/home/me/src/a.ts:12:3"],
  ["debugCommand;c:/Users/Robin/AppData;C:/Users/Robin/x", "debugCommand;/home/me/AppData;/home/me/x"],
  ["\\u001b[32mc:\\\\Users\\\\Robin\\\\Doc\\u001b[39m", "\\u001b[32m/home/me/Doc\\u001b[39m"],
  ["\x1b[2mC:\\Users\\Robin\\a\x1b[0m", "\x1b[2m/home/me/a\x1b[0m"],
  ["-C:\\\\Users\\\\Robin\\\\a\\n+x", "-/home/me/a\\n+x"],
  ["\\u0013C:\\\\Users\\\\Robin\\\\b", "\\u0013/home/me/b"],
  ["C\\\\:\\\\\\\\Users\\\\\\\\Robin\\\\\\\\c", "/home/me/c"],
  ["C:/Users/Robin/Old/proj/src", "/home/me/New/proj/src"],
  ["/home/me/Old/proj", "/home/me/New/proj"],
  ["file:///home/me/Old/proj/a", "file:///home/me/New/proj/a"],
  ["/home/me/Old/proj-x", "/home/me/Old/proj-x"],
  ["plain text", "plain text"],
]

test("PathRewriter rewrites every catalogued form, and a second rewrite changes nothing", () => {
  for (const [input, expected] of CASES) {
    const once = rewriter.rewrite(input)
    assert.equal(once, expected, `rewrite(${JSON.stringify(input)})`)
    assert.equal(rewriter.rewrite(once), once, `idempotent for ${JSON.stringify(input)}`)
  }
})

test("PathRewriter keeps JSON byte-identical outside the paths it rewrites", () => {
  const text = '{"n":12345678901234567890,"cwd":"C:\\\\Users\\\\Robin\\\\x","s":"\\u00e9\\t"}'
  assert.equal(rewriter.rewrite(text), '{"n":12345678901234567890,"cwd":"/home/me/x","s":"\\u00e9\\t"}')
})

test("PathRewriter relocations: relative sources, and relative targets without a leading slash", () => {
  const relative = new PathRewriter({
    ...MAPPING,
    relocations: [
      { from: "Dev/old", to: "Dev/new" },
      { from: "/srv/a", to: "srv/b" },
    ],
  })
  assert.equal(relative.rewrite("see Dev/old/x and /Dev/old"), "see Dev/new/x and /Dev/new")
  assert.equal(relative.rewrite("@fs/srv/a/x and /srv/a"), "@fs/srv/b/x and srv/b")
})

test("PathRewriter.residual flags profile paths and a doubled home, nothing else", () => {
  assert.equal(rewriter.residual("x C:\\\\Users\\\\Robin y"), true)
  assert.equal(rewriter.residual("Users/robin"), true)
  assert.equal(rewriter.residual("/home/me/home/me/x"), true)
  assert.equal(rewriter.residual("/home/me/x"), false)
  assert.equal(rewriter.residual("Users/Robin2"), false)
})

test("normalizeRemote: URLs and scp remotes to host/path; no host gives null", () => {
  assert.equal(normalizeRemote("https://GitHub.com/Owner/Repo.git"), "github.com/Owner/Repo")
  assert.equal(normalizeRemote("ssh://git@github.com:22/owner/repo.git/"), "github.com/owner/repo")
  assert.equal(normalizeRemote("https://host/a%20b/"), "host/a b")
  assert.equal(normalizeRemote("git@github.com:owner/repo.git"), "github.com/owner/repo")
  assert.equal(normalizeRemote("Host.Example:path/x"), "host.example/path/x")
  assert.equal(normalizeRemote("  "), null)
  assert.equal(normalizeRemote(null), null)
  assert.equal(normalizeRemote("file:///srv/repo.git"), null)
  assert.equal(normalizeRemote("https://"), null)
  assert.equal(normalizeRemote("/srv/repo"), null)
  assert.equal(normalizeRemote("https://host/.git"), null)
})

test("isWithin and sessionSubpath agree with OpenCode's relative() for a folder at or below the worktree", () => {
  assert.equal(sessionSubpath("/home/me/", "/home/me/a/./b"), "a/b")
  assert.equal(sessionSubpath("/", "/home/me"), "home/me")
  assert.equal(isWithin("/home/me/", "/home/me"), true)
  assert.equal(isWithin("/home/me", "/home/me/x"), true)
  assert.equal(isWithin("/home/me", "/home/mex"), false)
  assert.equal(isWithin("/", "/anything"), true)
  assert.equal(sessionSubpath("/home/me", "/home/me"), null)
  assert.equal(sessionSubpath("/home/me", "/home/me/x"), "x")
})
