import type { ClipboardEntry } from "../../src/types"
import { Effect, Schema, ConfigError } from "effect"

import { HistoryReadError, HistoryWriteError, ClipboardCopyError } from "../../src/errors"
import { ClipboardService } from "../../src/services/clipboard-service"
import { HistoryService } from "../../src/services/history-service"
import { isImageEntry } from "../../src/types"
export type { ClipboardEntry } from "../../src/types"

export class FzfError extends Schema.TaggedError<FzfError>()("FzfError", {
  message: Schema.String,
}) {}

export class InvalidImagePathError extends Schema.TaggedError<InvalidImagePathError>()(
  "InvalidImagePathError",
  {
    filePath: Schema.String,
    imagesDirPath: Schema.String,
    message: Schema.String,
  },
) {}

export type EntriesPage = {
  readonly entries: ReadonlyArray<ClipboardEntry>
  readonly nextCursor: number | null
}

/**
 * Filters clipboard entries using fzf's fuzzy matching algorithm.
 * Falls back to substring matching if fzf is not available.
 */
const fzfFilter = Effect.fn("fzfFilter")(function* (
  query: string,
  entries: ReadonlyArray<ClipboardEntry>,
) {
  // Empty query - return all entries
  if (!query.trim()) {
    return entries
  }

  // Try to use fzf for fuzzy matching
  return yield* Effect.gen(function* () {
    const proc = Bun.spawn(["fzf", "--filter", query, "-i", "--read0", "--print0"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })

    // Write entries to stdin (NUL-delimited for multi-line support)
    const input = entries.map((e) => e.value).join("\0")
    yield* Effect.tryPromise({
      try: async () => {
        await proc.stdin.write(input)
        await proc.stdin.end()
      },
      catch: (error) =>
        new FzfError({
          message: `Failed to write to fzf stdin: ${String(error)}`,
        }),
    })

    // Read stdout concurrently with waiting for process to exit
    const [stdoutResult, exitCode] = yield* Effect.all([
      Effect.tryPromise({
        try: async () => Bun.readableStreamToArrayBuffer(proc.stdout),
        catch: (error) =>
          new FzfError({
            message: `Failed to read fzf stdout: ${String(error)}`,
          }),
      }).pipe(Effect.map((ab) => Buffer.from(ab))),
      Effect.tryPromise({
        try: async () => proc.exited,
        catch: (error) =>
          new FzfError({
            message: `Failed to wait for fzf process: ${String(error)}`,
          }),
      }),
    ])

    // Exit code 2 = fzf error, exit code 1 = no matches (normal). Only fallback on actual errors
    if (exitCode === 2) {
      yield* Effect.log("fzf not available, falling back to substring search")
      const lowerQuery = query.toLowerCase()
      return entries.filter((e) => e.value.toLowerCase().includes(lowerQuery))
    }

    const output = stdoutResult.toString("utf-8")
    const matchedValues = output.split("\0").filter((v) => v.length > 0)

    // Map matched values back to entries in fzf-ranked order.
    const entriesByValue = new Map<string, ClipboardEntry[]>()
    for (const entry of entries) {
      const existing = entriesByValue.get(entry.value)
      if (existing) {
        existing.push(entry)
      } else {
        entriesByValue.set(entry.value, [entry])
      }
    }

    const matchedEntries: ClipboardEntry[] = []
    for (const value of matchedValues) {
      const bucket = entriesByValue.get(value)
      if (bucket) {
        matchedEntries.push(...bucket)
      }
    }

    return matchedEntries
  }).pipe(
    Effect.catchTag("FzfError", (err) =>
      Effect.gen(function* () {
        yield* Effect.log("fzf error, falling back to substring search", { error: err.message })
        const lowerQuery = query.toLowerCase()
        return entries.filter((e) => e.value.toLowerCase().includes(lowerQuery))
      }),
    ),
  )
})

export const getEntries = (
  cursor?: number,
  limit: number = 50,
): Effect.Effect<EntriesPage, HistoryReadError | HistoryWriteError> =>
  Effect.gen(function* () {
    const historyService = yield* HistoryService
    const history = yield* historyService.read()

    let entries = history.clipboardHistory

    if (cursor !== undefined) {
      entries = entries.slice(cursor)
    }

    const hasMore = entries.length > limit
    const resultEntries = entries.slice(0, limit)
    const nextCursor = hasMore ? (cursor ?? 0) + limit : null

    return {
      entries: resultEntries,
      nextCursor,
    }
  }).pipe(Effect.provide(HistoryService.Default))

export const searchEntries = (
  query: string,
  cursor?: number,
  limit: number = 50,
): Effect.Effect<EntriesPage, HistoryReadError | HistoryWriteError | FzfError> =>
  Effect.gen(function* () {
    const historyService = yield* HistoryService
    const history = yield* historyService.read()

    // Use fzf for fuzzy matching (with fallback to substring search)
    let entries = yield* fzfFilter(query, history.clipboardHistory)

    if (cursor !== undefined) {
      entries = entries.slice(cursor)
    }

    const hasMore = entries.length > limit
    const resultEntries = entries.slice(0, limit)
    const nextCursor = hasMore ? (cursor ?? 0) + limit : null

    return {
      entries: resultEntries,
      nextCursor,
    }
  }).pipe(Effect.provide(HistoryService.Default))

export const copyToClipboard = (
  entry: ClipboardEntry,
): Effect.Effect<
  void,
  InvalidImagePathError | HistoryWriteError | ConfigError.ConfigError | ClipboardCopyError
> =>
  Effect.gen(function* () {
    if (isImageEntry(entry)) {
      const historyService = yield* HistoryService
      const imagesDirPath = historyService.imagesDirPath

      // Validate filePath is within the images directory (security check)
      if (!entry.filePath.startsWith(imagesDirPath)) {
        return yield* Effect.fail(
          new InvalidImagePathError({
            filePath: entry.filePath,
            imagesDirPath,
            message: `Invalid image path: ${entry.filePath} is not within ${imagesDirPath}`,
          }),
        )
      }

      yield* ClipboardService.copyImage(entry.filePath)
    } else {
      yield* ClipboardService.copyText(entry.value)
    }
  }).pipe(Effect.provide(HistoryService.Default), Effect.provide(ClipboardService.Default))
