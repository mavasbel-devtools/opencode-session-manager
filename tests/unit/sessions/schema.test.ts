import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { getTableColumns, getTableName } from "drizzle-orm"
import { generate, tablesOf } from "../../../scripts/schema"
import * as magicContext from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/magic-context"
import * as opencode from "@session-manager/infrastructure/adapters/outbound/sqlite/schema/opencode"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

const SCHEMAS = [
  {
    fixture: "../../support/sessions/opencode-2.0.24.sql",
    source: "../../../src/infrastructure/adapters/outbound/sqlite/schema/opencode.ts",
    title: "tests/support/sessions/opencode-2.0.24.sql (OpenCode 2.0.24)",
    tables: opencode.TABLES,
  },
  {
    fixture: "../../support/sessions/magic-context-94.sql",
    source: "../../../src/infrastructure/adapters/outbound/sqlite/schema/magic-context.ts",
    title: "tests/support/sessions/magic-context-94.sql (Magic Context 0.45.0, format 94)",
    tables: magicContext.TABLES,
  },
] as const

describe("store schemas", () => {
  for (const schema of SCHEMAS)
    it(`${schema.source.split("/").at(-1)} is exactly what scripts/schema.ts generates from its fixture`, () => {
      expect(read(schema.source)).toBe(generate(read(schema.fixture), schema.title))
    })

  for (const schema of SCHEMAS)
    it(`${schema.source.split("/").at(-1)} names every table and column its fixture creates`, () => {
      const expected = tablesOf(read(schema.fixture)).map((table) => [table.name, table.columns.map((column) => column.name)])
      const actual = Object.values(schema.tables).map((table) => [getTableName(table), Object.keys(getTableColumns(table))])
      expect(actual).toEqual(expected)
    })
})
