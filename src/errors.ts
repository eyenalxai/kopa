import { Schema } from "effect"

export class ClipboardCopyError extends Schema.TaggedError<ClipboardCopyError>()(
  "ClipboardCopyError",
  {
    message: Schema.String,
  },
) {}

export class HistoryReadError extends Schema.TaggedError<HistoryReadError>()("HistoryReadError", {
  message: Schema.String,
}) {}

export class HistoryWriteError extends Schema.TaggedError<HistoryWriteError>()(
  "HistoryWriteError",
  {
    message: Schema.String,
  },
) {}

export class SharpLoadError extends Schema.TaggedError<SharpLoadError>()("SharpLoadError", {
  message: Schema.String,
  path: Schema.optional(Schema.String),
}) {}

export class FileSizeExceeded extends Schema.TaggedError<FileSizeExceeded>()("FileSizeExceeded", {
  message: Schema.String,
  sizeBytes: Schema.Number,
  maxBytes: Schema.Number,
}) {}
