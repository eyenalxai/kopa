import type { ClipboardEntry } from "../../src/types"
import { Effect } from "effect"

import { ClipboardService } from "../../src/services/clipboard-service"
import { HistoryService } from "../../src/services/history-service"
export type { ClipboardEntry } from "../../src/types"

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
    yield* Effect.promise(async () => {
      await proc.stdin.write(input)
      await proc.stdin.end()
    })

    // Read stdout concurrently with waiting for process to exit
    const [stdoutResult, exitCode] = yield* Effect.all([
      Effect.tryPromise({
        try: async () => Bun.readableStreamToArrayBuffer(proc.stdout),
        catch: (error) => new Error(`Failed to read fzf stdout: ${String(error)}`),
      }).pipe(Effect.map((ab) => Buffer.from(ab))),
      Effect.promise(async () => proc.exited),
    ])

    // If fzf failed (non-zero exit code), fall back to substring matching
    if (exitCode !== 0) {
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
    Effect.catchAll(() =>
      Effect.gen(function* () {
        yield* Effect.log("fzf error, falling back to substring search")
        const lowerQuery = query.toLowerCase()
        return entries.filter((e) => e.value.toLowerCase().includes(lowerQuery))
      }),
    ),
  )
})

export type EntriesPage = {
  readonly entries: ReadonlyArray<ClipboardEntry>
  readonly nextCursor: number | null
}

const describeError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  try {
    return JSON.stringify(error)
  } catch {
    return "Unknown error"
  }
}

export const getEntries = (
  cursor?: number,
  limit: number = 50,
): Effect.Effect<EntriesPage, Error> =>
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
  }).pipe(
    Effect.provide(HistoryService.Default),
    Effect.mapError((error) => new Error(`Failed to read history: ${describeError(error)}`)),
  )

export const searchEntries = (
  query: string,
  cursor?: number,
  limit: number = 50,
): Effect.Effect<EntriesPage, Error> =>
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
  }).pipe(
    Effect.provide(HistoryService.Default),
    Effect.mapError((error) => new Error(`Failed to read history: ${describeError(error)}`)),
  )

export const copyToClipboard = (entry: ClipboardEntry): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    if (entry.type === "image") {
      const historyService = yield* HistoryService
      const imagesDirPath = historyService.imagesDirPath

      // Validate filePath is within the images directory (security check)
      if (!entry.filePath.startsWith(imagesDirPath)) {
        return yield* Effect.fail(
          new Error(`Invalid image path: ${entry.filePath} is not within ${imagesDirPath}`),
        )
      }

      yield* ClipboardService.copyImage(entry.filePath)
    } else {
      yield* ClipboardService.copyText(entry.value)
    }
  }).pipe(
    Effect.provide(HistoryService.Default),
    Effect.provide(ClipboardService.Default),
    Effect.mapError((error) => new Error(`Failed to copy to clipboard: ${describeError(error)}`)),
  )
