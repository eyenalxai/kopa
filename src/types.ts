import { Schema } from "effect"

export const ClipboardEntryType = Schema.Literal("text", "image")
export type ClipboardEntryType = typeof ClipboardEntryType.Type

// Branded types for type safety across service boundaries
export const EntryId = Schema.UUID.pipe(Schema.brand("@Kopa/EntryId"))
export type EntryId = Schema.Schema.Type<typeof EntryId>

export const ImageHash = Schema.String.pipe(Schema.pattern(/^[a-f0-9]{64}$/)).pipe(
  Schema.brand("@Kopa/ImageHash"),
)
export type ImageHash = Schema.Schema.Type<typeof ImageHash>

export const ClipboardEntry = Schema.Struct({
  type: ClipboardEntryType,
  value: Schema.String,
  recorded: Schema.String,
  filePath: Schema.String,
})

export type ClipboardEntry = Schema.Schema.Type<typeof ClipboardEntry>

export const ClipboardHistory = Schema.Struct({
  clipboardHistory: Schema.Array(ClipboardEntry),
})

export type ClipboardHistory = Schema.Schema.Type<typeof ClipboardHistory>
