import { Schema } from "effect"

export const ClipboardEntry = Schema.Struct({
  value: Schema.String,
  recorded: Schema.String,
  filePath: Schema.String,
})

export type ClipboardEntry = Schema.Schema.Type<typeof ClipboardEntry>

export const ClipboardHistory = Schema.Struct({
  clipboardHistory: Schema.Array(ClipboardEntry),
})

export type ClipboardHistory = Schema.Schema.Type<typeof ClipboardHistory>
