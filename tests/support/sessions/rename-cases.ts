import type { NameRename } from "@session-manager/domain/model/NameRename"

/**
 * The renames of the ITAM course folders, and what whole-name replacement makes of each text: the
 * shared matcher table of the rename plan (~/Dev/docs/plans/2026-10-17-22-58-itam-course-rename-and-stack-updates-full-plan.md, §4.0).
 */
export const PARENT = "/home/m/Dev/repos/ITAM"

export const RENAMES: readonly NameRename[] = [
  { parent: PARENT, from: "2026-02-relational-dbs", to: "relational-dbs" },
  { parent: PARENT, from: "2026-02-non-relational-dbs", to: "non-relational-dbs" },
  { parent: PARENT, from: "2026-02-relational-dbs-backups", to: "relational-dbs-backups" },
]

/** A JSON string literal's contents, `depth` times (`\` and `"` escaped each time). */
export function escaped(text: string, depth: number): string {
  let out = text
  for (let level = 0; level < depth; level++) out = JSON.stringify(out).slice(1, -1)
  return out
}

const windows = "C:\\Users\\Marco\\Documents\\Work\\ITAM\\Cursos\\2026-02-non-relational-dbs\\homework"
const windowsAfter = "C:\\Users\\Marco\\Documents\\Work\\ITAM\\Cursos\\non-relational-dbs\\homework"

export const RENAME_CASES: readonly { readonly name: string; readonly input: string; readonly expected: string }[] = [
  { name: "an absolute path", input: `${PARENT}/2026-02-relational-dbs/x`, expected: `${PARENT}/relational-dbs/x` },
  { name: "the non-relational course", input: `${PARENT}/2026-02-non-relational-dbs/x`, expected: `${PARENT}/non-relational-dbs/x` },
  { name: "the backups folder, as itself", input: `${PARENT}/2026-02-relational-dbs-backups/x`, expected: `${PARENT}/relational-dbs-backups/x` },
  { name: "the end of a sentence", input: "the course 2026-02-relational-dbs.", expected: "the course relational-dbs." },
  { name: "a relative path", input: "2026-02-non-relational-dbs/labs-setup/a.py", expected: "non-relational-dbs/labs-setup/a.py" },
  { name: "prose in brackets and quotes", input: "course (2026-02-relational-dbs), kernel `2026-02-relational-dbs`", expected: "course (relational-dbs), kernel `relational-dbs`" },
  // No file is named after a course folder; the dotted keys are learning-hub's, which its own migration renames.
  { name: "a file name stem", input: "2026-02-relational-dbs.md", expected: "relational-dbs.md" },
  { name: "a longer name", input: "2026-02-relational-dbs_v2 x2026-02-relational-dbs a-2026-02-relational-dbs", expected: "2026-02-relational-dbs_v2 x2026-02-relational-dbs a-2026-02-relational-dbs" },
  { name: "a dotted key", input: "sync.2026-02-relational-dbs.parcial-1 preset.2026-02-relational-dbs.parcial-1.p5", expected: "sync.relational-dbs.parcial-1 preset.relational-dbs.parcial-1.p5" },
  { name: "a Windows path", input: windows, expected: windowsAfter },
  { name: "a Windows path in JSON", input: escaped(windows, 1), expected: escaped(windowsAfter, 1) },
  { name: "a Windows path in JSON twice", input: escaped(windows, 2), expected: escaped(windowsAfter, 2) },
  { name: "a Windows path in JSON three times", input: escaped(windows, 3), expected: escaped(windowsAfter, 3) },
  { name: "a file URL", input: `file://${PARENT}/2026-02-relational-dbs/a%20b`, expected: `file://${PARENT}/relational-dbs/a%20b` },
  { name: "after a percent-encoded separator", input: "banks/coding-agent%3A%3A2026-02-relational-dbs/memories", expected: "banks/coding-agent%3A%3Arelational-dbs/memories" },
  { name: "after a JSON line break", input: "a\\n2026-02-relational-dbs\\n", expected: "a\\nrelational-dbs\\n" },
  { name: "after a JSON-escaped character", input: "\\u00272026-02-relational-dbs\\u0027", expected: "\\u0027relational-dbs\\u0027" },
  { name: "after a terminal colour code", input: "\u001b[1m2026-02-relational-dbs\u001b[0m", expected: "\u001b[1mrelational-dbs\u001b[0m" },
  {
    name: "a dash-encoded path of the parent",
    input: "-home-m-Dev-repos-ITAM-2026-02-relational-dbs-worktrees-x",
    expected: "-home-m-Dev-repos-ITAM-relational-dbs-worktrees-x",
  },
  { name: "a dash-encoded backups folder", input: "-home-m-Dev-repos-ITAM-2026-02-relational-dbs-backups", expected: "-home-m-Dev-repos-ITAM-relational-dbs-backups" },
  { name: "a quoted assignment", input: 'name = \\"2026-02-relational-dbs\\"', expected: 'name = \\"relational-dbs\\"' },
  { name: "the semester alone and other courses", input: "2026-02 (2026-02) 2026-02-01T10:00 2027-01-scalable-systems", expected: "2026-02 (2026-02) 2026-02-01T10:00 2027-01-scalable-systems" },
  { name: "names already new", input: "relational-dbs non-relational-dbs relational-dbs-backups", expected: "relational-dbs non-relational-dbs relational-dbs-backups" },
  {
    name: "all three in one text, each once",
    input: "2026-02-relational-dbs-backups 2026-02-relational-dbs 2026-02-non-relational-dbs",
    expected: "relational-dbs-backups relational-dbs non-relational-dbs",
  },
]
