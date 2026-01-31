import { Effect, Schema } from "effect"

import { HistoryWriteError } from "../errors"
import { TextEntry, ImageEntry, EntryId, IsoDateString, AbsolutePath, ImageHash } from "../types"

const decodeEntryField = <A, I>(
  schema: Schema.Schema<A, I>,
  value: I,
  fieldName: string,
): Effect.Effect<A, HistoryWriteError> =>
  Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(
      (error) =>
        new HistoryWriteError({ message: `Failed to decode ${fieldName}: ${String(error)}` }),
    ),
  )

export const createTextEntry = (value: string, id: string, recorded: string) =>
  Effect.gen(function* () {
    const decodedId = yield* decodeEntryField(EntryId, id, "entry ID")
    const decodedRecorded = yield* decodeEntryField(IsoDateString, recorded, "recorded date")
    const entry = { _tag: "TextEntry" as const, id: decodedId, value, recorded: decodedRecorded }
    return yield* decodeEntryField(TextEntry, entry, "text entry")
  })

export const createImageEntry = (
  value: string,
  id: string,
  recorded: string,
  filePath: string,
  hash: string,
) =>
  Effect.gen(function* () {
    const decodedId = yield* decodeEntryField(EntryId, id, "entry ID")
    const decodedRecorded = yield* decodeEntryField(IsoDateString, recorded, "recorded date")
    const decodedPath = yield* decodeEntryField(AbsolutePath, filePath, "image path")
    const decodedHash = yield* decodeEntryField(ImageHash, hash, "image hash")
    const entry = {
      _tag: "ImageEntry" as const,
      id: decodedId,
      value,
      recorded: decodedRecorded,
      filePath: decodedPath,
      hash: decodedHash,
    }
    return yield* decodeEntryField(ImageEntry, entry, "image entry")
  })
