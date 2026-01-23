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
