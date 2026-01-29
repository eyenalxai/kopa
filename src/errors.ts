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
