import { Schema } from "effect"

// ============================================================================
// Branded Types
// ============================================================================

export const EntryId = Schema.UUID.pipe(Schema.brand("@Kopa/EntryId"))
export type EntryId = Schema.Schema.Type<typeof EntryId>

export const ImageHash = Schema.String.pipe(
  Schema.pattern(/^[a-f0-9]{64}$/),
  Schema.brand("@Kopa/ImageHash"),
)
export type ImageHash = Schema.Schema.Type<typeof ImageHash>

// ============================================================================
// Strict Validation Patterns
// ============================================================================

export const IsoDateString = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/),
  Schema.brand("@Kopa/IsoDate"),
)
export type IsoDateString = Schema.Schema.Type<typeof IsoDateString>

export const HexColor = Schema.String.pipe(
  Schema.pattern(/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/),
  Schema.brand("@Kopa/HexColor"),
)
export type HexColor = Schema.Schema.Type<typeof HexColor>

export const AbsolutePath = Schema.String.pipe(
  Schema.pattern(/^\/.*$/),
  Schema.brand("@Kopa/AbsolutePath"),
)
export type AbsolutePath = Schema.Schema.Type<typeof AbsolutePath>

// ============================================================================
// Clipboard Entry Types (Discriminated Union)
// ============================================================================

export const TextEntry = Schema.Struct({
  _tag: Schema.Literal("TextEntry"),
  id: EntryId,
  value: Schema.String.pipe(Schema.minLength(1)),
  recorded: IsoDateString,
})

export type TextEntry = Schema.Schema.Type<typeof TextEntry>

export const ImageEntry = Schema.Struct({
  _tag: Schema.Literal("ImageEntry"),
  id: EntryId,
  value: Schema.String.pipe(Schema.minLength(1)),
  recorded: IsoDateString,
  filePath: AbsolutePath,
  hash: ImageHash,
})

export type ImageEntry = Schema.Schema.Type<typeof ImageEntry>

export const ClipboardEntry = Schema.Union(TextEntry, ImageEntry)
export type ClipboardEntry = Schema.Schema.Type<typeof ClipboardEntry>

// ============================================================================
// Type Guards
// ============================================================================

export const isTextEntry = (entry: ClipboardEntry): entry is TextEntry => entry._tag === "TextEntry"

export const isImageEntry = (entry: ClipboardEntry): entry is ImageEntry =>
  entry._tag === "ImageEntry"

// ============================================================================
// Clipboard History
// ============================================================================

export const ClipboardHistory = Schema.Struct({
  clipboardHistory: Schema.Array(ClipboardEntry),
})

export type ClipboardHistory = Schema.Schema.Type<typeof ClipboardHistory>
