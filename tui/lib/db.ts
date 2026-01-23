import { homedir } from "node:os"
import { join } from "node:path"

import { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { Effect, Schema } from "effect"

export const dbPath = join(homedir(), ".local/share/kopa/kopa.db")

export const SqlLive = SqliteClient.layer({
  filename: dbPath,
  readonly: true,
})

export class ClipboardEntry extends Schema.Class<ClipboardEntry>("ClipboardEntry")({
  id: Schema.Number,
  content_type: Schema.String,
  created_at: Schema.Number,
}) {}

export class TextEntry extends Schema.Class<TextEntry>("TextEntry")({
  entry_id: Schema.Number,
  content: Schema.String,
}) {}

export class ImageEntry extends Schema.Class<ImageEntry>("ImageEntry")({
  entry_id: Schema.Number,
  content: Schema.Uint8Array,
  mime_type: Schema.String,
}) {}

export type TextEntryRow = {
  readonly id: number
  readonly content: string
  readonly created_at: number
}

const toFtsQuery = (query: string): string => {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0)
  return terms.map((term) => `${term}*`).join(" ")
}

export const getTextEntries = () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql<TextEntryRow>`
      SELECT ce.id, te.content, ce.created_at
      FROM clipboard_entries ce
      JOIN text_entries te ON ce.id = te.entry_id
      ORDER BY ce.created_at DESC
    `
  })

export const searchTextEntries = (query: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 3) {
      return yield* sql<TextEntryRow>`
        SELECT ce.id, te.content, ce.created_at
        FROM clipboard_entries ce
        JOIN text_entries te ON ce.id = te.entry_id
        WHERE te.content LIKE ${`%${trimmedQuery}%`}
        ORDER BY ce.created_at DESC
      `
    }

    const ftsQuery = toFtsQuery(trimmedQuery)
    const ftsResults = yield* sql<TextEntryRow>`
      SELECT ce.id, te.content, ce.created_at
      FROM clipboard_entries ce
      JOIN text_entries te ON ce.id = te.entry_id
      JOIN text_entries_fts fts ON te.entry_id = fts.rowid
      WHERE text_entries_fts MATCH ${ftsQuery}
      ORDER BY bm25(text_entries_fts), ce.created_at DESC
    `
    if (ftsResults.length > 0) {
      return ftsResults
    }

    return yield* sql<TextEntryRow>`
      SELECT ce.id, te.content, ce.created_at
      FROM clipboard_entries ce
      JOIN text_entries te ON ce.id = te.entry_id
      WHERE te.content LIKE ${`%${trimmedQuery}%`}
      ORDER BY ce.created_at DESC
    `
  })
